import type { APIRoute } from 'astro';
import { absUrl } from '../lib/url';

/**
 * Cho phép thu thập mọi nơi. `/app/*` không bị chặn ở đây: trang bị chặn thì công cụ tìm kiếm không đọc được thẻ `noindex`
 * và URL vẫn có thể hiện trong kết quả. `noindex` nằm trong chính các trang đó.
 * Dòng llms chỉ là chú thích cho người và công cụ đọc robots.txt: llms.txt không thuộc chuẩn robots.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absUrl('/sitemap.xml', site)}\n\n# For language models: ${absUrl('/llms.txt', site)} (map) and ${absUrl('/llms-full.txt', site)} (full text)\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
