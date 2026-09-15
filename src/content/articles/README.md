# Article collection

Public FAQ, guides and articles are Chinese only. Keep article files at `<slug>.md` and public URLs at `/articles/<slug>/`. Do not create an English article directory, English counterparts or translation stubs. The website's other bilingual service and lookup pages do not change this editorial policy.

Use `lang: zh` where language metadata is explicit; legacy Chinese files default to Chinese. Existing `translationKey` metadata may remain as a stable topic identifier. Preserve original `pubDate`; set `updatedDate` only for substantive revisions. Drafts never enter pages or sitemaps. Avoid mechanical city variants.

Every substantive legal/procedural claim needs a local `#ref-*` citation to an exact official source, with a verification date. Use jurisdiction-specific wording; an apostille does not prove document contents or guarantee recipient acceptance.

Covers and diagrams live under `public/images/articles/`. Preserve Chinese covers and shared text-free illustrations; do not add English-only article artwork. Long articles may exceed 5 KB because the explanation and its source chain should remain one reviewable document. Keep sections focused and citations adjacent.

Run `npm run check:articles` after editing to validate the published Chinese collection, rendered citations, images, canonical URLs, internal links and sitemap coverage.

```text
articles/
├── <slug>.md       Chinese articles
└── README.md       Editorial policy; excluded from the collection
```
