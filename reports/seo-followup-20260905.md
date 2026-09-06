# SEO follow-up — September 5, 2026 (America/Los_Angeles)

## Repository and website

- Fast-forwarded `main` from `8adbfc1` to the deployed SEO/GA4 commit `48fb864` after verifying all overlapping files. Original work was backed up at `/tmp/notary-zhou-main-merge-backup-20260905`; unrelated booking and design work is unchanged.
- Pushed `main`, including `9195c87`, to https://github.com/xinbenlv/notary-zhou.
- Published Chinese `/privacy/` and English `/en/privacy/`, with canonical URLs, reciprocal language links and WebPage schema. Main and directory footers link to the notices.
- Website states that services are by appointment at agreed customer locations, with no walk-in office. No home or office street address is published.
- Initial release `e3546c35-40e3-49a4-82a5-d68895f48d66` succeeded. All 100 notary profiles passed the live canonical/Person checks; the sitemap index has 100 notary, 30 article and 7 general URLs (137 total). The two additions are privacy pages. Legacy 301/410 and preview noindex behavior passed.

- Final website release from `344b9a1`: **5d2722b5-a163-41d4-b227-f718072ce12a**, SUCCESS, created `2026-09-06T06:24:19.562Z`. Production source checks confirm both homepage contact placements, one GA initializer per page, the revised privacy copy, and grouped directory-footer links.

## Inquiry measurement

- The homepage introduction and appointment email links send `contact_email_click`. Only the allowlisted placement (`hero` or `booking`) and fixed contact method (`email`) are sent. Correction and privacy contact links are excluded.
- The event is an inquiry click, not an email sent, a qualified lead, or a completed booking.
- GA4 property `552951052` shows the event as a key event. Created using the **with code** option, avoiding a second event derived from page views. Key-event counting is once per session, with no default monetary value. Raw event counts may include multiple clicks.
- Automated tests verify single initialization, URL/referrer query and fragment removal, allowed click targets, exclusion of contact contents, and exclusion of local/preview hosts. All 3 pass. Existing 11 notary tests and all 29 article checks also pass.
- GA4 Realtime subsequently showed **contact_email_click: 1** during verification, confirming receipt. The browser had blocked the attempted `mailto:` navigation; no workaround or email sending was attempted. The observed event is validation-period activity and is not evidence of an actual customer inquiry. The event was visible in Realtime even though the key-event panel had not yet populated.

## Four-week observation

- Thread heartbeat automation `notary-zhou-seo` is active: Saturday 10:00 local time, four occurrences, starting September 12, 2026 and ending October 3, 2026.
- It checks public site health and sitemaps, Search Console indexing/query data, organic traffic and inquiry clicks, saving reports in `reports/seo-weekly/`.
- The first 100 commission IDs remain fixed. Expansion is a later recommendation based on actual evidence; no inferred keyword volumes or DataForSEO calls.

## Google Business Profile — verified September 6, Google review processing

No businesses existed before setup. On September 6, the user confirmed that they accepted the Business Profile terms. After the user provided an address for the explicitly non-public verification form, Google displayed **You're now verified**. A freshly loaded Business Profile Manager confirms **1 business, 100% verified**, **Verified (1)**, **Pending review (1)**, and row status **Processing**. Public availability is still pending Google's review. The record has:

- Name: **Notary Zhou**.
- Type: **Service business — makes visits to customers** only; Local store and Online retail are unselected.
- Category: **Notary public**.
- Service areas: **Santa Clara County, CA; San Mateo County, CA; Alameda County, CA**.
- Public website: **https://www.notaryzhou.com/en/**.
- Phone and chat phone left blank, pending the user's preference.
- Business location remains **No location; deliveries and home services only**, confirmed after verification.
- Planning: **Appointment required**, saved and confirmed.
- Language assistance: **English** and **Mandarin**, saved and confirmed.
- Optional marketing tips and surveys unchecked.

Terms acceptance and the address verification step are complete. The existing business store code is `06018910610616092135`; management link: https://business.google.com/n/474424666780005805/searchprofile . Google explicitly states that the verification address is hidden from the public. No additional phone, postcard or video verification was requested in this flow. After completing setup, the refreshed owner panel says **Google is processing your verification. It may take up to 5 days**, and **NOT PUBLICLY VISIBLE**. Treat this as verification submitted/accepted with processing pending, not a live listing. Resume this existing record; do not create a duplicate.

Keep the residential verification address out of this repository, website and public profile. Do not use Lakewood Park as an office or storefront address. Preserve the service-only/hidden-address setting.

English description saved and confirmed September 6:

> Notary Zhou provides mobile notary public services by appointment in Santa Clara, San Mateo and Alameda counties, California. We travel to agreed locations such as homes, offices, hospitals and coffee shops. Service is available in Mandarin Chinese and English. Services include acknowledgments, jurats and eligible power-of-attorney copy certifications. Contact us to arrange a visit and confirm document and identification requirements.

Services saved and independently confirmed in the Services editor match the existing website: Acknowledgment statement notarization; Affidavit & oath notarization; Jurat notary acknowledgments; Certified copy of a Power of Attorney; Mobile notary services by appointment. Broad document-copy certification, legal advice and online notarization were not selected.

The setup flow reached 100% and was completed with Continue. Fixed business hours, storefront and business photos, and the optional Google Ads credit were skipped. Hours remain **Open with no main hours**; public phone remains unspecified. The existing website rule waives travel fees for meeting at Lakewood Park, Sunnyvale; whether the user also wants free travel within a surrounding radius is still unanswered. Do not invent a radius or publish the park as a walk-in location. Saved profile fields may remain unavailable to customers while Google processes the profile.

Google references:
- https://support.google.com/business/answer/2853879?hl=en
- https://support.google.com/business/answer/3038177?hl=en
- https://support.google.com/business/answer/9292476
- https://support.google.com/analytics/answer/7318509?hl=en
