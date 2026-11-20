// Dò vi phạm CSP: mở các trang, dùng các tính năng nặng (KaTeX, Mermaid, slide, pop-out, presenter, xuất Word),
// ghi mọi sự kiện securitypolicyviolation. Chạy với server có header thật: node tools/serve-dist.mjs 4340
// NODE_PATH=$PWD/node_modules node tools/csp-probe.cjs http://127.0.0.1:4340
const { chromium } = require('@playwright/test');
const BASE = process.argv[2] || 'http://127.0.0.1:4340';
const DOC = '# CSP probe\n\nInline $e^{i\\pi}+1=0$ and display:\n\n$$\\int_0^1 x^2\\,dx$$\n\n```mermaid\ngraph TD; A-->B; B-->C\n```\n\n```ts\nconst x: number = 1;\n```\n\n> [!NOTE]\n> callout\n\n---\n\n## Slide two\n\nNote: speaker note\n';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((doc) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile ?? ''}:${e.lineNumber ?? ''}`));
    try { if (location.pathname.endsWith('/app/')) localStorage.setItem('mdprev-md', doc); } catch {}
  }, DOC);
  const all = [];
  const collect = async (pg, label) => { const v = await pg.evaluate(() => window.__csp); v.forEach((x) => all.push(`${label}: ${x}`)); };

  const home = await ctx.newPage();
  await home.goto(BASE + '/'); await home.waitForTimeout(800); await collect(home, '/');
  // khách lần đầu: bấm khung tĩnh để nạp editor muộn (đường nạp này cũng không được vi phạm CSP)
  await home.getByRole('button', { name: /Start writing/ }).click();
  await home.waitForSelector('.pv .ed-ta', { timeout: 20000 }); await home.waitForTimeout(500); await collect(home, '/ (editor nạp muộn)');
  // các trang tĩnh, gồm JSON-LD, và form GET của /skill-inspector/
  for (const path of ['/skill-inspector/', '/privacy/', '/guides/', '/guides/what-is-inside-a-skill-md/', '/guides/how-much-context-does-a-skill-cost/']) {
    const sp = await ctx.newPage();
    await sp.goto(BASE + path); await sp.waitForTimeout(300); await collect(sp, path);
    if (path === '/skill-inspector/') {
      await sp.getByLabel('GitHub link to a skill or a repository').fill('github.com/anthropics/skills');
      await Promise.all([sp.waitForURL(/\/app\/inspect\/\?u=/), sp.getByRole('button', { name: 'Inspect' }).click()]);
      await sp.waitForTimeout(800); await collect(sp, '/skill-inspector/ (sau khi gửi form)');
    }
    await sp.close();
  }

  const pg = await ctx.newPage();
  await pg.goto(BASE + '/app/');
  await pg.waitForSelector('.md-doc .katex', { timeout: 20000 });
  await pg.waitForSelector('.md-doc svg', { timeout: 20000 }); // Mermaid
  // pop-out
  const [pop] = await Promise.all([ctx.waitForEvent('page'), pg.getByRole('button', { name: 'View options', exact: true }).click().then(() => pg.getByRole('button', { name: /^Pop out preview/ }).click())]);
  await pop.waitForSelector('.md-doc h1'); await pop.waitForTimeout(500); await collect(pop, '/app/preview/');
  // slides + presenter
  await pg.bringToFront();
  await pg.locator('.pv-mode').click();
  await pg.keyboard.press('Escape');
  await pg.keyboard.press('s');
  await pg.waitForTimeout(800);
  const [pres] = await Promise.all([ctx.waitForEvent('page'), pg.keyboard.press('p')]);
  await pres.waitForTimeout(1200); await collect(pres, '/app/presenter/');
  await pg.keyboard.press('Escape');
  // xuất Word (mermaid → PNG qua canvas)
  await pg.getByRole('button', { name: 'Export', exact: true }).click();
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), pg.getByRole('button', { name: /Word/ }).click()]);
  console.log('docx download:', dl.suggestedFilename());
  await pg.waitForTimeout(500);
  await collect(pg, '/app/');
  // /app/inspect/: skill mẫu, xem file, Preview (nạp worker dựng Markdown)
  const ix = await ctx.newPage();
  await ix.goto(BASE + '/app/inspect/');
  await ix.getByRole('button', { name: 'try an example' }).click();
  await ix.waitForSelector('.ix-report');
  await ix.getByRole('button', { name: 'Files' }).click();
  await ix.getByRole('button', { name: 'Preview' }).click();
  await ix.waitForSelector('.ix-doc h1', { timeout: 20000 });
  await ix.waitForTimeout(500);
  await collect(ix, '/app/inspect/');
  await b.close();
  console.log(all.length ? 'CSP VIOLATIONS:\n' + all.join('\n') : 'CSP PROBE: no violations');
  process.exit(all.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
