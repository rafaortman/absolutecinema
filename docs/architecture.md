# Arquitetura inicial

## Princípios

1. O TMDB ID é a chave canônica do filme; IMDb ID serve como identificador auxiliar.
2. Rankings e vitórias são registros independentes. Prêmios nunca entram no cálculo
   de pontos das listas.
3. Metadados do FilmFestivals prevalecem hoje porque seu enriquecimento é mais recente
   e representa coproduções como múltiplos países.
4. Campos derivados são reconstruídos pelo importador, não editados manualmente.
5. Os repositórios de origem permanecem intactos e podem continuar publicados durante
   a construção do novo produto.

## Visões previstas

- **Descobrir:** catálogo combinado, com filtros e sorteio.
- **Listas:** posições e consenso crítico.
- **Premiações:** timeline de Cannes e Oscar, sem ranking.

## Streaming

`streaming.subscription` contém somente provedores de assinatura (`flatrate`) no
Brasil. A preferência do usuário será armazenada localmente, separada da disponibilidade
dos filmes. Um filme pertence ao recorte "minhas plataformas" quando a interseção entre
as duas coleções não é vazia.

## Favoritos

O novo app deverá migrar uma vez as chaves `filmcurator:favs` e `filmfestivals:favs`
para uma chave própria, sempre normalizando os IDs como números.

