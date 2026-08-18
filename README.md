# Absolute Cinema

O Absolute Cinema une as curadorias do [FilmCurator](https://github.com/rafaortman/filmcurator)
e do [FilmFestivals](https://github.com/rafaortman/filmfestivals) em um só catálogo para
descobrir e sortear filmes.

As listas críticas e as premiações continuam sendo sinais editoriais diferentes:

- listas têm posição e podem formar um ranking de consenso;
- premiações registram vitórias factuais, sem atribuir pontos;
- o filme, identificado pelo ID do TMDB, é a entidade compartilhada.

## Estado atual

A primeira versão funcional oferece as visões **Listas** e **Premiações**, filtros
próprios, plataformas múltiplas persistentes, favoritos compartilhados e sorteio
independente. O importador normaliza os dois projetos sem modificá-los e produz um
catálogo canônico em `data/movies.json`.

Para abrir localmente:

```bash
python3 -m http.server 8000
```

## Gerar os dados

Clone os três repositórios no mesmo diretório e execute:

```bash
python3 scripts/import_sources.py \
  --curator ../filmcurator \
  --festivals ../filmfestivals
```

O comando também gera `data/sources.json` e exibe um resumo da junção. Para apenas
validar as fontes e o resultado, use `--check`.

## Decisões de produto

Consulte [`docs/architecture.md`](docs/architecture.md) para o modelo de dados e as
regras que a interface deverá preservar.
