import { expect, test, type Page } from '@playwright/test';
import { openInspector, ready } from './helpers';

test.use({ viewport: { width: 1440, height: 900 } });
const ta = (p: Page) => p.locator('.ed-ta');
/** Chữ của các khoảng đang được tô "dán" (CSS.highlights, không đụng DOM lớp tô). */
const marked = (p: Page) => p.evaluate(() => {
  const h = (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get('mdprev-auth');
  return h ? [...h].map((r) => r.toString()) : [];
});

async function start(page: Page, md: string) {
  await page.addInitScript((m: string) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1'); localStorage.setItem('mdprev-md', m); localStorage.setItem('mdprev-md-authorship', '1');
  }, md);
  await page.goto('/app/');
  await ready(page);
  await ta(page).click();
  await page.keyboard.press('Control+End');
}
async function paste(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('Control+v');
}

test.describe('authorship cục bộ', () => {
  test.beforeEach(async ({ context, browserName }) => {
    test.skip(browserName !== 'chromium', 'quyền clipboard chỉ cấp được trên Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('gõ, dán, dán giữa chữ tự gõ, hoàn tác/làm lại: khoảng đúng; lưu qua lần tải lại; Checks có tỉ lệ và ghi chú', async ({ page }) => {
    await start(page, '# Doc\n\n');
    await page.keyboard.type('typed words here', { delay: 20 });
    await page.keyboard.press('Enter');
    await paste(page, 'PASTED BLOCK');
    await page.keyboard.type(' tail', { delay: 20 });
    await expect.poll(() => marked(page)).toEqual(['PASTED BLOCK']);
    // dán giữa chữ tự gõ: đặt con trỏ sau "typed "
    await ta(page).evaluate((t: HTMLTextAreaElement) => { const i = t.value.indexOf('words'); t.setSelectionRange(i, i); });
    await paste(page, 'MID ');
    await expect.poll(() => marked(page)).toEqual(['MID ', 'PASTED BLOCK']);
    // gõ giữa chữ dán: tách khoảng
    await ta(page).evaluate((t: HTMLTextAreaElement) => { const i = t.value.indexOf('BLOCK'); t.setSelectionRange(i, i); });
    await page.keyboard.type('x');
    await expect.poll(() => marked(page)).toEqual(['MID ', 'PASTED ', 'BLOCK']);
    await page.keyboard.press('Control+z');
    await expect.poll(() => marked(page)).toEqual(['MID ', 'PASTED BLOCK']);
    await page.keyboard.press('Control+z'); // hoàn tác lần dán MID
    await expect.poll(() => marked(page)).toEqual(['PASTED BLOCK']);
    await page.keyboard.press('Control+Shift+z'); // làm lại: chữ dán vẫn là chữ dán
    await expect.poll(() => marked(page)).toEqual(['MID ', 'PASTED BLOCK']);
    expect(await ta(page).inputValue()).not.toContain('MID MID');
    const insp = await openInspector(page, 'Checks');
    await expect(insp.getByRole('heading', { name: 'Authorship (approximate)' })).toBeVisible();
    await expect(insp.getByText('not proof against tampering', { exact: false })).toBeVisible();
    await page.waitForTimeout(1000); // ghi IndexedDB sau 800 ms
    await page.reload();
    await ready(page);
    await expect.poll(() => marked(page)).toEqual(['MID ', 'PASTED BLOCK']);
    expect(await ta(page).inputValue()).not.toMatch(/authorship|mdprev-auth/); // không ghi vào file .md
  });

  test('bật authorship: Ctrl+Z vẫn hoàn tác cả đoạn vừa gõ (không lùi từng ký tự)', async ({ page }) => {
    await start(page, '# Doc\n\nbody\n');
    await page.keyboard.press('Enter');
    const before = await ta(page).inputValue();
    await page.keyboard.type('hello brave new world', { delay: 60 });
    await expect.poll(() => page.evaluate(() => (CSS as unknown as { highlights: Map<string, unknown> }).highlights.has('mdprev-auth'))).toBe(true);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await ta(page).inputValue()).length).toBeLessThanOrEqual(before.length + 2);
  });

  test('mở tài liệu khác: cả văn bản là "có sẵn", không bị coi là tự gõ hay dán', async ({ page }) => {
    await start(page, '# Doc\n\n');
    await paste(page, 'PASTED');
    await expect.poll(() => marked(page)).toEqual(['PASTED']);
    await page.locator('input[type=file]').setInputFiles({ name: 'other.md', mimeType: 'text/markdown', buffer: Buffer.from('# Other\n\nopened text\n') });
    await expect(ta(page)).toHaveValue('# Other\n\nopened text\n');
    await expect.poll(() => marked(page)).toEqual([]);
    const insp = await openInspector(page, 'Checks');
    await expect(insp.locator('dt', { hasText: 'already there' }).locator('xpath=following-sibling::dd[1]')).toHaveText('100%');
  });
});
