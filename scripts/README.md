# Scripts

`serve-static.mjs` serves the Railway production build and existing APIs, and returns 410 for withdrawn English editorial URLs. `check-articles.mjs` checks Chinese rendered Markdown, citations, images and draft exclusion. `check-article-seo.mjs` enforces Chinese-only articles, valid canonicals and links, one article sitemap, and preservation of English service pages. Run them together with `npm run check:articles`.

The remaining scripts support the notary listing service, sitemap pilot selection and benchmarks; they are independent of article publication. Credentials must be injected through GuestSafe into the intended process.

Run `node --test tests/article-editorial-removal.test.mjs` for regression fixtures
covering withdrawn English pages, links, FAQ markup and retained service pages.

`railway-guestsafe.py` consumes the explicitly imported Railway login bundle and
injects its access token into the CLI for this project. It emits only selected
status fields, fails on expired OAuth, and does not implement token refresh or
read credential files. See [Railway access](../reports/railway-guestsafe.md).

```text
scripts/
├── serve-static.mjs
├── check-articles.mjs
├── check-article-seo.mjs
├── railway-guestsafe.py
└── notary listing / pilot utilities
```
