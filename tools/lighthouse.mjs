// Đo Lighthouse (mobile + desktop), mỗi trang chạy N lần, lấy median; so với ngưỡng, thoát mã 1 nếu tụt.
//   node tools/lighthouse.mjs                       # bản build local (dist/, có nén gzip) ở cổng trống
//   node tools/lighthouse.mjs https://mdprev.space  # bản đang chạy thật
//   RUNS=5 ONLY=/app/ node tools/lighthouse.mjs
// Cần Chromium: CHROME_PATH hoặc Chromium của Playwright. Lighthouse tải qua npx (không là dependency của dự án).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const LH = 'lighthouse@12.8.2';
const RUNS = Number(process.env.RUNS ?? 3);
// Ngưỡng Performance (median). `/app/*` giữ SEO = 66 vì cố ý noindex nên chỉ kiểm Perf/A11y/BP.
const PAGES = [
  { path: '/', perf: { mobile: 95, desktop: 99 }, seo: 100 },
  { path: '/skill-inspector/', perf: { mobile: 97, desktop: 99 }, seo: 100 },
  { path: '/features/', perf: { mobile: 98, desktop: 99 }, seo: 100 },
  { path: '/guides/markdown-to-pdf-word-and-slides/', perf: { mobile: 98, desktop: 99 }, seo: 100 },
  { path: '/guides/publish-a-markdown-vault-as-a-static-site/', perf: { mobile: 98, desktop: 99 }, seo: 100 },
  { path: '/guides/share-a-markdown-document-with-a-password/', perf: { mobile: 98, desktop: 99 }, seo: 100 },
  { path: '/app/inspect/', perf: { mobile: 95, desktop: 99 }, seo: 66 },
  { path: '/app/', perf: { mobile: 90, desktop: 88 }, seo: 66 },
];

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = join(homedir(), '.cache/ms-playwright');
  if (existsSync(root)) for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-'))) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux-arm64/chrome', 'chrome-linux/chrome']) { const p = join(root, d, sub); if (existsSync(p)) return p; }
  }
  throw new Error('Không thấy Chromium: đặt CHROME_PATH');
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

let base = process.argv[2];
let server;
if (!base) {
  // cổng trống do hệ điều hành cấp: không bao giờ đo nhầm một server cũ còn chạy
  const port = await new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  server = spawn('node', ['tools/serve-dist.mjs', String(port), '127.0.0.1'], { stdio: 'ignore' });
  base = `http://127.0.0.1:${port}`;
  await new Promise((r) => setTimeout(r, 800));
}
const env = { ...process.env, CHROME_PATH: chrome() };
const dir = mkdtempSync(join(tmpdir(), 'lh-'));
const only = process.env.ONLY;
let fail = false;
console.log(`base ${base}, ${RUNS} lần/trang, median\n`);
console.log('trang'.padEnd(20), 'form'.padEnd(8), 'Perf  A11y  BP  SEO  | LCP    FCP    TBT   CLS');
for (const pg of PAGES.filter((p) => !only || p.path === only)) {
  for (const form of ['mobile', 'desktop']) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) {
      const out = join(dir, `r.json`);
      const args = ['-y', LH, base + pg.path, '--output=json', `--output-path=${out}`, '--quiet', '--chrome-flags=--headless --no-sandbox'];
      if (form === 'desktop') args.push('--preset=desktop');
      const r = spawnSync('npx', args, { env, stdio: 'ignore' });
      if (r.status !== 0) { console.error('lighthouse lỗi', pg.path, form); fail = true; continue; }
      rs.push(JSON.parse(readFileSync(out, 'utf8')));
    }
    if (!rs.length) continue;
    const c = (k) => median(rs.map((r) => Math.round(r.categories[k].score * 100)));
    const a = (k) => median(rs.map((r) => r.audits[k].numericValue));
    const perf = c('performance'), seo = c('seo');
    const ok = perf >= pg.perf[form] && c('accessibility') === 100 && c('best-practices') === 100 && seo >= pg.seo;
    if (!ok) fail = true;
    console.log(pg.path.padEnd(20), form.padEnd(8), String(perf).padEnd(5), String(c('accessibility')).padEnd(5), String(c('best-practices')).padEnd(4), String(seo).padEnd(4), '|',
      (a('largest-contentful-paint') / 1000).toFixed(1).padEnd(6), (a('first-contentful-paint') / 1000).toFixed(1).padEnd(6), String(Math.round(a('total-blocking-time'))).padEnd(5), a('cumulative-layout-shift').toFixed(3), ok ? '' : `  ✗ (cần Perf ≥ ${pg.perf[form]})`);
  }
}
server?.kill();
process.exit(fail ? 1 : 0);
