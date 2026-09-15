# Scripts

`serve-static.mjs` serves the Railway production build and existing APIs. `check-articles.mjs` checks rendered Markdown, citations, images and draft exclusion in both locales. `check-article-seo.mjs` checks canonical/hreflang, internal article links and scoped sitemaps. Run them together with `npm run check:articles`.

The remaining scripts support the notary listing service, sitemap pilot selection and benchmarks; they are independent of article publication. Credentials must be injected through GuestSafe into the intended process.

```text
scripts/
├── serve-static.mjs
├── check-articles.mjs
├── check-article-seo.mjs
└── notary listing / pilot utilities
```
