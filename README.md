# Absolute Cinema

Catálogo único para descobrir e sortear filmes, reunindo listas críticas e
premiações. Originou-se dos projetos [FilmCurator](https://github.com/rafaortman/filmcurator)
e [FilmFestivals](https://github.com/rafaortman/filmfestivals), mas **é autocontido**:
os dados vivem aqui em `data/` e este repositório não depende dos outros para rodar
ou atualizar.

As listas críticas e as premiações continuam sendo sinais editoriais diferentes:

- listas têm posição e podem formar um ranking de consenso;
- premiações registram vitórias factuais, sem atribuir pontos;
- o filme, identificado pelo ID do TMDB, é a entidade compartilhada.

## Estado atual

Oferece as visões **Listas** e **Premiações**, filtros próprios, plataformas
múltiplas persistentes, favoritos e sorteio com link compartilhável. O catálogo
canônico é `data/movies.json` (fonte da verdade); os créditos das listas ficam em
`data/sources.json`.

Para abrir localmente:

```bash
python3 -m http.server 8000
```

## Atualizar a disponibilidade de streaming (BR)

`data/movies.json` guarda, por filme, os serviços de assinatura no Brasil e a data da
última checagem. Para atualizar direto no catálogo:

```bash
python3 scripts/refresh_streaming.py
```

Consulta o TMDB (`/movie/{id}/watch/providers`, BR flatrate — dados do JustWatch),
normaliza os nomes dos provedores e grava `streaming.subscription`/`checkedAt` no
lugar. A data no rodapé do app deriva desse `checkedAt`, então atualiza sozinha.
Requer `TMDB_API_KEY` num arquivo `.env` local (ignorado pelo git). Opções úteis:
`--dry-run` (não grava), `--limit N` (testa), `--resume` (retoma pulando os já
checados hoje).

## Decisões de produto

Consulte [`docs/architecture.md`](docs/architecture.md) para o modelo de dados e as
regras que a interface deverá preservar.
