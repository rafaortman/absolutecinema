#!/usr/bin/env python3
"""Atualiza a disponibilidade de streaming BR (flatrate) direto no data/movies.json.

Fonte: TMDB /movie/{id}/watch/providers -> results.BR.flatrate, normalizado com as
mesmas regras do filmcurator. Escreve streaming.subscription e streaming.checkedAt
no lugar, sem tocar em mais nada (o absolutecinema é a fonte da verdade).

Uso:
  python scripts/refresh_streaming.py             # atualiza todo o catálogo
  python scripts/refresh_streaming.py --limit 20  # só os 20 primeiros (teste)
  python scripts/refresh_streaming.py --resume    # pula os já checados hoje (retomar)
  python scripts/refresh_streaming.py --dry-run   # não grava nada, só o resumo
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "movies.json")
API = "https://api.themoviedb.org/3"
TODAY = date.today().isoformat()

# console do Windows quebra em acentos; força UTF-8 na saída
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def load_key():
    env = os.path.join(ROOT, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            line = line.strip()
            if line.startswith("TMDB_API_KEY"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("TMDB_API_KEY não encontrada em .env")


KEY = load_key()

# ---- normalização de provedores (espelha filmcurator/enrich.py) ----
PROVIDER_ALIAS = {
    "Max": "HBO Max",                 # Max voltou a se chamar HBO Max (2025)
    "Disney Plus": "Disney+",
    "MGM Plus": "MGM+",
    "Filmelier Plus": "Filmelier+",
    "Claro video": "Claro tv+",
    "Lionsgate+s": "Lionsgate+",
}
PROVIDER_DROP = {"Sun Nxt"}           # serviço indiano, não opera no BR


def norm_provider(name):
    n = name.replace(" Amazon Channel", "").replace(" Apple TV Channel", "")
    n = n.replace("Amazon Prime Video", "Prime Video").replace("Prime Video with Ads", "Prime Video")
    n = n.replace("Paramount Plus", "Paramount+").replace("Paramount+ Amazon Channel", "Paramount+")
    n = n.replace("Standard with Ads", "").replace(" Premium", "").strip()
    n = PROVIDER_ALIAS.get(n, n)
    return "" if n in PROVIDER_DROP else n


def get(path):
    url = f"{API}{path}?{urllib.parse.urlencode({'api_key': KEY})}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 3:
                raise
            time.sleep(1 + attempt)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)


def providers_br(movie_id):
    d = get(f"/movie/{movie_id}/watch/providers")
    if d is None:
        return None
    flat = d.get("results", {}).get("BR", {}).get("flatrate", [])
    return sorted({n for p in flat if (n := norm_provider(p.get("provider_name", "")))})


def save(movies):
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(movies, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="processa só os N primeiros filmes")
    ap.add_argument("--resume", action="store_true", help="pula os já checados hoje")
    ap.add_argument("--dry-run", action="store_true", help="não grava, só imprime o resumo")
    args = ap.parse_args()

    movies = json.load(open(DATA, encoding="utf-8"))
    todo = movies[:args.limit] if args.limit else movies
    total = len(todo)
    changed = failed = skipped = 0

    for i, m in enumerate(todo, 1):
        st = m.setdefault("streaming", {"country": "BR", "checkedAt": None, "subscription": []})
        if args.resume and st.get("checkedAt") == TODAY:
            skipped += 1
            continue
        try:
            plats = providers_br(m["id"])
        except Exception as e:
            failed += 1
            print(f"  ! {m['id']} erro: {e}", file=sys.stderr)
            continue
        if plats is None:
            failed += 1
            print(f"  ! {m['id']} não encontrado no TMDB", file=sys.stderr)
            continue
        if plats != st.get("subscription"):
            changed += 1
        st["country"] = "BR"
        st["subscription"] = plats
        st["checkedAt"] = TODAY
        if i % 50 == 0:
            print(f"  {i}/{total}  (alterados {changed}, falhas {failed})")
        if not args.dry_run and i % 100 == 0:
            save(movies)
        time.sleep(0.25)  # gentil com a API

    print(f"\nProcessados: {total - skipped} de {total}  | alterados: {changed}  | "
          f"falhas: {failed}  | pulados: {skipped}")
    if args.dry_run:
        print("DRY-RUN: nada foi gravado.")
        return
    save(movies)
    print(f"Gravado: {os.path.relpath(DATA, ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrompido — rode de novo com --resume para continuar", file=sys.stderr)
        raise SystemExit(130)
