#!/usr/bin/env python3
"""Adiciona os atores principais (cast) a cada filme do data/movies.json.

Fonte: TMDB /movie/{id}/credits -> cast (ordenado por 'order'), guardando os
primeiros N nomes em movie['cast']. Enriquecimento pontual (elenco não muda),
idempotente e retomável.

Uso:
  python scripts/add_cast.py             # todos os filmes
  python scripts/add_cast.py --limit 20  # só os 20 primeiros (teste)
  python scripts/add_cast.py --resume    # pula os que já têm cast
  python scripts/add_cast.py --dry-run   # não grava, só o resumo
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "movies.json")
API = "https://api.themoviedb.org/3"
TOP = 3  # atores principais por filme

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


def get(path, params=None):
    params = {**(params or {}), "api_key": KEY}
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
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


def cast_of(movie_id):
    d = get(f"/movie/{movie_id}/credits", {"language": "pt-BR"})
    if d is None:
        return None
    cast = sorted(d.get("cast", []), key=lambda c: c.get("order", 999))
    names = [c["name"] for c in cast if c.get("name")]
    return names[:TOP]


def save(movies):
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(movies, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    movies = json.load(open(DATA, encoding="utf-8"))
    todo = movies[:args.limit] if args.limit else movies
    total = len(todo)
    done = failed = skipped = empty = 0

    for i, m in enumerate(todo, 1):
        if args.resume and m.get("cast"):
            skipped += 1
            continue
        try:
            names = cast_of(m["id"])
        except Exception as e:
            failed += 1
            print(f"  ! {m['id']} erro: {e}", file=sys.stderr)
            continue
        if names is None:
            failed += 1
            continue
        m["cast"] = names
        done += 1
        if not names:
            empty += 1
        if i % 50 == 0:
            print(f"  {i}/{total}  (ok {done}, sem elenco {empty}, falhas {failed})")
        if not args.dry_run and i % 100 == 0:
            save(movies)
        time.sleep(0.25)

    print(f"\nProcessados: {total - skipped} de {total}  | com cast: {done - empty}  | "
          f"sem elenco: {empty}  | falhas: {failed}  | pulados: {skipped}")
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
