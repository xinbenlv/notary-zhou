import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { articlePath, topicPath } from '../../../articles';
import { siteConfig } from '../../../config';
import { sitemapUrlset } from '../../../lib/sitemap.mjs';

export const prerender = true;
export const GET: APIRoute = async () => {
  const articles = (await getCollection('articles', ({ data }) => !data.draft && data.lang === 'en'))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const entries = articles.map(article => ({
    url: `${siteConfig.url}${articlePath(article)}`,
    lastmod: (article.data.updatedDate ?? article.data.pubDate).toISOString().slice(0, 10),
    ...(article.data.cover ? { image: new URL(article.data.cover, siteConfig.url).href } : {}),
  }));
  return new Response(sitemapUrlset([{ url: `${siteConfig.url}/en/articles/` }, { url: `${siteConfig.url}${topicPath('en')}` }, ...entries]), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
