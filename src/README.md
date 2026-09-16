# Source

Astro routes live in `pages/`; reusable UI in `components/`; shared head metadata in `layouts/`. `config.ts` owns business facts. `i18n.ts` owns site language prefixes. `articles.ts` owns Chinese article and topic URLs; `content.config.ts` validates Chinese-only Markdown.

See [articles](content/articles/README.md) for editorial rules and [components](components/README.md) for rendering. Article titles, descriptions and bodies are Chinese-only; the interface remains bilingual. `ArticleLayout` and `lib/article-interface.mjs` select English UI with `?ui=en` on the same canonical Chinese article URL. The English service, privacy and public-record pages remain available.

The bilingual lookup pages also render three public-record shortcuts before any search.

Route-directory documentation uses `_README.md`, the Astro exclusion convention, so developer notes never become indexable routes.

```text
src/
├── pages/
├── components/
├── content/articles/
└── layouts/, lib/, styles/
```
