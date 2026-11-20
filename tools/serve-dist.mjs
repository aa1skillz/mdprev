// Server tĩnh nhỏ cho dist/, áp header từ dist/_headers giống Cloudflare Pages (chỉ hỗ trợ dạng mdprev dùng:
// khối "/*" cho mọi đường dẫn và khối đường dẫn cụ thể). Dùng để chạy e2e với CSP thật.
// node tools/serve-dist.mjs [port] [host]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const port = Number(process.argv[2] ?? 4340);
const host = process.argv[3] ?? '127.0.0.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

/** Đọc _headers: [{ pattern, headers: [[k, v]] }] */
function rules() {
  const p = join(DIST, '_headers');
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) out.push({ pattern: line.trim(), headers: [] });
    else { const i = line.indexOf(':'); out.at(-1)?.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
  }
  return out;
}
const match = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, rel);
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); res.end(); return; }
    file = join(file, 'index.html');
  }
  for (const r of rules()) if (match(r.pattern, url.pathname)) for (const [k, v] of r.headers) res.setHeader(k, v);
  if (!existsSync(file)) { const nf = join(DIST, '404.html'); if (existsSync(nf)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(readFileSync(nf)); return; } res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  let body = readFileSync(file);
  // Như Cloudflare Pages: nén văn bản khi client chấp nhận (để đo kích thước truyền thật, vd. Lighthouse).
  if (/gzip/.test(String(req.headers['accept-encoding'] ?? '')) && /^(text\/|application\/(json|xml|manifest)|image\/svg)|javascript/.test(type)) {
    body = gzipSync(body); res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding');
  }
  res.writeHead(200, { 'Content-Type': type });
  res.end(body);
}).listen(port, host, () => console.log(`serving dist/ with _headers at http://${host}:${port}`));
