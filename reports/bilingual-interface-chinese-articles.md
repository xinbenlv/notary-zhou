# Bilingual interface with Chinese-only articles

The user clarified on 2026-09-15 that the English interface must remain available.
Only article titles, descriptions and bodies lack English translations. The
previous removal of interface controls and English appointment guidance was too
broad; this correction restores the interface without restoring English articles.

## Behavior

- English homepage navigation, appointment preparation and article discovery
  remain English. Guide links identify that article content is Chinese.
- On article, directory, topic and glossary pages, English / 中文 switches the
  interface on the current path. `?ui=en` selects English; `?ui=zh` or no override
  selects Chinese. The switch preserves the current citation anchor.
- Navigation, directory labels, buttons and footer follow the interface choice.
  Article titles, descriptions and body text remain Chinese in both modes.
- Article and glossary links carry the selected interface onward. Pure citation
  anchors, external sources and contact links retain their original targets.
- The interface requires JavaScript for English labels on editorial pages; the
  complete Chinese content and its links are rendered statically. No cookies or
  browser storage are used for the interface preference.
- Canonical article URLs and the sitemap remain query-free and Chinese-only.
  No English article hreflang or translated article routes are recreated; old
  `/en/articles` URLs still return 410.

## Verification and publication

Local verification passed on 2026-09-15:

- Build and all 33 Chinese article/directory routes passed content and SEO
  checks, including both interface controls and query-free canonical URLs.
- 27 regression tests passed: 13 article/interface cases and 14 Analytics and
  public-record cases. The guards now allow English appointment/FAQ interface
  while continuing to reject English article output and hreflang.
- Browser: English topic directory → Chinese article in English UI → expanded
  official-source citation → Chinese UI on the same article and citation hash.
  English appointment preparation and Chinese-article entry links also passed.
- Browser preview used the built static pages. The local full-server attempt
  timed out downloading the unrelated government notary directory; that backend
  was not changed. Full production routes will be verified after deployment.
- The daily reporting automation now explicitly preserves bilingual UI while
  treating article content as Chinese-only and grouping interface variants by
  their canonical page where appropriate.

The corrected release is ready locally; production publication and verification
are pending. Its deployment will use the existing Railway production service.
