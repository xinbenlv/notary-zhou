# Shared helpers

The public-record modules parse California listings and prepare profile data;
`sitemap.mjs` serializes URL sets. `article-interface.mjs` selects bilingual
interface text around Chinese editorial content from the URL, without storage.

```text
notary-public-listing → notary-profile
sitemap → XML route responses
article-interface → ArticleLayout / InterfaceText
```

Interface exports: `getInterfaceLanguage(url)`, `interfaceSwitchHref(url, ui)`,
`interfaceHref(href, ui, currentUrl)`, and
`initArticleInterface(document, currentUrl)`. The initializer is safe to repeat
and installs no event handlers. ArticleLayout refreshes it after hash changes so
interface switches retain the current citation or section. Chinese text and
metadata remain Chinese; only eligible navigation URLs and interface labels
change.
