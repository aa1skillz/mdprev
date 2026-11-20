import { expect, test } from '@playwright/test';

/** Giai đoạn 5d: những điều nhỏ nhưng người dùng thấy ngay. */
test('cuộn bánh xe tới cuối ô soạn ở `/` thì dừng, không kéo cả trang theo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const doc = '# Long\n\n' + Array.from({ length: 300 }, (_, i) => `Line ${i} with a few words.`).join('\n') + '\n';
  await page.addInitScript((d) => { try { localStorage.setItem('mdprev-md', d); } catch { /* bỏ qua */ } }, doc);
  await page.goto('/');
  await page.locator('.pv').waitFor({ state: 'visible' });
  const ta = page.locator('.ed-ta');
  await ta.evaluate((t: HTMLTextAreaElement) => { t.scrollTop = t.scrollHeight; });
  const box = (await ta.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('đường dẫn sai: trang 404 có một h1, không script, noindex, có lối về editor', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  const res = await page.goto('/this-page-does-not-exist/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('This page does not exist');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('link', { name: 'Open the editor' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(scripts).toEqual([]);
});
