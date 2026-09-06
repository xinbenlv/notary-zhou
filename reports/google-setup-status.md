# Google setup status — 2026-09-05 (America/Los_Angeles)

## Completed

Signed in as `zzn@zzn.im` in the Codex in-app browser.

- Search Console Domain property `notaryzhou.com`: **Ownership verified**, method Domain name provider.
- Submitted `https://www.notaryzhou.com/sitemap-index.xml` successfully. Final report shows **Success**, last read 9/5/26, discovered pages **135**. All three child sitemaps show **Success**: articles 30, notaries 100, regular pages 5. Submission, discovery and processing do not imply indexing.
- Homepage URL Inspection: **URL is on Google / Page is indexed**. Live test: **URL is available to Google / Page can be indexed**.
- Pilot profile `/en/notaries/2557299/`: Google index currently says **URL is unknown to Google**. Live test succeeds: **URL is available to Google / Page can be indexed**, with 1 valid Breadcrumbs item. No manual request-indexing action was performed.

## DNS and authentication evidence

- Target and first matching authoritative zone: `notaryzhou.com.`; no parent-zone fallback.
- Nameservers: `ns3.namefi.io.`, `ns4.namefi.io.`. Provider Namefi confirmed via public zone API.
- Created exactly one apex TXT record through the official Namefi REST API. Relative name `@`.
- Value: `google-site-verification=PTLUY4xxoV0Y0lqV4jqtwKEZQcl_On_BTkQVqoDxfhw`.
- Record ID: `01994a77-da9f-4f40-b14c-81c9f9d6b751`. API returned HTTP 200. Requested TTL 300; authoritative/recursive served TTL 60.
- Both `dig @ns3.namefi.io notaryzhou.com TXT` and `dig @8.8.8.8 notaryzhou.com TXT` returned the exact Google token and the existing redirect TXT.
- API before/after comparison confirmed every pre-existing record retained its ID/name/type/value/TTL. A/AAAA/CAA/CNAME/redirect/Railway verification records unchanged. No mail changes.
- Existing `NAMEFI_API_KEY` injected through guestsafe into one process as `NOTARY_GOOGLE_NAMEFI_KEY`. No key printed or written to scripts/chat. No new credential, principal, IAM grant, or persistent authentication config created. Existing user credential not revoked.
- Before/after public DNS inventory and create result are saved under `/tmp/notary-google-dns-{before,after,create-result}.json`.
- Completion gate passed: authoritative and recursive TXT plus Search Console ownership acceptance. Keep the verification TXT for continued ownership.
- DNS skill does not have a Namefi-specific mutation runbook; used the official documented REST API with the user-authorized existing key.

## GA4 — complete

The user personally accepted the US Analytics agreement and confirmed acceptance in chat. Existing setup resumed; no duplicate account created.

- Account: **Notary Zhou**, ID `407058872`, signed in as `zzn@zzn.im`.
- Property: **notaryzhou.com**, ID `552951052`.
- Web stream: **Notary Zhou website**, ID `15726721936`, URL `https://www.notaryzhou.com`.
- Public Measurement ID: **G-NSPEQT81PG**.
- Saved property details verified: United States / Los Angeles reporting timezone (America/Los_Angeles, including DST), USD, Small business, Law & Government, Understand web/app traffic objective.
- All four optional account sharing choices were off when account creation was submitted. Optional promotional email subscriptions were also declined.
- Enhanced measurement is **off**; stream explicitly says it measures standard Page views. No form interactions, site search, outbound clicks, custom events, advertising links or additional connected tags were enabled. Email redaction remains active.
- Shared Layout renders GoogleAnalytics once on production, non-draft, indexable pages. Loader only runs on `www.notaryzhou.com` and guards duplicate initialization. `gtag('config')` sends one automatic initial page_view; no manual page_view call.
- `page_location` and `page_referrer` remove query strings and fragments. `allow_google_signals` and `allow_ad_personalization_signals` are false. No lookup inputs, email/contact fields or custom user properties are sent.
- Actual browser DOM verified one inline initializer and exactly one external loader, `https://www.googletagmanager.com/gtag/js?id=G-NSPEQT81PG`.
- After visiting the real production `/en/` page in the browser, **GA Realtime displayed 1 active user, page_view=3, first_visit=1, session_start=1, and user_engagement events**. The page-title report included the English homepage (2 views) and Chinese homepage (1 view). These are observed totals during validation, not a claim that each view originated from the agent's single navigation.
- Home overview's historical-data onboarding message lagged; Realtime independently confirmed live data reception. No Measurement Protocol or fabricated events used.

