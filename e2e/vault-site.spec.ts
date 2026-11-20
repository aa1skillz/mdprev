import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { ready } from './helpers';

test.use({ viewport: { width: 1440, height: 900 } });

/** Vault mẫu ~50 note + 9 ảnh (tools/make-vault-fixture.mjs --images) nén thành zip trong thư mục tạm. */
function fixtureZip(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'mdprev-vault-'));
  execFileSync('node', ['tools/make-vault-fixture.mjs', dir, '--images']);
  const files: Record<string, Uint8Array> = {};
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else files['my-vault/' + relative(dir, p)] = new Uint8Array(readFileSync(p)); } };
  walk(dir);
  files['my-vault/report.pdf'] = strToU8('%PDF-1.4'); // file không phải Markdown hay ảnh: không nhập
  return Buffer.from(zipSync(files));
}

test('vault: mở zip → báo link hỏng → xuất site → mở bằng file:// thấy wikilink, backlinks, hover preview', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open zip as vault…' }).click()]);
  await fc.setFiles({ name: 'my-vault.zip', mimeType: 'application/zip', buffer: fixtureZip() });
  await page.waitForURL(/\/app\/$/);
  await ready(page);
  const panel = page.getByRole('complementary', { name: 'Notes in this vault' });
  await expect(panel.getByText(/Vault · 50 notes/)).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText('1 non-Markdown file was not copied', { exact: false })).toBeVisible();
  await expect(panel.getByText('9 images kept in this browser', { exact: false })).toBeVisible();

  await panel.getByRole('button', { name: 'Export site…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Export static site' });
  await expect(dlg.getByText('3 broken', { exact: false })).toBeVisible();
  await expect(dlg.getByRole('list', { name: 'Broken links' }).locator('li')).toHaveCount(3);
  await dlg.getByLabel('Site address').fill('https://notes.example.com/');
  const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Export anyway' }).click()]);
  const out = mkdtempSync(join(tmpdir(), 'mdprev-site-'));
  const zp = join(out, 'site.zip');
  await dl.saveAs(zp);
  const files = unzipSync(new Uint8Array(readFileSync(zp)));
  for (const [n, b] of Object.entries(files)) { const p = join(out, 'site', n); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, b); }
  const pages = Object.keys(files).filter((n) => n.endsWith('.html') && n !== 'index.html');
  expect(pages.length).toBe(50);
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['sitemap.xml', 'robots.txt', 'assets/previews.js', 'assets/site.js', 'assets/site.css', 'assets/img/attachments/img-1.png', 'assets/img/attachments/so-do.svg']));
  expect(Object.keys(files).filter((n) => n.startsWith('assets/img/'))).toHaveLength(9);

  // mở từ đĩa: mục lục → một note lồng thư mục có wikilink và backlinks
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(join(out, 'site', 'index.html')).href);
  expect(await page.locator('main a[href$=".html"]').count()).toBeGreaterThanOrEqual(50);
  const nested = pages.find((n) => n.split('/').length >= 3 && /Linked from/.test(Buffer.from(files[n]!).toString()) && /class="wl"/.test(Buffer.from(files[n]!).toString()))!;
  expect(nested).toBeTruthy();
  await page.goto(pathToFileURL(join(out, 'site', nested)).href);
  await expect(page.getByText('Linked from')).toBeVisible();
  const wl = page.locator('main a.wl[data-note]').first();
  await expect(wl).toBeVisible();
  // hover preview: thẻ hiện tiêu đề của note đích (từ previews.js nạp bằng <script src>, chạy được trên file://)
  await wl.hover();
  const card = page.locator('.wl-card');
  await expect(card).toBeVisible();
  await expect(card).not.toBeEmpty();
  await page.mouse.move(0, 0);
  await expect(card).toBeHidden();
  // đi theo wikilink: URL tương đối đúng từ thư mục lồng
  await wl.click();
  await expect(page).toHaveURL(/\.html(#.*)?$/);
  await expect(page.locator('main')).toBeVisible();
  // ảnh: tải được từ đĩa ở trang gốc và ở trang lồng hai cấp
  for (const pg of ['home.html', pages.find((n) => n.split('/').length >= 3 && /assets\/img\//.test(Buffer.from(files[n]!).toString()))!]) {
    await page.goto(pathToFileURL(join(out, 'site', pg)).href);
    const imgs = page.locator('main img');
    expect(await imgs.count()).toBeGreaterThan(0);
    await imgs.evaluateAll((l) => l.forEach((i) => { (i as HTMLImageElement).loading = 'eager'; })); // lazy: ảnh ngoài khung nhìn không tải, Firefox không tự tải
    await expect.poll(() => imgs.evaluateAll((l) => l.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('vault: bản xem hiện ảnh, nhúng đúng phần dưới heading, link mở note khác', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open zip as vault…' }).click()]);
  await fc.setFiles({ name: 'my-vault.zip', mimeType: 'application/zip', buffer: fixtureZip() });
  await page.waitForURL(/\/app\/$/);
  await ready(page);
  const panel = page.getByRole('complementary', { name: 'Notes in this vault' });
  await panel.getByRole('button', { name: 'Home.md' }).click();
  const doc = page.locator('.pv-doc .md-doc, .md-doc').first();
  const svg = doc.locator('img[alt="Sơ đồ"]');
  await expect(svg).toHaveAttribute('width', '240', { timeout: 15_000 });
  await expect.poll(() => svg.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await svg.getAttribute('src')).toMatch(/^blob:/);
  // ![[Projects/Alpha/Overview#Details]]: chỉ phần Details (có "Section link"), không có đoạn mở đầu của note ("Note number")
  await expect(doc.locator('aside.embed').filter({ hasText: 'Section link' }).filter({ hasNotText: 'Note number' })).toHaveCount(1);
  expect(await doc.locator('aside.embed [data-line]').count()).toBe(0);
  expect(await doc.locator('aside.embed h1[id], aside.embed h2[id], aside.embed h3[id]').count()).toBe(0);
  // link wikilink mở note đích trong workspace
  const link = doc.locator('a.wl[data-wl="Projects/Alpha/Overview.md"]').first();
  await link.click();
  await expect(page.locator('textarea').first()).toHaveValue(/^# Overview/);
  await expect(doc.locator('h1').first()).toContainText('Overview');
});

test('vault: mở thư mục (webkitdirectory) → đường dẫn note không mang tên thư mục gốc', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'chọn thư mục bằng setFiles chỉ chắc trên Chromium');
  const dir = mkdtempSync(join(tmpdir(), 'mdprev-vdir-'));
  const root = join(dir, 'notes');
  mkdirSync(join(root, 'sub'), { recursive: true });
  writeFileSync(join(root, 'Start.md'), '# Start\n\nSee [[Other]].\n');
  writeFileSync(join(root, 'sub', 'Other.md'), '# Other\n\nBack to [[Start]].\n');
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Open folder as vault…' }).click()]);
  await fc.setFiles(root);
  await page.waitForURL(/\/app\/$/);
  await ready(page);
  const panel = page.getByRole('complementary', { name: 'Notes in this vault' });
  await expect(panel.getByText(/Vault · 2 notes/)).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole('button', { name: 'Start.md' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^sub\// })).toBeVisible();
  await panel.getByRole('button', { name: 'Export site…' }).click();
  await expect(page.getByRole('dialog', { name: 'Export static site' }).getByText('no broken links', { exact: false })).toBeVisible();
});
