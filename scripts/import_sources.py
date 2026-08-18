#!/usr/bin/env python3
"""Normaliza FilmCurator + FilmFestivals no catálogo do Absolute Cinema."""

import argparse
import json
import re
import sys
from pathlib import Path


def read_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def read_curator(path):
    text = path.read_text(encoding="utf-8")
    match = re.fullmatch(r"\s*window\.DB\s*=\s*(.*);\s*", text, re.DOTALL)
    if not match:
        raise ValueError(f"Formato inesperado em {path}")
    return json.loads(match.group(1))


def countries(value):
    return [part.strip() for part in (value or "").split("/") if part.strip()]


def ranking_records(movie):
    return [
        {"source": source, "position": position}
        for source, position in sorted(movie.get("ranks", {}).items())
    ]


def award_records(movie):
    return [
        {
            "festival": award["festival"],
            "category": award["categoria"],
            "awardYear": award["ano"],
            "recipient": award.get("premiado") or None,
            "isGate": bool(award.get("portao")),
        }
        for award in movie.get("premios", [])
    ]


def from_curator(movie):
    return {
        "id": int(movie["id"]),
        "imdbId": movie.get("imdb_id") or None,
        "title": {"pt": movie.get("titlePt") or None, "original": movie.get("titleOrig") or None},
        "releaseYear": movie.get("year"),
        "director": movie.get("director") or None,
        "countries": [movie["country"]] if movie.get("country") else [],
        "duration": movie.get("duration"),
        "genres": movie.get("genres", []),
        "posterPath": movie.get("poster") or None,
        "overview": movie.get("overview") or None,
        "streaming": {
            "country": "BR",
            "checkedAt": movie.get("streamingCheckedAt") or None,
            "subscription": movie.get("platforms", []),
        },
        "rankings": ranking_records(movie),
        "awards": [],
    }


def merge_festival(target, movie):
    # O enriquecimento do Festivals é mais novo e representa coproduções.
    target.update({
        "imdbId": movie.get("imdb_id") or target["imdbId"],
        "title": {
            "pt": movie.get("titulo_pt") or target["title"]["pt"],
            "original": movie.get("titulo_orig") or target["title"]["original"],
        },
        "releaseYear": movie.get("ano_lancamento") or target["releaseYear"],
        "director": movie.get("diretor_tmdb") or movie.get("diretor_lista") or target["director"],
        "countries": countries(movie.get("pais")) or target["countries"],
        "duration": movie.get("duracao") or target["duration"],
        "genres": movie.get("generos") or target["genres"],
        "posterPath": movie.get("poster_path") or target["posterPath"],
        "overview": movie.get("sinopse") or target["overview"],
        "streaming": {
            "country": "BR",
            "checkedAt": movie.get("streaming_checked_at") or target["streaming"]["checkedAt"],
            "subscription": movie.get("streaming", []),
        },
        "awards": award_records(movie),
    })


def validate(movies):
    ids = [movie["id"] for movie in movies]
    if len(ids) != len(set(ids)):
        raise ValueError("O catálogo contém TMDB IDs duplicados")
    for movie in movies:
        if not movie["title"]["pt"] and not movie["title"]["original"]:
            raise ValueError(f"Filme {movie['id']} não possui título")
        for ranking in movie["rankings"]:
            if not isinstance(ranking["position"], int) or ranking["position"] < 1:
                raise ValueError(f"Posição inválida no filme {movie['id']}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--curator", type=Path, required=True)
    parser.add_argument("--festivals", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    curator = read_curator(args.curator / "data.js")
    festivals = read_json(args.festivals / "data" / "filmes.json")

    by_id = {int(movie["id"]): from_curator(movie) for movie in curator["movies"]}
    curator_ids = set(by_id)
    for movie in festivals:
        movie_id = int(movie["tmdb_id"])
        if movie_id not in by_id:
            by_id[movie_id] = from_curator({
                "id": movie_id,
                "imdb_id": "",
                "titlePt": "",
                "titleOrig": "",
                "platforms": [],
                "ranks": {},
                "genres": [],
            })
        merge_festival(by_id[movie_id], movie)

    movies = sorted(by_id.values(), key=lambda movie: (
        (movie["title"]["pt"] or movie["title"]["original"]).casefold(), movie["id"]
    ))
    validate(movies)

    festival_ids = {int(movie["tmdb_id"]) for movie in festivals}
    print(f"FilmCurator: {len(curator_ids)} filmes")
    print(f"FilmFestivals: {len(festival_ids)} filmes")
    print(f"Interseção: {len(curator_ids & festival_ids)} filmes")
    print(f"Catálogo unificado: {len(movies)} filmes")

    if args.check:
        return
    root = Path(__file__).resolve().parents[1]
    data_dir = root / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "movies.json").write_text(
        json.dumps(movies, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (data_dir / "sources.json").write_text(
        json.dumps(curator["sources"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"erro: {error}", file=sys.stderr)
        raise SystemExit(1)

