import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { siteConfig } from '../../config';
import { sitemapUrlset } from '../../lib/sitemap.mjs';

export const prerender = true;
export const GET: APIRoute = async () => {
  const articles = (await getCollection('articles', ({ data }) => !data.draft))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const entries = articles.map(article => ({
    url: `${siteConfig.url}/articles/${article.id}/`,
    lastmod: (article.data.updatedDate ?? article.data.pubDate).toISOString().slice(0, 10),
    ...(article.data.cover ? { image: new URL(article.data.cover, siteConfig.url).href } : {}),
  }));
  return new Response(sitemapUrlset([{ url: `${siteConfig.url}/articles/` }, ...entries]), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
