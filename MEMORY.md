# MEMORY.md — NotaryZhou.com Project Log

## Project Overview
- **Owner**: George (Guojin) Zhou — Victor's father
- **Business**: Notary Public services, Bay Area (Santa Clara, San Mateo, Alameda counties)
- **Status**: COMMISSIONED ✅ — Commission #2557299, expires 2030-05-30, oath/bond filed in Santa Clara County (verified in CA SOS active-notary listing 2026-08-27). Registered address: 1111 W El Camino Real Ste 133x178, Sunnyvale (mail suite).
- **Website**: https://notaryzhou.com (password-protected preview)

## 2026-04-04 — Initial Build

### Architecture Decision
- Evaluated Next.js vs Astro vs Hono
- **Chose Astro** — best for content-first site with future blog/articles, zero JS by default, React Islands for interactive parts
- **Deploy**: Vercel (SSG mode) + Namefi DNS
- **Repo**: https://github.com/xinbenlv/notary-zhou

### What Was Built
1. **Astro site** with full design from Victor's HTML/CSS mockup (Outfit font, cream/green/terra color scheme, bilingual EN/ZH)
2. **George's marathon photo** used as hero image (replaced Unsplash stock)
3. **Draft mode** with:
   - Top banner: "George Zhou has passed the CA Notary Exam. Commission pending"
   - Footer warning banner
   - "DRAFT" diagonal watermark overlay
   - "Book Now" → disabled "Coming Soon 即将开放"
   - Calendar → Coming Soon placeholder
   - NNA/E&O → "✓ Exam Passed" + "Pending (Commission & Bond)"
   - Hero text uses future tense ("will provide")
   - `noindex, nofollow` meta tag
4. **Password gate** (code: `20260404`) — full-screen Chinese-only modal, no logo, blocks all content until authenticated (sessionStorage)
5. **SEO foundation**: JSON-LD LocalBusiness, sitemap, meta tags, og:image
6. **All placeholder data** centralized in `src/config.ts`

### DNS & Domains (via Namefi API)
| Domain | Config | Status |
|--------|--------|--------|
| `notaryzhou.com` | A → 76.76.21.21 (Vercel) + www CNAME | ✅ Main site |
| `notaryzhou.co` | Forwarding → https://notaryzhou.com | ✅ Redirect |
| `notaryzhou.online` | Forwarding → https://notaryzhou.com | ✅ Redirect |

### Namefi API Notes
- Had to disable autoPark first: `PUT /dns/park` with `enableParking: false`
- Then add A record: `POST /dns/records`
- Forwarding: `PUT /dns/forwarding` with `enableForwarding: true, forwardTo: "https://notaryzhou.com"`

### Legal/Compliance Research
- **CA Gov Code §8214.1(f)**: Cannot use "false or misleading advertising" claiming rights not yet possessed
- George is NOT a Notary Public until commission is issued — cannot self-describe as one
- Can say "passed exam, commission pending" (factual)
- All service descriptions must use future tense until commissioned
- **Trademark**: "Notary Zhou" not registered on USPTO — clean. For priority, file ITU application ($250-350, Class 36). Website alone does NOT establish common law trademark rights without actual commerce.

### Commits
1. `e6eb132` — feat: initial Astro site with draft mode
2. `b600e57` — fix: change NNA/E&O to Pending, future tense, improve banner
3. `dd67341` — feat: add password gate for preview access
4. `d8ec35d` — fix: password gate - remove logo, switch to full Chinese

## 2026-08-27 — Footer Disclaimer & Fee Schedule

