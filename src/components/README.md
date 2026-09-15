# Components

`Navbar` and `Footer` localize the service-site frame. `Navbar.alternateHref` accepts a real counterpart URL; `showLanguageSwitch={false}` hides the switch on Chinese-only editorial pages. English navigation and footer links label the Chinese guides explicitly. `Layout` is under `../layouts`.

Chinese article UI: `ArticlePage` renders metadata/body/CTA; `ArticleIndex` lists Chinese articles; `ApostilleHub` links document-specific guides; `ArticleRelated` adds reading paths; `ArticleReferences` opens cited source disclosures; `ArticleDisclaimer` supplies the notice. These pages do not emit translation hreflang. `KnowledgeHighlights` appears only on the Chinese homepage. English `Booking` retains contact and service details without the FAQ/introduction block; the Chinese introduction links to the article directory.

Shared article styles remain in `../styles/global.css`; component-only additions use scoped CSS and logical spacing properties.

```text
ArticlePage → ArticleRelated / ArticleDisclaimer / ArticleReferences
ArticleIndex / ApostilleHub → Chinese discovery
KnowledgeHighlights → Chinese homepage entry point
```