## Production baseline and checks

- Previous production deployment confirmed before upload: `f4a7455a-0a2f-46a5-b681-ed7994cfddb0`. New production deployment: **`abf6f853-5e48-4473-bf8b-e5ebf11e676f`**, SUCCESS, created `2026-09-06T03:59:02.980Z`, image `sha256:aaddefc1d64b2c1fbe9144583eb12bf3564e5bd9f81296fe4dcf2bafb29a991b`.
- Project `7b6fe9b2-ce31-4559-bade-5ad32b56f7f4`, environment `38b82bdf-2bcd-419b-8846-e88465007ebb`, website service `833774b6-b5f2-4925-a942-047db1cf954d`.
- Worktree began clean at `8adbfc1` and contains the 24 explicitly handed-off SEO source files from `/tmp/notary-zhou-pilot-release-20260905`. 23 files retain identical SHA-256 hashes. Layout adds only the analytics import and render call; the GoogleAnalytics component is new. Original baseline manifest: `/tmp/notary-google-seo-baseline-sha256.json`.
- Original workspace, booking, design-reference, Postgres, and mail configuration not modified.
- `npm run test:notary`: 11 passed.
- `npm run check:articles`: build succeeded, all 29 article checks passed.
- Live `/tmp/notary-pilot-smoke.py`: passed. Three child sitemaps contain 100 / 30 / 5 URLs. All 100 profiles return 200 with correct canonical and Person schema. Legacy index 301; 14 legacy shards 410; non-pilot remains accessible; preview noindex retained.
- Live homepage and source inspection found no pre-existing GA/GTM tag. No consent implementation found in existing layouts/components/pages.

## Release verification and handoff

- Clean uploaded release: `/tmp/notary-google-release-20260905`, built from git archive of `8adbfc1` plus the 24 approved SEO files and the new analytics component. No original-workspace dirty files, node_modules, build outputs or secrets copied.
- Re-ran `npm run test:notary` (11 passed) and `npm run check:articles` (build + 29 articles passed) for this change.
- Executed initializer twice in an isolated JS context: one loader/config; query/hash redaction verified; advertising settings false; localhost excluded. Built homepage contains one initializer.
- **Post-deployment** live SEO smoke passed: index + 3 children; 100 canonical/Person profile pages; article/ordinary URL counts; legacy 301/410; non-pilot availability; preview noindex.
- Live homepage, English homepage, article directory and SSR profile each have exactly one initializer. Preview has zero.
- Search Console and Analytics tasks are complete. Future crawl/index timing and ranking remain Google's decision.

## Links

- Search Console: https://search.google.com/search-console?resource_id=sc-domain%3Anotaryzhou.com
- Sitemap report: https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Anotaryzhou.com
- Analytics Realtime: https://analytics.google.com/analytics/web/provision/#/a407058872p552951052/realtime/overview
- Analytics property admin: https://analytics.google.com/analytics/web/provision/#/a407058872p552951052/admin/property/settings
- Railway deployment: https://railway.com/project/7b6fe9b2-ce31-4559-bade-5ad32b56f7f4/service/833774b6-b5f2-4925-a942-047db1cf954d?id=abf6f853-5e48-4473-bf8b-e5ebf11e676f
- Google Analytics Terms: https://marketingplatform.google.com/about/analytics/terms/us/
- Google Data Processing Terms: https://privacy.google.com/businesses/processorterms/
- Ownership verification docs: https://support.google.com/webmasters/answer/9008080?hl=en
- Sitemaps docs: https://support.google.com/webmasters/answer/7451001?hl=en
- GA4 setup docs: https://support.google.com/analytics/answer/14183469?hl=en
- Namefi API: https://namefi.io/llms.txt
