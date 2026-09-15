# Source

Astro routes live in `pages/`; reusable UI in `components/`; shared head metadata in `layouts/`. `config.ts` owns business facts. `i18n.ts` owns site language prefixes. `articles.ts` owns article URL, translation and topic metadata; `content.config.ts` validates Markdown.

See [articles](content/articles/README.md) for editorial rules and [components](components/README.md) for rendering. New English content must not imply English-language or worldwide service.

Route-directory documentation uses `_README.md`, the Astro exclusion convention, so developer notes never become indexable routes.
