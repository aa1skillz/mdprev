import { expect, test, devices } from '@playwright/test';
import { fileMenu, ready, viewOptions, viewTab } from './helpers';

/** Điện thoại: vùng chạm 44px, sheet full width, chrome nhường chỗ khi gõ. */
const phone = { ...devices['iPhone 13'] };

test('điện thoại: nút chrome cao ≥44px, sheet View full width, nhóm chế độ chỉ icon', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  for (const n of ['New document', 'Switch theme']) expect((await page.getByRole('button', { name: n }).boundingBox())!.height, n).toBeGreaterThanOrEqual(44);
  for (const n of ['Edit', 'Read', 'Zen'] as const) expect((await viewTab(page, n).boundingBox())!.height, n).toBeGreaterThanOrEqual(44);
  await expect(viewTab(page, 'Edit').locator('.lbl')).toBeHidden(); // icon-only: tên file cần chỗ
  await expect(page.getByRole('button', { name: 'View options', exact: true })).toBeHidden(); // vào menu File
  await fileMenu(page).click();
  await viewOptions(page).click();
  const b = (await page.locator('.pv-menu-view').boundingBox())!;
  expect(Math.round(b.x), 'sheet View sát mép trái').toBe(0);
  expect(Math.round(b.width), 'sheet View full width').toBe(390);
  await ctx.close();
});

test('điện thoại: gõ thì header ẩn (html[data-kb]), nút Done hạ bàn phím và header hiện lại', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  await expect(page.locator('.appbar')).toBeVisible();
  await page.locator('.ed-ta').focus();
  await expect(page.locator('html')).toHaveAttribute('data-kb', '');
  await expect(page.locator('.appbar')).toBeHidden();
  await expect(page.locator('.pv-keys-done')).toBeVisible();
  await page.locator('.pv-keys-done').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-kb', '');
  await expect(page.locator('.appbar')).toBeVisible();
  await ctx.close();
});

test('điện thoại: hàng phím cuộn ngang, vuốt không kích phím, chạm thì chèn', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  await page.locator('.ed-ta').fill('word');
  await page.locator('.ed-ta').focus();
  const keys = page.locator('.pv-keys-s');
  expect(await keys.evaluate((e) => e.scrollWidth > e.clientWidth), 'có nút nằm ngoài màn hình').toBe(true);
  const before = await page.locator('.ed-ta').inputValue();
  const box = (await keys.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 20, { steps: 6 });
  await page.mouse.up();
  expect(await page.locator('.ed-ta').inputValue(), 'vuốt không chèn gì').toBe(before);
  await ctx.close();
});
