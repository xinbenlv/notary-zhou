export type Lang = 'en' | 'zh';

/** URL prefix for each language version of the site. */
export const langPath = (lang: Lang) => (lang === 'en' ? '/' : '/zh/');

/** The other language, for the navbar switcher. */
export const otherLang = (lang: Lang): Lang => (lang === 'en' ? 'zh' : 'en');
