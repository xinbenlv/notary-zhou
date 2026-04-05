# MEMORY.md — NotaryZhou.com Project Log

## Project Overview
- **Owner**: George (Guojin) Zhou — Victor's father
- **Business**: Notary Public services, Bay Area (Santa Clara, San Mateo, Alameda counties)
- **Status**: George passed CA Notary Exam on 2026-04-04. Commission NOT yet issued — pending background check, $15k surety bond, oath filing.
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

## TODO (When Commission Arrives)
- [ ] Update `src/config.ts`: set `isDraft: false`, fill in real phone, commission number, email
- [ ] Remove password gate (or set `isDraft: false` to auto-disable)
- [ ] Change `noindex` to `index, follow`
- [ ] Replace placeholder stats with real NNA cert + E&O insurance amounts
- [ ] Enable booking (Calendly/Cal.com integration)
- [ ] Consider ITU trademark filing for "Notary Zhou"
- [ ] Add Google Business Profile
- [ ] Get George's professional headshot for hero image
