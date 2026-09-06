export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[char]));
}

export function sitemapUrlset(entries) {
  const urls = entries.map(({url, lastmod, priority, image}) => `<url><loc>${escapeXml(url)}</loc>`
    + (lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '')
    + (priority !== undefined ? `<priority>${Number(priority).toFixed(1)}</priority>` : '')
    + (image ? `<image:image><image:loc>${escapeXml(image)}</image:loc></image:image>` : '')
    + '</url>').join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;
}
