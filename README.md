# Notary Zhou 🔏

Professional bilingual (English & Mandarin) notary public business website for George (Guojin) Zhou, serving the San Francisco Bay Area.

🌐 **Live**: [notaryzhou.com](https://notaryzhou.com) (password-protected preview)

## Tech Stack

- **[Astro](https://astro.build)** — Static site generator with Islands Architecture
- **Vanilla CSS** — Custom properties design system (no Tailwind)
- **[Vercel](https://vercel.com)** — Hosting & CDN
- **[Namefi](https://namefi.io)** — Domain DNS management via API

## Features

- 🌏 Bilingual EN/ZH layout throughout
- 📱 Fully responsive (mobile, tablet, desktop)
- 🔒 Password-gated preview mode (commission pending)
- 🏷️ Draft mode with legal compliance banners
- 🔍 SEO: JSON-LD LocalBusiness, sitemap, meta tags, og:image
- 📋 Centralized config (`src/config.ts`) — one file to flip from draft to live

## Project Structure

```
src/
├── config.ts              # All site config & placeholder data
├── layouts/
│   └── Layout.astro       # Base layout (head, banners, watermark)
├── pages/
│   └── index.astro        # Landing page
├── components/
│   ├── Navbar.astro
│   ├── Hero.astro
│   ├── Services.astro
│   ├── Booking.astro      # "Coming Soon" placeholder
│   ├── Footer.astro
│   ├── DraftBanner.astro
│   ├── DraftWatermark.astro
│   └── PasswordGate.astro # Preview access gate
├── styles/
│   └── global.css         # Design system (CSS custom properties)
public/
├── images/
│   └── george-zhou.jpg
└── robots.txt             # Disallow all (draft)
```

## Getting Started

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Domains

| Domain | Purpose |
|--------|---------|
| `notaryzhou.com` | Primary (Vercel) |
| `notaryzhou.co` | Redirects → .com |
| `notaryzhou.online` | Redirects → .com |
| `www.notaryzhou.com` | Redirects → .com |

## Going Live Checklist

When George receives his CA Notary Commission:

1. Edit `src/config.ts`:
   - Set `isDraft: false`
   - Fill in real phone number, email, commission number
   - Remove `previewPassword` or set to empty
2. Update `public/robots.txt` to allow indexing
3. Replace placeholder stats (NNA, E&O insurance)
4. Enable booking integration (Calendly / Cal.com)
5. Create Google Business Profile
6. Deploy: `git push` → auto-deploys via Vercel

## License

Private — All rights reserved.
