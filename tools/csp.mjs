// Sau `astro build`: băm mọi <script> inline trong dist/**/*.html và ghi dist/_headers (Cloudflare Pages).
// Script chỉ chạy được nếu từ 'self' hoặc khớp hash; style cần 'unsafe-inline' vì KaTeX (style="…"),
// Mermaid (<style> trong SVG) và Preact (style động) đều dùng style inline.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const htmlFiles = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : []; });

const hashes = new Set();
for (const f of htmlFiles(DIST)) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\btype\s*=\s*["']?application\/ld\+json/i.test(m[1])) continue; // dữ liệu có cấu trúc: không thực thi nên không cần hash (tránh phình dòng CSP)
    if (!m[2].trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
}

export const POLICY = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].sort().join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  // ảnh: blob/data (ảnh dán), https (ảnh trong tài liệu; tài liệu chia sẻ đã chặn ở tầng ứng dụng)
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Open URL (.md từ GitHub hay URL bất kỳ người dùng nhập) và xuất Word (tải ảnh để nhúng)
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // 'self': chỉ để form GET của /skill-inspector/ chuyển sang /app/inspect/ chạy được khi tắt JavaScript; không cho gửi form ra ngoài.
  "form-action 'self'",
].join('; ');

const headers = `/*
  Content-Security-Policy: ${POLICY}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/app/sw.js
  Cache-Control: no-cache
`;
writeFileSync(join(DIST, '_headers'), headers);
console.log(`csp: ${hashes.size} inline script hash(es) → dist/_headers`);
