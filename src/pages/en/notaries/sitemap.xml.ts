import type { APIRoute } from 'astro';
import { siteConfig } from '../../../config';
import pilot from '../../../data/notary-sitemap-pilot.json';
import { profilePath } from '../../../lib/notary-profile.mjs';
import { sitemapUrlset } from '../../../lib/sitemap.mjs';

export const prerender = false;
export const GET: APIRoute = ({ locals }) => {
  const service = locals.notaryListing;
  const status = service?.getStatus();
  if (!status?.ready || !status.source?.generatedAt) return new Response('Listing unavailable', {
    status: 503, headers: { 'Retry-After': '300', 'Cache-Control': 'no-store' },
  });
  // A fixed editorial cohort. Removed/expired records drop out instead of being
  // silently replaced with arbitrary people or re-exposing the full directory.
  const records = service!.getSitemapRecords(pilot.commissionNumbers);
  return new Response(sitemapUrlset(records.map(record => ({
    url: `${siteConfig.url}${profilePath(record.commissionNumber)}`,
    priority: 0,
  }))), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
