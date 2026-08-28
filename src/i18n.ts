export type Lang = 'en' | 'zh';

/** URL prefix for each language version of the site. Chinese is the default locale. */
export const langPath = (lang: Lang) => (lang === 'zh' ? '/' : '/en/');

/** The other language, for the navbar switcher. */
export const otherLang = (lang: Lang): Lang => (lang === 'en' ? 'zh' : 'en');
