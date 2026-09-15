# Tests

These Node test suites cover notary data, search discovery, privacy-conscious analytics,
and the bilingual interface around Chinese article content. They use local fixtures;
they do not call Google APIs, read credentials, or modify production.

```text
tests/
├── notary-public-listing.test.mjs   # Official-data parsing and lookup
├── notary-profile.test.mjs          # Profile routes and presentation
├── sitemap.test.mjs                 # Sitemap scope and XML escaping
├── analytics.test.mjs               # Redaction and event boundaries
├── article-editorial-removal.test.mjs # Chinese routes; retired English URLs
└── article-interface.test.mjs       # Interface language, content preservation, menu handlers
```

Run all suites with `node --test tests/*.test.mjs`. For article changes, also run
`npm run check:articles` to check actual rendered citations, images, canonical URLs,
internal links, and sitemap membership. Interface tests allow English homepage and
navigation labels while keeping article titles, descriptions, and bodies in Chinese.
