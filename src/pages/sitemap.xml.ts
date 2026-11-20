import type { APIRoute } from 'astro';
import { INDEXABLE } from '../lib/site/pages';
import { absUrl } from '../lib/url';

export const GET: APIRoute = ({ site }) => {
  const urls = INDEXABLE.map((p) => `  <url><loc>${absUrl(p.path, site)}</loc><lastmod>${p.lastmod}</lastmod></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
