export const siteConfig = {
  name: 'Notary Zhou',
  title: 'Notary Zhou | Bilingual Bay Area Notary',
  description:
    'Professional bilingual (English & Mandarin) notary public services in the San Francisco Bay Area. Mobile and in-office notarization for real estate, legal, and business documents.',
  url: 'https://notaryzhou.com',

  phone: '', // 留空 = 不显示；填入真实号码后自动进入 JSON-LD
  email: 'info@notaryzhou.com',
  // Verified against CA SOS active-notary listing, 2026-08-27
  commissionNumber: '#2557299',
  commissionCounty: 'Santa Clara',
  commissionExpiresEn: 'May 30, 2030',
  commissionExpiresZh: '2030 年 5 月 30 日',
  copyrightYear: 2026,

  owner: {
    nameEn: 'George Zhou',
    // 中文语境统一用英文名，保护中文名隐私
    nameZhDisplay: 'George (GJ) Zhou',
    fullNameEn: 'George (Guojin) Zhou',
  },

  serviceAreas: ['Santa Clara', 'San Mateo', 'Alameda'],

  // Statutory maximum notary fees — Cal. Gov. Code §8211 (amounts current as of
  // feesLastVerified; the statute controls if amended)
  feeStatuteUrl:
    'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=8211#:~:text=fifteen%20dollars',
  feesLastVerified: 'August 2026',
  feesLastVerifiedZh: '2026 年 8 月',
  fees: [
    {
      en: 'Acknowledgment',
      zh: '签名认证',
      fee: '$15 per signature 每个签名',
    },
    {
      en: 'Jurat (including oath or affirmation)',
      zh: '宣誓书公证（含宣誓）',
      fee: '$15 per signature 每个签名',
    },
    {
      en: 'Certified copy of a Power of Attorney',
      zh: '授权委托书核证副本',
      fee: '$15 per copy 每份',
    },
    {
      en: 'Deposition services',
      zh: '庭外取证（Deposition）',
      fee: '$30, plus $7 oath + $7 certificate 另加宣誓 $7、证书 $7',
    },
  ],
  travelOriginEn: 'Lakewood Park, Sunnyvale',
  travelOriginZh: 'Sunnyvale Lakewood Park',

  previewPassword: '', // 留空 = 不显示密码门；填入字符串即可重新开启
  isDraft: false,

  // Credentials status (set to actual values once obtained)
  nnaStatus: 'Pending' as const,
  eoInsuranceStatus: 'Pending' as const,
  bondStatus: 'Filed' as const, // $15k surety bond on file with Santa Clara County
} as const;
