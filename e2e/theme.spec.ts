import { deflateRawSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { exportMenu, ready, viewOptions } from './helpers';

test.use({ viewport: { width: 1400, height: 900 } });
const SEPIA_BG = 'rgb(244, 236, 216)';

async function openApp(page: Page, md = '# Themed\n\nSome text with a [link](https://example.com).\n\n```js\nconst a = 1;\n```\n') {
  await page.addInitScript((m: string) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('mdprev-md', m); } }, md);
  await page.goto('/app/');
  await ready(page);
}
async function pickTheme(page: Page, name: string) {
  await viewOptions(page).click();
  await page.getByRole('button', { name: /^Theme…/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Document theme' });
  await dlg.getByRole('group', { name: 'Themes' }).getByRole('button', { name: new RegExp(name) }).click();
  return dlg;
}
const bg = (page: Page) => page.locator('.pv-out').evaluate((e) => getComputedStyle(e).backgroundColor);

test.describe('theme tài liệu', () => {
  test('chọn Sepia: áp bản xem (nền, phông, màu link), còn sau khi tải lại, có trong HTML xuất ra và khi in', async ({ page }) => {
    await openApp(page);
    const dlg = await pickTheme(page, 'Sepia');
    await expect(dlg.getByRole('button', { name: /Sepia/ })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(page)).toBe(SEPIA_BG);
    expect(await page.locator('.pv .md-doc').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Newsreader');
    expect(await page.locator('.pv .md-doc a').first().evaluate((e) => getComputedStyle(e).color)).toBe('rgb(122, 46, 46)');
    await dlg.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    await ready(page);
    await expect.poll(() => bg(page)).toBe(SEPIA_BG);
    await exportMenu(page).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTML (.html)' }).click()]);
    const html = (await (await dl.createReadStream()).toArray()).join('');
    expect(html).toContain('--paper:#f4ecd8');
    expect(html).toMatch(/\.md-doc,\.md-doc\[data-doc\]\{font-family:'Newsreader'/);
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('.pv .md-doc p').first().evaluate((e) => getComputedStyle(e).color)).toBe('rgb(59, 47, 37)');
  });

  test('link chia sẻ mang theme token; bên nhận áp cho lần xem đó, không lưu; CSS tuỳ ý không đi theo link', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'quyền clipboard chỉ cấp được trên Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    const dlg = await pickTheme(page, 'Night');
    await dlg.locator('summary', { hasText: 'Custom CSS' }).click();
    await dlg.getByLabel('Custom CSS').fill('.md-doc h1 { outline: 3px solid lime; }');
    await dlg.getByRole('button', { name: 'Apply CSS' }).click();
    await expect(page.locator('#pv-user-css')).toHaveCount(1);
    await exportMenu(page).click();
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.locator('.pv-flash')).toHaveText('Copied share link');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const { inflateRawSync } = await import('node:zlib');
    const payload = inflateRawSync(Buffer.from(link.split('#d=')[1]!, 'base64url')).toString();
    expect(payload.startsWith('\u0000mdprev1\n')).toBe(true);
    const body = JSON.parse(payload.slice(9)) as { md: string; theme: Record<string, string> };
    expect(body.theme['paper']).toBe('#16181d');
    expect(payload).not.toContain('lime');
    const fresh = await context.browser()!.newContext(); // người nhận: trình duyệt khác, chưa có theme
    const p2 = await fresh.newPage();
    await p2.goto(link);
    await p2.getByRole('alertdialog', { name: 'Open shared document' }).getByRole('button', { name: 'OPEN' }).click();
    await expect(p2.locator('.pv-flash')).toContainText(/sender's theme/i);
    await expect.poll(() => bg(p2)).toBe('rgb(22, 24, 29)');
    expect(await p2.evaluate(() => localStorage.getItem('mdprev-doc-theme'))).toBeNull();
    await expect(p2.locator('#pv-user-css')).toHaveCount(0);
    await fresh.close();
  });

  test('link độc: giá trị theme có url()/;/{ bị bỏ, không có request ra ngoài, token hợp lệ vẫn áp', async ({ page }) => {
    const ext: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) ext.push(r.url()); });
    const env = '\u0000mdprev1\n' + JSON.stringify({ md: '# Evil\n\n[x](https://example.com)\n', theme: { paper: '#fafafa;background:url(https://evil.example/a)', accent: 'url(https://evil.example/b)', ink: '#123456', body: 'red}body{background:url(https://evil.example/c)', font: "x'),url(https://evil.example/d" } });
    await openApp(page);
    await page.goto(`/app/#d=${deflateRawSync(Buffer.from(env)).toString('base64url')}`);
    await page.getByRole('alertdialog', { name: 'Open shared document' }).getByRole('button', { name: 'OPEN' }).click();
    await expect(page.locator('.pv .md-doc h1')).toHaveText('Evil');
    await expect.poll(() => page.locator('.pv .md-doc h1').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(18, 52, 86)');
    const style = await page.locator('.pv-out').getAttribute('style');
    expect(style ?? '').not.toContain('url(');
    await page.waitForTimeout(500);
    expect(ext.filter((u) => u.includes('evil'))).toEqual([]);
  });

  test('pop-out nhận theme', async ({ page, context }) => {
    await openApp(page);
    const dlg = await pickTheme(page, 'Sepia');
    await dlg.getByRole('button', { name: 'Done' }).click();
    await viewOptions(page).click();
    const [pop] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: /Pop out preview/ }).click()]);
    await pop.waitForLoadState();
    await expect.poll(() => pop.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim())).toBe('#f4ecd8');
    expect(await pop.locator('.md-doc').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Newsreader');
  });
});

test('template của người dùng: lưu tài liệu làm template rồi tạo mới từ nó (cất bản cũ)', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('mdprev-md', '# Weekly\n\n- [ ] item\n'); } });
  await page.goto('/app/');
  await ready(page);
  await viewOptions(page).click();
  await page.getByRole('button', { name: /^Theme…/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Document theme' });
  await dlg.locator('summary', { hasText: 'My templates' }).click();
  await dlg.getByLabel('Template name').fill('Weekly');
  await dlg.getByRole('button', { name: 'Save this document' }).click();
  await page.screenshot({ path: 'test-results/theme-dialog.png' });
  await dlg.getByRole('button', { name: 'Done' }).click();
  await page.locator('.ed-ta').fill('# Other\n');
  await viewOptions(page).click();
  await page.getByRole('button', { name: /^Theme…/ }).click();
  await dlg.locator('summary', { hasText: 'My templates' }).click();
  await dlg.getByRole('button', { name: 'New from “Weekly”' }).click();
  await expect(page.locator('.ed-ta')).toHaveValue('# Weekly\n\n- [ ] item\n');
});