- **§8219.5 statutory notice** added to footer, bilingual EN/ZH, conspicuous styling (site advertises in Chinese → notice legally required, verbatim statutory wording). Penalty for omission: ≥1yr suspension, permanent revocation on 2nd offense.
- **US-vs-China notarization distinction** added (US notary ≠ 中国公证处; no content certification; Apostille may be needed for use in China).
- **Fee schedule per Gov Code §8211** (verified current as of Aug 2026 via leginfo): acknowledgment/jurat $15/signature, POA certified copy $15, deposition $30+$7+$7; free by law: vote-by-mail envelopes, veteran benefit claims (policy: fully free if client comes to Lakewood Park area; mobile → travel fee only). Linked to leginfo with text-fragment URL; "statute controls if amended" caveat in both languages.
- **Travel fee policy**: round-trip Uber estimate from Lakewood Park, Sunnyvale, quoted & agreed at booking. LEGAL in CA — travel fees unregulated by §8211, but must be disclosed/agreed in advance and itemized separately from notarial fees.
- Footer commission line now conditional: draft → "application pending — not yet commissioned" (avoids "#PENDING" looking like an issued number); live → "Commission {number}".
- Fee data centralized in `src/config.ts` (`fees`, `feeStatuteUrl`, `feesLastVerified{,Zh}`, `travelOrigin{En,Zh}`).

## 2026-08-27 — Commission Received, Site Switched to Live

- Found commission in CA SOS active-notary.txt (official daily export): **#2557299, expires 05/30/2030, Santa Clara County (code 43)**.
- `isDraft: false` — auto-flips: noindex removed, footer/hero present tense, Navbar "Book Now".
- Hero stats replaced (placeholder "NNA / $100k E&O" would have been false advertising) with verified facts: commission number + $15k surety bond on file.
- Phone placeholder removed; JSON-LD `telephone` now conditional on `siteConfig.phone` being set.
- Booking copy updated: "email us meanwhile" (online scheduling still TODO).
- Privacy: Chinese text uses "George (GJ) Zhou" (`owner.nameZhDisplay`), never 周国锦.
- Footer identity line: "Commission #2557299 (Santa Clara County) · Expires May 30, 2030".

## 2026-08-27 — i18n Split: Separate EN / ZH Pages

- Replaced inline bilingual (EN + zh subtitle) layout with **Astro i18n routing**; language switcher pill in navbar (中文 ↔ English).
- **Chinese is the default locale**: `/` = Chinese, `/en/` = English (was briefly `/` EN + `/zh/` ZH; `/zh/` now a static noindex meta-refresh redirect page → `/`, kept out of sitemap via filter — a config `redirects` entry couldn't cover both `/zh` and `/zh/` on Vercel).
- All components take a `lang` prop with colocated `t = {en, zh}[lang]` dicts; shared `Lang` type + `langPath`/`otherLang` helpers in `src/i18n.ts`.
- SEO: per-language `<html lang>`, title/description (`titleZh`/`descriptionZh` in config), canonical, `og:locale`, `hreflang` alternates (en/zh/x-default), sitemap i18n config.
- **§8219.5 compliance kept**: the Chinese page advertises in Chinese, so the non-attorney notice AND the §8211 fee schedule remain bilingual (EN+ZH) on `/zh/`; everything else there is Chinese-only. English page is English-only (公证处 appears only as quoted term in the US-vs-China explainer).
- New Chinese copy written for service card descriptions, booking explainer, and "what to bring" list (previously English-only).
- `fees[]` gained `feeEn` (English-only string for EN page); combined `fee` string still used on ZH page.

## 2026-08-27 — Phase-1 Scope: Mandarin-only, Mobile-only

- **Phase 1 offers Mandarin service and mobile service only — no English service, no in-office.** Per Victor: do NOT advertise English fluency or in-office notarization anywhere, and do NOT state the limitation either (just omit).
- Hero desc → "Fluent in Mandarin. Providing accurate mobile notarization…" / "普通话中文服务。…上门公证…"; site title/description → "Bay Area Mobile Notary" / "湾区中文上门公证" (dropped "Bilingual 中英双语" and "in-office 办公室").
- The `/en/` page still exists (page language ≠ service language); revisit copy when English/in-office service starts.

## TODO
- [ ] Fill in real phone in `src/config.ts` (currently '' → hidden) and confirm info@notaryzhou.com mailbox actually receives mail
- [ ] Enable booking — self-built flow (Google Calendar + Google Maps + Stripe); Cal.com/Calendly ruled out (can't do address-based pricing or re-price on reschedule). Interactive mockup: `public/mockups/booking.html`
- [ ] Real NNA cert + E&O insurance → restore hero stats when actually obtained
- [ ] Consider ITU trademark filing for "Notary Zhou"
- [ ] Add Google Business Profile
- [ ] Get George's professional headshot for hero image
