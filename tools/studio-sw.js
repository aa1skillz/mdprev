/* Service worker của studio Markdown (scope /app/). Bản mẫu: tools/sw-precache.mjs điền danh sách file và phiên bản khi build.
 * - HTML: mạng trước (4 giây), rớt mạng thì bản đã cache.
 * - /_astro/* (tên có băm, không đổi nội dung): cache trước.
 * - Không cache: request khác nguồn (Open URL, ảnh web), sw.js, request không phải GET.
 * - Giữ hai phiên bản cache gần nhất: tab còn chạy bản cũ vẫn nạp được chunk cũ sau khi deploy.
 * - KILL = true rồi deploy: SW tự gỡ, xoá cache, tải lại các tab (công tắc khẩn cấp).
 */
const VERSION = '__VERSION__';
const BASE = '__BASE__';
const KILL = false;
const CORE = [/*__CORE__*/];
const LAZY = [/*__LAZY__*/];
const PRE = 'md-pre-' + VERSION;
const RUN = 'md-run';
const KEEP = 2;

self.addEventListener('install', (e) => {
  if (KILL) { self.skipWaiting(); return; }
  e.waitUntil(caches.open(PRE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith('md-'));
    if (KILL) {
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
      return;
    }
    // thứ tự phiên bản lưu trong RUN; giữ KEEP bản mới nhất
    const run = await caches.open(RUN);
    const prev = await run.match('/__md-versions').then((r) => (r ? r.json() : [])).catch(() => []);
    const order = [VERSION, ...prev.filter((v) => v !== VERSION)];
    const keep = new Set(order.slice(0, KEEP).map((v) => 'md-pre-' + v));
    await Promise.all(names.filter((n) => n.startsWith('md-pre-') && !keep.has(n)).map((n) => caches.delete(n)));
    await run.put('/__md-versions', new Response(JSON.stringify(order.slice(0, KEEP))));
    await self.clients.claim();
  })());
});

const sameOrigin = (u) => u.origin === self.location.origin;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', (e) => {
  if (KILL) return;
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!sameOrigin(url) || url.pathname.endsWith('/sw.js')) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), 4000);
        if (res.ok && url.pathname.startsWith(BASE + 'app/')) (await caches.open(RUN)).put(url.pathname, res.clone());
        return res;
      } catch {
        return (await caches.match(url.pathname, { ignoreSearch: true })) ?? (await caches.match(BASE + 'app/')) ?? Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith(BASE + '_astro/') || url.pathname.startsWith(BASE + 'app/') || url.pathname === BASE + 'favicon.svg') {
    e.respondWith((async () => {
      const hit = await caches.match(url.pathname);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && url.pathname.startsWith(BASE + '_astro/')) (await caches.open(PRE)).put(url.pathname, res.clone());
      return res;
    })());
  }
});

// trang nhờ tải nền phần nạp động (Mermaid, KaTeX, docx, ...) khi online và không ở chế độ tiết kiệm dữ liệu
self.addEventListener('message', (e) => {
  if (e.data?.t !== 'warm' || KILL) return;
  e.waitUntil((async () => {
    const c = await caches.open(PRE);
    for (const u of LAZY) {
      if (await caches.match(u)) continue;
      try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch { return; } // rớt mạng: dừng, lần sau tiếp
    }
    e.source?.postMessage({ t: 'warmed', version: VERSION });
  })());
});
