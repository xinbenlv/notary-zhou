/** Chinese-only editorial URLs; the service website retains its separate locales. */
import type { CollectionEntry } from 'astro:content';
import { type Lang } from './i18n';
export const articleCategories = {
  basics: { zh: '公证基础', en: 'Notary basics', order: 1 },
  'china-use': { zh: '跨境文件与认证', en: 'Documents across borders', order: 2 },
  family: { zh: '家庭与养老', en: 'Family and care', order: 3 },
  pitfalls: { zh: '别找错门', en: 'Which service do you need?', order: 4 },
  'real-estate': { zh: '房产与贷款', en: 'Property and loans', order: 5 },
  estate: { zh: '信托与遗产', en: 'Trusts and estates', order: 6 },
} as const;
export type ArticleCategory = keyof typeof articleCategories;
export type Article = CollectionEntry<'articles'>;
export const articleSlug = (article: Article) => article.id;
export const articleKey = (article: Article) => article.data.translationKey ?? articleSlug(article);
export const articlePath = (article: Article) => `/articles/${articleSlug(article)}/`;
/** UI preference never changes the canonical article or its Chinese content. */
export const articleInterfacePath = (path: string, lang: Lang = 'zh') => {
  const url = new URL(path, 'https://www.notaryzhou.com');
  if (lang === 'en') url.searchParams.set('ui', 'en');
  else url.searchParams.delete('ui');
  return `${url.pathname}${url.search}${url.hash}`;
};
export const articleIndexPath = (lang: Lang = 'zh') => articleInterfacePath('/articles/', lang);
export const topicPath = (lang: Lang = 'zh') => articleInterfacePath('/articles/topics/apostille/', lang);
export const formatDate = (d: Date, lang: Lang = 'zh') => new Intl.DateTimeFormat(
  lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }
).format(d);
export const apostilleKeys = ['apostille-for-china', 'birth-certificate-apostille', 'marriage-certificate-apostille', 'single-status-affidavit', 'same-person-affidavit', 'china-power-of-attorney', 'chinese-documents-translation'];
