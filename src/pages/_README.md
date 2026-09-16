# Routes

Chinese defaults to `/`, English service pages to `/en/`. Editorial articles, FAQ and guides are Chinese-only under `/articles/`, with self-canonical URLs and one article sitemap. The server returns HTTP 410 for withdrawn `/en/articles` URLs; do not recreate English editorial routes or translation alternates.

The interface remains bilingual. Article and glossary pages use `?ui=en` for
English navigation, buttons and footer while content stays Chinese. Their
canonical URLs omit the interface query; article hreflang remains absent.

`api/` and public-record profile routes use the existing Node middleware. `book*` and draft previews stay out of search discovery. See the root README for production serving and deployment.
