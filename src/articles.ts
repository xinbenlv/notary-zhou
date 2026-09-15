/** Published article URLs and locale metadata. Each translation has its own canonical. */
import type { CollectionEntry } from 'astro:content';
import { langPath, type Lang } from './i18n';
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
export const articleSlug = (article: Article) => article.id.replace(/^en\//, '');
export const articleKey = (article: Article) => article.data.translationKey ?? articleSlug(article);
export const articlePath = (article: Article) => `${langPath(article.data.lang)}articles/${articleSlug(article)}/`;
export const articleIndexPath = (lang: Lang) => `${langPath(lang)}articles/`;
export const topicPath = (lang: Lang) => `${articleIndexPath(lang)}topics/apostille/`;
export const formatDate = (d: Date, lang: Lang = 'zh') => new Intl.DateTimeFormat(
  lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }
).format(d);
export const apostilleKeys = ['apostille-for-china', 'birth-certificate-apostille', 'marriage-certificate-apostille', 'single-status-affidavit', 'same-person-affidavit', 'china-power-of-attorney', 'chinese-documents-translation'];
export function articleAlternates(article: Article, published: Article[]) {
  const partner = published.find(a => !a.data.draft && a.data.lang !== article.data.lang && articleKey(a) === articleKey(article));
  return partner ? { [article.data.lang]: articlePath(article), [partner.data.lang]: articlePath(partner) } as Record<Lang, string> : undefined;
}
