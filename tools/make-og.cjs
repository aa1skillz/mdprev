// Sinh public/og.png (1200×630) cho thẻ og:image/twitter:image. Chạy lại khi đổi tên hay khẩu hiệu:
//   NODE_PATH=$PWD/node_modules node tools/make-og.cjs
// Ảnh riêng cho một trang (tiêu đề cho phép <em>…</em>):
//   NODE_PATH=$PWD/node_modules node tools/make-og.cjs public/og-features.png 'Tiêu đề <em>nghiêng</em>' 'Dòng phụ'
//   NODE_PATH=$PWD/node_modules node tools/make-og.cjs --pages    # sinh lại mọi ảnh của trang (danh sách PAGES dưới đây)
const { chromium } = require('@playwright/test');
const { resolve } = require('node:path');
const { writeFileSync, mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const mk = require('../src/components/brand-mark.json'), wm = require('../src/components/brand-wordmark.json');
const LOGO = `<svg viewBox="0 0 32 32" width="84" height="84"><path d="M2 2h20l8 8v20H2z" fill="#1e5ba1"/><path d="M22 2v8h8z" fill="#9cc0ee"/><path d="${mk.cur}" fill="#ffffff"/></svg><svg viewBox="0 0 ${wm.w} ${wm.h}" height="72" width="${Math.round(wm.w / wm.h * 72)}"><path d="${wm.md}" fill="#1c1917"/><path d="${wm.prev}" fill="#1c1917"/></svg>`;
const F = (n) => 'file://' + resolve('tools/fonts', n);
const PAGES = [
  ['public/og-features.png', 'What paid editors charge for, <em>free here.</em>', 'Password links, vault to site, style check. No account.'],
  ['public/og-vault-site.png', 'Publish a Markdown vault <em>as a static site.</em>', '[[wikilinks]], backlinks, hover previews. Opens from disk.'],
  ['public/og-share-password.png', 'Share a Markdown document <em>with a password.</em>', 'Encrypted on your device. No server, no account.'],
];
const DEF = ['public/og.png', 'A quiet Markdown editor <em>that stays in your browser.</em>', 'Also reads agent skills. Nothing is uploaded.'];
const html = (h1, sub) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:N;src:url(${F('newsreader-latin-400-normal.woff2')});font-weight:400}
@font-face{font-family:N;src:url(${F('newsreader-latin-400-italic.woff2')});font-weight:400;font-style:italic}
@font-face{font-family:N;src:url(${F('newsreader-latin-600-normal.woff2')});font-weight:600}
@font-face{font-family:M;src:url(${F('jetbrains-mono-latin-400-normal.woff2')});font-weight:400}
*{box-sizing:border-box;margin:0} body{width:1200px;height:630px;background:#faf9f5;color:#1c1917;padding:72px 84px;display:flex;flex-direction:column;justify-content:space-between;font-family:N,serif}
.b{display:flex;align-items:center;gap:20px}.b i{width:34px;height:34px;border:3px solid #1c1917;display:grid;place-items:center;font:500 22px M,monospace;font-style:normal}
h1{font:400 84px/1.04 N,serif;letter-spacing:-.025em;max-width:980px}h1 em{font-style:italic}
p{font:400 26px M,monospace;color:#57534e}
</style><div class="b">${LOGO}</div><h1>${h1}</h1><p>${sub}</p>`;
const a = process.argv.slice(2);
const JOBS = a[0] === '--pages' ? PAGES : a.length ? [[a[0], a[1] ?? DEF[1], a[2] ?? DEF[2]]] : [DEF];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  // mở bằng file:// (setContent chạy ở about:blank, không nạp được phông qua file://)
  const dir = mkdtempSync(join(tmpdir(), 'og-'));
  for (const [out, h1, sub] of JOBS) {
    const page = join(dir, 'og.html');
    writeFileSync(page, html(h1, sub));
    await p.goto('file://' + page); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: out });
    console.log(out);
  }
  await b.close();
})();
