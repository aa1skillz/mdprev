// Sinh các PNG của logo (favicon 32, apple-touch 180, PWA 192/512/maskable) từ public/favicon.svg (bản sáng).
//   node tools/make-icons.cjs        (cần @playwright/test; chạy tools/make-brand.py trước nếu đổi logo)
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const svg = fs.readFileSync('public/favicon.svg', 'utf8').replace(/@media\(prefers-color-scheme:dark\)\{.*?\}\}/, '');
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const BG = '#f8f7f2'; // = background_color của manifest
const jobs = [
  ['public/favicon-32.png', 32, null, 1],
  ['public/favicon-48.png', 48, null, 1], // Google chỉ lấy favicon có cạnh là bội của 48px
  ['public/app/icons/icon-192.png', 192, BG, 0.74],
  ['public/app/icons/icon-512.png', 512, BG, 0.74],
  ['public/app/icons/maskable-512.png', 512, BG, 0.56], // vùng an toàn của maskable: 80% ở giữa
  ['public/app/icons/apple-180.png', 180, BG, 0.66],
];
(async () => {
  const b = await chromium.launch();
  for (const [out, px, bg, k] of jobs) {
    const p = await b.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    const s = Math.round(px * k);
    await p.setContent(`<body style="margin:0;width:${px}px;height:${px}px;background:${bg ?? 'transparent'};display:grid;place-items:center"><img src="${uri}" width="${s}" height="${s}"></body>`);
    await p.waitForTimeout(100);
    await p.screenshot({ path: out, omitBackground: bg === null });
    await p.close();
    console.log(out);
  }
  await b.close();
  // favicon.ico (một ảnh PNG 48px bọc trong ICO): trình thu thập tìm /favicon.ico dù trang có khai báo link hay không
  const png = fs.readFileSync('public/favicon-48.png');
  const h = Buffer.alloc(22);
  h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);
  h[6] = 48; h[7] = 48; h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18);
  fs.writeFileSync('public/favicon.ico', Buffer.concat([h, png]));
  console.log('public/favicon.ico');
})();
