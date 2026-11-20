import { expect, test, type Page } from '@playwright/test';
import { openInspector } from './helpers';

/** Muse vòng 4: Ctrl+F, History cập nhật trực tiếp, tam giác details, nút link không scheme. Gõ bằng bàn phím và chuột thật. */
const ta = (p: Page) => p.locator('.ed-ta');
const open = async (page: Page, md = '') => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await expect(ta(page)).toBeVisible();
  await ta(page).fill(md);
  await ta(page).focus();
};
const val = (p: Page) => ta(p).inputValue();

test.describe('Ctrl/⌘+F mở Find & Replace', () => {
  test('từ ô soạn', async ({ page }) => {
    await open(page, 'hello world');
    await page.keyboard.press('Control+f');
    await expect(page.locator('.pv-find')).toBeVisible();
  });
  test('khi focus ở bản xem hoặc thân trang (không ở ô soạn)', async ({ page }) => {
    await open(page, '# Title\n\nhello world');
    await page.locator('.md-doc h1').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('.pv-find')).toBeVisible();
  });
  test('Cmd+F (Meta) cũng mở, và Ctrl+F lần nữa focus lại ô tìm', async ({ page }) => {
    await open(page, 'hello world');
    await page.keyboard.press('Meta+f');
    await expect(page.locator('.pv-find')).toBeVisible();
    await ta(page).focus();
    await page.keyboard.press('Control+f');
    await expect(page.locator('.pv-find input').first()).toBeFocused();
  });
});

test('History: ngăn Changes cập nhật ngay khi gõ, không cần bấm lại tab', async ({ page }) => {
  await open(page, 'one\n');
  const panel = await openInspector(page, 'History');
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'changes', exact: true }).first().click().catch(() => undefined);
  await ta(page).focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('two');
  await expect(page.locator('.hs, .pv-insp').getByText(/Same as when this page was opened/i)).toHaveCount(0, { timeout: 4000 });
});

test('details: bấm tam giác lần đầu là mở/đóng ngay', async ({ page }) => {
  await open(page, '<details>\n<summary>Gấp</summary>\n\nẨn bên trong\n\n</details>\n\nSau đó\n');
  await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Split', exact: true }).click();
  const d = page.locator('.md-doc details').first();
  await expect(d).toBeVisible();
  const box = (await d.locator('summary').boundingBox())!;
  const isOpen = () => d.evaluate((e: HTMLDetailsElement) => e.open);
  await page.mouse.click(box.x + 6, box.y + box.height / 2); // đúng chỗ tam giác
  await expect.poll(isOpen).toBe(true);
  await page.waitForTimeout(700); // bản xem dựng lại sau khi bấm cũng không được làm nó đóng lại
  expect(await isOpen()).toBe(true);
  await page.mouse.click(box.x + 6, box.y + box.height / 2);
  await expect.poll(isOpen).toBe(false);
  await page.waitForTimeout(700);
  expect(await isOpen()).toBe(false);
});

test('nút link: gõ tên miền không scheme rồi rời ô URL thì tự thêm https://', async ({ page }) => {
  await open(page, 'xem docs');
  await ta(page).evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(4, 8));
  await page.getByRole('button', { name: /^link/ }).first().click();
  await page.keyboard.type('example.com');
  expect(await val(page)).toBe('xem [docs](example.com)'); // đang gõ thì chưa sửa
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => val(page)).toBe('xem [docs](https://example.com)'); // selectionchange tới bất đồng bộ
  await page.keyboard.type('!');
  expect(await val(page)).toBe('xem [docs](https://example.com)!'); // con trỏ ở ngay sau dấu )
});

test('nút link: gõ tên miền rồi bấm ra ngoài (ô soạn mất focus) cũng thêm https://', async ({ page }) => {
  await open(page, 'xem docs');
  await ta(page).evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(4, 8));
  await page.getByRole('button', { name: /^link/ }).first().click();
  await page.keyboard.type('example.com');
  await ta(page).evaluate((e: HTMLTextAreaElement) => e.blur());
  await expect.poll(() => val(page)).toBe('xem [docs](https://example.com)');
});

test('nút link: gõ URL đầy đủ có scheme thì giữ nguyên, không thêm lần nữa', async ({ page }) => {
  await open(page, 'xem docs');
  await ta(page).evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(4, 8));
  await page.getByRole('button', { name: /^link/ }).first().click();
  await page.keyboard.type('http://a.dev/x');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await val(page)).toBe('xem [docs](http://a.dev/x)');
});

test('nút link: bỏ qua placeholder (không gõ gì) thì để nguyên https://', async ({ page }) => {
  await open(page, 'xem docs');
  await ta(page).evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(4, 8));
  await page.getByRole('button', { name: /^link/ }).first().click();
  expect(await val(page)).toBe('xem [docs](https://)');
});
