# Article collection

Chinese files stay at `<slug>.md`; English counterparts live at `en/<slug>.md`. Existing Chinese URLs remain `/articles/<slug>/`; English URLs are `/en/articles/<slug>/`.

Use `lang: zh|en` and the same `translationKey` on actual translation pairs. Legacy Chinese files default to `zh`, with their filename as translation key. Preserve original `pubDate`; set `updatedDate` only for substantive revisions. Drafts never enter pages or sitemaps. No empty translation stubs or mechanical city variants.

Every substantive legal/procedural claim needs a local `#ref-*` citation to an exact official source, with a verification date. Use jurisdiction-specific wording; an apostille does not prove document contents or guarantee recipient acceptance. English content does not expand the current Mandarin mobile service area.

Covers and diagrams live under `public/images/articles/`; translate text-bearing covers. Long articles may exceed 5 KB because the explanation and its source chain should remain one reviewable document. Keep sections focused and citations adjacent.

Run `npm run check:articles` after editing. It validates both languages, rendered citations, images, canonical URLs, reciprocal hreflang, article links and scoped sitemaps.

```text
articles/
├── <slug>.md       Chinese
└── en/<slug>.md    English counterparts
```
