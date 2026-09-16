# Components

`Navbar` and `Footer` localize the site frame. `Navbar.alternateHref` accepts a counterpart URL; `interfaceSwitch` marks an editorial interface switch. Its menu initialization is idempotent when both locale variants render. `Layout` is under `../layouts`.

Article titles, descriptions and bodies remain Chinese. `ArticlePage`, `ArticleIndex` and `ApostilleHub` use `ArticleLayout` for bilingual navigation/footer on the same canonical URL. `?ui=en` selects English interface text; `?ui=zh` or no query selects Chinese. These are interface choices, not translated articles, so they do not emit article hreflang.

`InterfaceText` takes `zh`/`en` strings for short labels (optional `class`/`testId`). `article-interface.mjs` updates these labels and propagates the interface query on article/glossary links. Article text marked `.article-body` or `data-article-content` stays unchanged. Pure hash citations and external links stay unchanged. For localized CTA destinations, set both `data-interface-href-zh` and `data-interface-href-en`. The helper uses no cookies or storage.

`ArticleRelated` adds reading paths; `ArticleReferences` opens cited disclosures; `ArticleDisclaimer` supplies the notice. `KnowledgeHighlights` links homepages to the guides. Booking preserves appointment contact and service details.

Shared article styles remain in `../styles/global.css`; component-only additions use scoped CSS and logical spacing properties.

`NotaryLookup` includes `NotaryRecordLinks`: three public-record shortcuts rendered
in the initial HTML of both lookup languages. They work without JavaScript and
identify records by commission number; inclusion does not imply recommendation,
current qualification, or affiliation. The selection rationale is in
[`reports/notary-discovery.md`](../../reports/notary-discovery.md).

```text
ArticleLayout → Navbar / Footer / article-interface.mjs
ArticlePage → ArticleRelated / ArticleDisclaimer / ArticleReferences
InterfaceText → localized labels around Chinese content
```
