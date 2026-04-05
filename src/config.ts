export const siteConfig = {
  name: 'Notary Zhou',
  title: 'Notary Zhou | Bilingual Bay Area Notary',
  description:
    'Professional bilingual (English & Mandarin) notary public services in the San Francisco Bay Area. Mobile and in-office notarization for real estate, legal, and business documents.',
  url: 'https://notaryzhou.com',

  // PLACEHOLDER — awaiting commission
  phone: '650-123-4567',
  email: 'info@notaryzhou.com',
  commissionNumber: '#PENDING',
  copyrightYear: 2025,

  owner: {
    nameEn: 'George Zhou',
    nameZh: '周国锦',
    fullNameEn: 'George (Guojin) Zhou',
  },

  serviceAreas: ['Santa Clara', 'San Mateo', 'Alameda'],

  isDraft: true,
  draftBannerText:
    '⚠️ PREVIEW — George Zhou has passed the California Notary Public Exam. Commission pending — services will be available once all state requirements are fulfilled.',
  draftFooterText:
    'This site is a preview only. Notary commission is pending. Business operations have not commenced. Do not rely on any information displayed.',

  // Credentials status (set to actual values once obtained)
  nnaStatus: 'Pending' as const,
  eoInsuranceStatus: 'Pending' as const,
  bondStatus: 'Pending' as const,
} as const;
