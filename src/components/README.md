# Components

`Navbar` and `Footer` localize the site frame. `Navbar.alternateHref` accepts a real counterpart URL. `Layout` is under `../layouts`. Existing large homepage/booking components are grouped by user flow; avoid mixing unrelated changes into article work.

Article UI: `ArticlePage` renders metadata/body/CTA; `ArticleIndex` lists one language; `ApostilleHub` links document-specific guides; `ArticleRelated` adds locale-matched reading paths; `ArticleReferences` opens cited source disclosures; `ArticleDisclaimer` supplies the localized notice. `KnowledgeHighlights` links both homepages to the guides.

Shared article styles remain in `../styles/global.css`; component-only additions use scoped CSS and logical spacing properties.

```text
ArticlePage → ArticleRelated / ArticleDisclaimer / ArticleReferences
ArticleIndex / ApostilleHub → localized discovery
KnowledgeHighlights → homepage entry points
```
