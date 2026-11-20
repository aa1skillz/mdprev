// Ngân sách JS: tổng JS (đã gzip) tải khi mở một trang, chưa thao tác gì, không có service worker.
// NODE_PATH=$PWD/node_modules node tools/js-budget.cjs http://127.0.0.1:4340
// Vượt ngân sách thì thoát mã 1.
const { chromium } = require('@playwright/test');
const { gzipSync } = require('node:zlib');
const { readFileSync } = require('node:fs');
// bài mẫu nguyên văn (cùng nguồn với SAMPLE trong src/lib/studio/sample.ts): bài mặc định không còn là bài mẫu, nên hàng đo bài mẫu phải gieo nó vào
const SAMPLE_MD = readFileSync(require('node:path').join(__dirname, '..', 'src/lib/studio/sample.md'), 'utf8');
const BASE = process.argv[2] || 'http://127.0.0.1:4340';
// KB gzip. Đặt từ số đo mốc 2026-11-13 cộng khoảng 10% dư; muốn nâng phải ghi lý do trong commit.
const BUDGET = [
  // `/` là trang công cụ-trước (M1.6): chạy cả editor nên dùng trần của "app lõi" (20 KB cũ là của landing tĩnh không có editor).
  // Khách lần đầu chưa tương tác: editor chưa nạp (HomeStudio.tsx), nên trang chủ chỉ nặng như trang tĩnh.
  { name: 'home, first visit, no interaction /', path: '/', seed: null, kb: 40 },
  // 2026-11-17: 190 → 194 cho phần nối UI của 6 tính năng miễn phí (spec 2026-11-17-free-pro-features); logic của chúng đều nạp lười.
  { name: 'home, tool-first / (returning visitor, short document)', path: '/', seed: '# Notes\n\nHello **world**.\n', kb: 194 },
  // Trần đặt trước khi làm: tải đầu của trang Inspector, chưa mở Preview.
  { name: 'inspect, import screen', path: '/app/inspect/', seed: null, kb: 80 },
  { name: 'app, short document (core)', path: '/app/', seed: '# Notes\n\nHello **world**.\n', kb: 194 },
  // Khách mới mở /app/: tài liệu trống + thẻ chào, nên chỉ nặng như lõi (không Mermaid/KaTeX/Shiki).
  { name: 'app, first visit (empty document + welcome card)', path: '/app/', seed: null, kb: 194 },
  // Bài mẫu không còn là mặc định: gieo SAMPLE_MD như khi khách bấm "Try a sample" (trước đây hàng này chạy với seed null và nhận bài mẫu mặc định).
  { name: 'app, sample document (Mermaid + KaTeX + Shiki)', path: '/app/', seed: SAMPLE_MD, kb: 1150 },
];

(async () => {
  const b = await chromium.launch();
  let fail = false;
  for (const { name, path, seed, kb: limit } of BUDGET) {
    const ctx = await b.newContext({ serviceWorkers: 'block' });
    if (seed) await ctx.addInitScript((m) => { try { localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, seed);
    const pg = await ctx.newPage();
    const js = new Map();
    pg.on('response', async (r) => {
      const t = r.request().resourceType();
      if ((t === 'script' || /\.m?js(\?|$)/.test(r.url())) && r.ok()) { try { js.set(r.url(), gzipSync(await r.body()).length); } catch { /* bỏ qua */ } }
    });
    await pg.goto(BASE + path, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1500);
    await pg.waitForLoadState('networkidle');
    const total = [...js.values()].reduce((a, n) => a + n, 0) / 1024;
    const top = [...js.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP || 5)).map(([u, n]) => `    ${(n / 1024).toFixed(1).padStart(6)} KB  ${u.replace(BASE, '')}`);
    const ok = total <= limit;
    if (!ok) fail = true;
    console.log(`${ok ? 'OK  ' : 'OVER'} ${name}: ${total.toFixed(1)} KB gzip JS (${js.size} files, budget ${limit} KB)\n${top.join('\n')}`);
    await ctx.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
