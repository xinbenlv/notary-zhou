# Chinese-only editorial content

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

Publication status: ready locally; production deployment and verification are
pending Railway OAuth renewal. The previous deployment still contains the
English articles until the replacement deployment succeeds.

Reference: [Google's removed-page guidance](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)
supports returning 404 or 410 for removed pages without a replacement at that URL.
