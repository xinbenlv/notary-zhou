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

## Production release

Published from clean source archive `abe0e74fa8cf14ff35ead640e58e729c689b8f60`
through the existing Railway `site` service in `production`. Deployment
[`79fb0360-6c02-48f1-ad2b-f09929047789`](https://railway.com/project/7b6fe9b2-ce31-4559-bade-5ad32b56f7f4/service/833774b6-b5f2-4925-a942-047db1cf954d?id=79fb0360-6c02-48f1-ad2b-f09929047789)
reached `SUCCESS`, replacing `08fd4df5-e088-4178-96bc-1e14e873c707`.
An independent review found no blocker and confirmed all 31 Chinese Markdown
files remain byte-for-byte unchanged from the previous release.

Public verification on 2026-09-15 at 16:39 UTC passed:

- 33/33 Chinese article and directory pages match the approved build, including
  Chinese body text, bilingual interface regions, canonical URLs and metadata.
- 6/6 retained service, privacy and verification pages match their expected build.
- 13/13 retired English translation URLs still return 410 without redirect.
- 2/2 English-interface query responses retain the same canonical/content, and
  sitemap coverage matches the 33 Chinese URLs without interface-query entries.
- Live mobile browser: open the Chinese topic page's menu → switch to English
  on the same topic path. English navigation, directory labels and footer display
  correctly while article cards remain Chinese and carry English UI forward.

The [live verification record](bilingual-interface-live-verification.json)
contains the HTTP and content checks. The report and evidence were saved after
publication; they are not part of the deployed source commit. Publication used
the already-renewed GuestSafe credential; no additional login or saving window
was needed.

The production correction is live. Source commits remain in the local feature
branch and portable patch; no GitHub push, PR or merge is claimed. Unrelated
unpublished checkout changes were excluded from the deployment.
