// Smoke PWA: cài SW, tắt mạng, tải lại /app/ và /app/preview/, kiểm ô soạn + bản xem.
const { chromium } = require('@playwright/test');
const BASE = process.argv[2] || 'http://localhost:4330';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: 'allow' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e)));
  await pg.goto(BASE + '/app/');
  const scope = await pg.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.scope; });
  console.log('sw scope:', scope);
  // chờ SW cài xong cache lõi
  await pg.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('md-pre-')), null, { timeout: 30000 });
  const n = await pg.evaluate(async () => { const k = (await caches.keys()).find((x) => x.startsWith('md-pre-')); return (await (await caches.open(k)).keys()).length; });
  console.log('core cached entries:', n);
  // phần nạp động (gồm chunk của bản sao, M2) do SW tải nền khi còn mạng: yêu cầu tải ngay và chờ xong rồi mới tắt mạng
  await pg.evaluate(() => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('SW không báo warmed trong 60 giây')), 60000); navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.t === 'warmed') { clearTimeout(t); res(null); } }); navigator.serviceWorker.ready.then((r) => r.active.postMessage({ t: 'warm' })); }));
  await pg.fill('textarea', '# Offline title\n\nbody text\n');
  await pg.waitForTimeout(800);
  await ctx.setOffline(true);
  await pg.reload();
  await pg.waitForSelector('textarea', { timeout: 15000 });
  const val = await pg.inputValue('textarea');
  await pg.waitForSelector('.md-doc h1', { timeout: 15000 });
  const h1 = await pg.textContent('.md-doc h1');
  console.log('offline reload: textarea starts with', JSON.stringify(val.slice(0, 16)), '| preview h1:', JSON.stringify(h1));
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/app/preview/');
  console.log('offline /app/preview/ title:', await p2.title());
  const ix = await ctx.newPage();
  await ix.goto(BASE + '/app/inspect/');
  await ix.getByRole('button', { name: 'try an example' }).click();
  await ix.waitForSelector('.ix-report', { timeout: 15000 });
  console.log('offline /app/inspect/ example report:', JSON.stringify(await ix.textContent('.ix-report h1')));
  // bản sao (M2) khi offline: Edit a copy, sửa một file, tải lại, panel và nội dung đã sửa còn nguyên
  await ix.getByRole('button', { name: 'Edit a copy' }).click();
  await ix.waitForURL('**/app/', { timeout: 15000 }).catch(async (e) => { console.log('Edit a copy offline failed:', await ix.locator('[role=alert]').allTextContents()); throw e; });
  await ix.waitForSelector('.wp', { timeout: 15000 });
  await ix.click('textarea'); await ix.keyboard.press('Control+End'); await ix.keyboard.type('\noffline edit\n');
  await ix.waitForTimeout(900);
  await ix.reload();
  await ix.waitForSelector('.wp', { timeout: 15000 });
  await ix.waitForFunction(() => document.querySelector('textarea') && document.querySelector('textarea').value.includes('offline edit'), null, { timeout: 15000 });
  const wsOk = await ix.locator('.wp-name').textContent() === 'example-skill';
  console.log('offline workspace reload: panel + edit kept:', wsOk);
  console.log('page errors:', errors.length ? errors : 'none');
  await b.close();
  const ok = n > 0 && val.startsWith('# Offline title') && h1 === 'Offline title' && wsOk;
  console.log(ok ? 'PWA SMOKE: PASS' : 'PWA SMOKE: FAIL');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
