// Sau `astro build`: tính danh sách file cho service worker của studio Markdown và ghi dist/app/sw.js.
// - core: những gì trang studio/preview/presenter cần để mở và gõ được khi offline (HTML, CSS, JS nạp tĩnh, worker dựng
//   Markdown và các import tĩnh của nó, font latin/vietnamese, icon). Được cache ngay khi cài SW.
// - lazy: chunk nạp động (Mermaid, KaTeX, turndown, docx, ...), font subset khác. Trang nhờ SW tải nền khi online.
// Phiên bản = băm nội dung danh sách + file, nên mỗi lần deploy có SW mới.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const DIST = 'dist';
const PAGES = ['app/index.html', 'app/inspect/index.html', 'app/preview/index.html', 'app/presenter/index.html'];
const EXTRA = ['/app/manifest.webmanifest', '/app/icons/icon-192.png', '/app/icons/icon-512.png', '/app/icons/maskable-512.png', '/app/icons/apple-180.png', '/favicon.svg', '/favicon-32.png'];
const trimmed = (process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, ''); // cùng biến môi trường với astro.config.ts
const BASE = trimmed ? '/' + trimmed + '/' : '/';

// Không dùng es-module-lexer: bản 3 đổi định dạng kết quả (trường n/d undefined) làm import tĩnh bị xếp nhầm thành nạp động.
// Regex dưới đây đủ cho đầu ra đã minify của Vite/rolldown, và có kiểm tra ở cuối (file lõi bắt buộc phải có).

const read = (url) => { const p = join(DIST, url.replace(BASE, '/').replace(/^\//, '') + (url.endsWith('/') ? 'index.html' : '')); return existsSync(p) ? readFileSync(p) : null; };
const abs = (spec, from) => (spec.startsWith('/') ? spec : spec.startsWith('_astro/') ? BASE + spec : posix.join(posix.dirname(from), spec));

/** Import tĩnh và mọi tham chiếu khác (import động, mapDeps của Vite, new URL(...worker...)) của một file JS. */
function refsOfJs(url, code) {
  const stat = new Set(), other = new Set();
  for (const m of code.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[\w*{}\s,$]+from\s*)?["'](\.{1,2}\/[^"']+|\/_astro\/[^"']+)["']/g)) stat.add(abs(m[1], url));
  for (const m of code.matchAll(/["'`]((?:\.\/|\/?_astro\/)[\w.@-]+\.(?:js|css|woff2?|wasm))["'`]/g)) { const u = abs(m[1], url); if (!stat.has(u)) other.add(u); }
  return { stat, other };
}
const refsOfCss = (url, css) => [...css.matchAll(/url\(\s*["']?([^"')]+\.(?:woff2?|ttf|png|svg))["']?\s*\)/g)].map((m) => abs(m[1], url));
const isWorker = (u) => /\.worker[-.]/.test(u);
const coreFont = (u) => /(latin|vietnamese)(?!-ext)/.test(u) && !/italic/i.test(u); // font cần để hiện chữ ngay; subset khác tải nền

const core = new Set(PAGES.map((p) => BASE + p.replace(/index\.html$/, '')).concat(EXTRA.map((e) => e.replace(/^\//, BASE))));
const lazy = new Set();
const queue = [];
const add = (u, isCore) => {
  if (!read(u)) return;
  if (isCore) { if (core.has(u)) return; core.add(u); lazy.delete(u); queue.push([u, true]); }
  else if (!core.has(u) && !lazy.has(u)) { lazy.add(u); queue.push([u, false]); }
};
for (const p of PAGES) {
  const html = readFileSync(join(DIST, p), 'utf8');
  for (const m of html.matchAll(/(?:href|src|component-url|renderer-url|before-hydration-url)="([^"]+)"/g)) {
    const u = m[1];
    if (/\/_astro\/.+\.(js|css)$/.test(u)) add(u, true);
  }
}
while (queue.length) {
  const [u, isCore] = queue.shift();
  const buf = read(u); if (!buf) continue;
  if (u.endsWith('.css')) { for (const f of refsOfCss(u, buf.toString('utf8'))) add(f, isCore && coreFont(f)); continue; }
  if (!u.endsWith('.js')) continue;
  const { stat, other } = refsOfJs(u, buf.toString('utf8'));
  for (const s of stat) add(s, isCore);
  // worker dựng Markdown và các chunk nó nạp động (pipeline, Shiki) là lõi: thiếu một cái là worker chết khi offline.
  // Trừ công thức và sơ đồ (KaTeX, Mermaid): chỉ cần khi tài liệu có, tải nền sau.
  // pipeline.*: bản dựng ở luồng chính khi worker không chạy được (nạp động từ render-client): cũng là lõi
  for (const o of other) add(o, isCore && (isWorker(o) || /\/pipeline\.[\w-]+\.js$/.test(o) || ((isWorker(u) || /\/pipeline\.[\w-]+\.js$/.test(u)) && !/math|katex|mermaid/i.test(o))));
}

// kiểm tra: mọi import tĩnh của một file lõi cũng phải là lõi (nếu không, trang offline sẽ hỏng)
for (const u of core) {
  if (!u.endsWith('.js')) continue;
  const b = read(u); if (!b) continue;
  for (const s of refsOfJs(u, b.toString('utf8')).stat) if (read(s) && !core.has(s)) throw new Error(`sw: ${s} (import tĩnh của ${u}) không nằm trong lõi`);
}
const list = (s) => [...s].sort();
const h = createHash('sha256');
for (const u of [...list(core), ...list(lazy)]) { h.update(u); const b = read(u); if (b) h.update(b); }
const version = h.digest('hex').slice(0, 12);
const size = (s) => [...s].reduce((n, u) => n + (read(u)?.length ?? 0), 0);

const tpl = readFileSync('tools/studio-sw.js', 'utf8');
const out = tpl.replace("'__VERSION__'", JSON.stringify(version)).replace("'__BASE__'", JSON.stringify(BASE))
  .replace('[/*__CORE__*/]', JSON.stringify(list(core))).replace('[/*__LAZY__*/]', JSON.stringify(list(lazy)));
if (out.includes('__CORE__') || out.includes('__LAZY__') || out.includes('__VERSION__')) throw new Error('sw template placeholders not replaced');
writeFileSync(join(DIST, 'app/sw.js'), out);
console.log(`sw: version ${version}, core ${core.size} files ${(size(core) / 1024).toFixed(0)} KB, lazy ${lazy.size} files ${(size(lazy) / 1024).toFixed(0)} KB`);
