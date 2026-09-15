# Bilingual document guide release

This release adds useful Google Search entry points for Chinese and English readers, while keeping the existing local Mandarin mobile service scope.

## Content and discovery

- Revise eight existing Chinese guides using official sources; add Chinese birth-certificate and marriage-certificate guides.
- Add ten matching English guides: apostille, birth certificate, marriage certificate, single status, same person, China power of attorney, translation, Medallion, acknowledgment/jurat and California fees.
- Preserve every existing Chinese article URL. Build 31 Chinese and 10 English articles, plus two directories and two apostille topic hubs.
- Add homepage links, localized navigation, related-reading links and exact article language switching. Only actual published pairs emit reciprocal hreflang; each language version has its own canonical.
- Each article sitemap contains only its own directory descendants. Both appear in the root sitemap index. Drafts and developer READMEs are excluded.

## Evidence and verification

Each revised guide has claim-specific local citation links, exact official references and verification dates. Sources include HCCH, California Secretary of State and the 2026 handbook, USAGov, California Courts, USCIS, SEC Investor.gov, TreasuryDirect, the U.S. State Department, Taiwan household registration authorities, the Chinese consulate in San Francisco and Santa Clara County.

The articles distinguish issuing authority, destination and recipient requirements. They do not promise document acceptance. Medallion guarantees are referred to participating financial institutions; they are not advertised as this business's service.

Validation on 2026-09-15:

- `npm run check:articles`: 41 article bodies and 45 article/directory pages passed; 10 translation pairs; citations, images, draft exclusion, internal links, self-canonical, reciprocal hreflang and both scoped sitemaps.
- `npm run test:analytics`: 3 passed. `npm run test:notary`: 11 passed.
- Browser checks: desktop topic-page language switch, mobile navigation, exact article translation URL, citation disclosure, no horizontal overflow at 390 px.
- Lighthouse local production build, mobile emulation, one run per page: homepage **100/100/100/100**; English topic hub **91/100/100/100**; English acknowledgment/jurat **100/100/100/100**; Chinese apostille **100/100/100/100** (performance/accessibility/best practices/SEO). Scores are local observations, not a live-site guarantee.
- Fixed muted-text contrast, heading hierarchy, cover aspect ratios and font stylesheet blocking found during verification. Aligned the shared footer with the reviewed notarial-act and fee rules and the public owner name.

Desktop and mobile previews are in `docs/assets/`. These use public editorial content, without customer or Analytics data.

## Release boundary

The feature commit is based on the published `main` branch. Local, unpublished booking/backend changes were excluded. Deployment must use the existing Railway service; this change does not change domains, billing, credentials or Analytics configuration.

After deployment, verify the two topic URLs and both article sitemaps on the canonical host. Track index status, Google web impressions/clicks, countries and article landing pages using the existing read-only reporting workflow. GSC URL Inspection reports Google's known index state; it does not request indexing. New pages and sitemap entries do not guarantee indexing or rankings.

Implementation note: route-directory documentation is named `_README.md` because Astro publishes ordinary Markdown under `src/pages` as routes. The collection loader separately excludes `README.md` from content.

## Production publication

Published on 2026-09-15 through the Railway CLI using the explicitly authorized
[GuestSafe login consumer](railway-guestsafe.md). The CLI uploaded only a clean
archive of source commit `4ed5cf2`, based on published `main`
`8728837bc9fea0cb71634c37ab7d24bdc72dfc62`. Local unpublished booking/backend work
and private Analytics reports were excluded. GitHub `main` was rechecked before
upload and had not changed.

- Existing project: `7b6fe9b2-ce31-4559-bade-5ad32b56f7f4`, service `site`
  (`833774b6-b5f2-4925-a942-047db1cf954d`), environment `production`
  (`38b82bdf-2bcd-419b-8846-e88465007ebb`).
- [Deployment 3cc29403](https://railway.com/project/7b6fe9b2-ce31-4559-bade-5ad32b56f7f4/service/833774b6-b5f2-4925-a942-047db1cf954d?id=3cc29403-e31b-47af-be5a-6215a1149423)
  reached `SUCCESS`. Previous successful deployment recorded before upload:
  `f96493e6-5928-4103-9525-c2dea2c9d3a4`.
- Public HTTP verification passed for all 45 article/directory URLs: HTTP 200,
  no redirects or noindex, matching title/H1/language, self-canonical, expected
  hreflang and normalized full body text equal to the approved local build.
- Both article sitemap URL sets exactly match the build; the root sitemap index
  includes both. Live mobile navigation switches to the corresponding English
  topic page.

The [machine-readable live verification](global-guide-live-verification.json)
records all page and sitemap checks. The CLI credential consumer additionally
passed independent review and fictional-fixture checks for invalid schema,
missing/expired credentials, target binding, partial-secret output suppression,
and unavailable deployment responses. These operations-only files and release
evidence were saved after publication; they are not part of source `4ed5cf2`.

The production website is live. The source branch is still local: the GitHub
connector rejected writes with HTTP 403, so no remote feature branch, PR or merge
is claimed. A portable patch and the local commits preserve the release. Direct
CLI publication does not configure a future GitHub deployment pipeline.
