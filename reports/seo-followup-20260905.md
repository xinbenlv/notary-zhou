# SEO follow-up — September 5, 2026 (America/Los_Angeles)

## Repository and website

- Fast-forwarded `main` from `8adbfc1` to the deployed SEO/GA4 commit `48fb864` after verifying all overlapping files. Original work was backed up at `/tmp/notary-zhou-main-merge-backup-20260905`; unrelated booking and design work is unchanged.
- Pushed `main`, including `9195c87`, to https://github.com/xinbenlv/notary-zhou.
- Published Chinese `/privacy/` and English `/en/privacy/`, with canonical URLs, reciprocal language links and WebPage schema. Main and directory footers link to the notices.
- Website states that services are by appointment at agreed customer locations, with no walk-in office. No home or office street address is published.
- Initial release `e3546c35-40e3-49a4-82a5-d68895f48d66` succeeded. All 100 notary profiles passed the live canonical/Person checks; the sitemap index has 100 notary, 30 article and 7 general URLs (137 total). The two additions are privacy pages. Legacy 301/410 and preview noindex behavior passed.

## Inquiry measurement

- The homepage introduction and appointment email links send `contact_email_click`. Only the allowlisted placement (`hero` or `booking`) and fixed contact method (`email`) are sent. Correction and privacy contact links are excluded.
- The event is an inquiry click, not an email sent, a qualified lead, or a completed booking.
- GA4 property `552951052` shows the event as a key event. Created using the **with code** option, avoiding a second event derived from page views. Key-event counting is once per session, with no default monetary value. Raw event counts may include multiple clicks.
- Automated tests verify single initialization, URL/referrer query and fragment removal, allowed click targets, exclusion of contact contents, and exclusion of local/preview hosts. All 3 pass. Existing 11 notary tests and all 29 article checks also pass.
- Actual contact-event receipt remains unverified. Browser security blocked the attempted `mailto:` test navigation. No workaround or email sending was attempted. A normal user click on either homepage business-email link is needed before checking Realtime for this event.

## Four-week observation

- Thread heartbeat automation `notary-zhou-seo` is active: Saturday 10:00 local time, four occurrences, starting September 12, 2026 and ending October 3, 2026.
- It checks public site health and sitemaps, Search Console indexing/query data, organic traffic and inquiry clicks, saving reports in `reports/seo-weekly/`.
- The first 100 commission IDs remain fixed. Expansion is a later recommendation based on actual evidence; no inferred keyword volumes or DataForSEO calls.

## Google Business Profile — waiting for user confirmation

No businesses existed in the signed-in account. The new-business form has:

- Name: **Notary Zhou**.
- Type: **Service business — makes visits to customers** only; Local store and Online retail are unselected.
- Category: **Notary public**.
- Service areas: **Santa Clara County, CA; San Mateo County, CA; Alameda County, CA**.
- Public website: **https://www.notaryzhou.com/en/**.
- Phone and chat phone left blank, pending the user's preference. No home address entered.
- Optional marketing tips and surveys unchecked.

The form is at **Put your business on the map / Continue**. Continuing accepts the Google Business Profile Terms and shares app data with Google Business Manager. Browser rules require confirmation at this step; the question is pending. The business has **not** yet been created or verified. Do not create a duplicate when resuming.

If Google subsequently requires a private verification address, have the user enter their actual address directly in Google and preserve the service-only/hidden-address setting. Do not use Lakewood Park as an office or storefront address, and do not put a residential address in this repository, website, public profile or chat.

Suggested description for the later description field:

> Notary Zhou provides mobile notary public services by appointment in Santa Clara, San Mateo and Alameda counties, California. We travel to agreed locations such as homes, offices, hospitals and coffee shops. Service is available in Mandarin Chinese and English. Services include acknowledgments, jurats and eligible power-of-attorney copy certifications. Contact us to arrange a visit and confirm document and identification requirements.

This description has not been published. Hours and public phone remain unspecified. The existing website rule waives travel fees for meeting at Lakewood Park, Sunnyvale; whether the user also wants free travel within a surrounding radius is still unanswered. Do not invent a radius or publish the park as a walk-in location.

Google references:
- https://support.google.com/business/answer/2853879?hl=en
- https://support.google.com/business/answer/3038177?hl=en
- https://support.google.com/business/answer/9292476
- https://support.google.com/analytics/answer/7318509?hl=en
