# Chinese-only editorial content

Historical withdrawal release. The user's clarification preserves bilingual UI;
see [the current interface policy](bilingual-interface-chinese-articles.md).
Removal of English article translations still applies, while the interface
restrictions recorded below were too broad and are superseded.

On 2026-09-15 the user directed that FAQ, guides and articles be created and
published only in Chinese. This supersedes the earlier bilingual guide release.
Global Google Search exposure remains a goal; it does not require publishing
English articles. The separate English service, privacy, verification and
public-record pages remain available.

## Changes

- Remove all ten English article sources, their directory and apostille topic
  routes, their sitemap, and nine English-specific cover files.
- Preserve the 31 Chinese article sources and their artwork byte-for-byte.
- Publish one Chinese article sitemap containing 31 articles plus the directory
  and apostille topic hub (33 URLs). No English article alternates are emitted.
- Return HTTP 410 for `/en/articles` and descendants, including the withdrawn
  English sitemap. Do not block crawling in robots.txt: crawlers must be able
  to see the removal. A 410 does not prove a URL has already left Google's index.
- Remove the English homepage's guide highlights and FAQ/instruction content.
  Clean navigation and footer links; any English-site link to a Chinese guide
  identifies its language. Fix the pre-existing Chinese FAQ links that pointed
  at a missing `#faq` section by using the Chinese article directory.
- Enforce the Chinese-only content language in the collection schema and built
  article checks. The daily `/brief-me` automation follows this policy and
  labels any old English-guide traffic as historical.

## Validation and publication

Local validation passed on 2026-09-15:

- `npm run check:articles`: build, 31 article bodies and 33 Chinese editorial
  routes; citations, images, canonical URLs, links and sitemap checks passed.
- `node --test tests/article-editorial-removal.test.mjs`: five regression cases
  passed. Analytics and public-record suites also passed (14 tests).
- Production server on localhost: all 33 Chinese routes and six retained
  service/privacy/verification routes matched the build. All 13 withdrawn
  English page/sitemap URLs returned 410, with four additional HEAD checks.
- Browser inspection confirmed the Chinese topic directory has no translation
  switch and the English homepage retains its appointment section without FAQ.

## Production release

Published on 2026-09-15 from clean source archive
`074d25281bf7a0e42048bba16beb13feb328f033`. Railway deployment
[`08fd4df5-e088-4178-96bc-1e14e873c707`](https://railway.com/project/7b6fe9b2-ce31-4559-bade-5ad32b56f7f4/service/833774b6-b5f2-4925-a942-047db1cf954d?id=08fd4df5-e088-4178-96bc-1e14e873c707)
reached `SUCCESS` in the existing `site` service and `production` environment.
It replaced the earlier bilingual deployment `3cc29403-e31b-47af-be5a-6215a1149423`.

Live verification passed:

- All **33 Chinese editorial pages** return 200 and match the approved build's
  normalized content, title, H1, language and canonical. They have no article
  language alternates or links to withdrawn English guides.
- All **13 retired English page/sitemap URLs** return 410 without redirect.
- All **six retained service/privacy/verification pages** match their expected
  content and metadata; the English homepage has no FAQ block or FAQPage schema.
- The article sitemap contains exactly the 33 Chinese URLs. The root index
  includes that sitemap and excludes the withdrawn English article sitemap.
- The live Chinese topic page's mobile navigation has no English article switch.

The [machine-readable verification](chinese-only-live-verification.json) records
the public HTTP and content checks. [GuestSafe access](railway-guestsafe.md)
records successful OAuth renewal and closure of the temporary saving window.
These release records were saved after deployment and do not change its source.

GitHub `main` was rechecked before deployment and remains at
`8728837bc9fea0cb71634c37ab7d24bdc72dfc62`. The production change is live, while the
source commits remain on the local feature branch with a portable patch. No
remote push, PR or merge is claimed; unrelated unpublished checkout work was
excluded from the deployment.

Reference: [Google's removed-page guidance](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)
supports returning 404 or 410 for removed pages without a replacement at that URL.
