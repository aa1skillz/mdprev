import { expect, test, type Page } from '@playwright/test';

/** Thanh định dạng nổi khi bôi đen (ngoài zen). */
const ta = (p: Page) => p.locator('.ed-ta');
const sel = (p: Page, a: number, b: number) => ta(p).evaluate((t: HTMLTextAreaElement, [x, y]) => { t.focus(); t.setSelectionRange(x as number, y as number); }, [a, b]);
const open = async (page: Page) => { await page.goto('/app/'); if ((page.viewportSize()?.width ?? 1440) <= 640) await page.getByRole('button', { name: 'Edit', exact: true }).click(); /* điện thoại mở bài mẫu ở Read */ await ta(page).fill('hello world\n\nsecond line here'); await expect(page.locator('.pv-modetag')).toHaveText('READY'); };

for (const [name, w] of [['màn lớn', 1440], ['điện thoại', 390]] as const) {
  test.describe(`thanh nổi khi bôi đen, ${name}`, () => {
    test.use({ viewport: { width: w, height: 800 } });
    test('hiện khi có vùng chọn, nằm trong khung soạn; B in đậm vùng chọn; ẩn khi bỏ chọn', async ({ page }) => {
      await open(page);
      await sel(page, 0, 0);
      await expect(page.locator('.pv-selbar')).toHaveCount(0);
      await sel(page, 0, 5);
      const bar = page.locator('.pv-selbar');
      await expect(bar).toBeVisible();
      const b = await bar.boundingBox(), e = await page.locator('.ed-main').boundingBox();
      expect(b!.x).toBeGreaterThanOrEqual(e!.x - 1);
      expect(b!.x + b!.width).toBeLessThanOrEqual(e!.x + e!.width + 1);
      expect(b!.y).toBeGreaterThanOrEqual(e!.y - 1);
      await bar.locator('button', { hasText: /^B$/ }).click();
      await expect(ta(page)).toHaveValue(/^\*\*hello\*\* world/);
      await expect(ta(page)).toBeFocused();
      await sel(page, 14, 14);
      await expect(bar).toHaveCount(0);
    });
    test('không hiện trong zen', async ({ page }) => {
      await open(page);
      await sel(page, 0, 5);
      await expect(page.locator('.pv-selbar')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.keyboard.press('f');
      await expect(page.locator('.pv[data-zen]')).toHaveCount(1);
      await expect(page.locator('.pv-selbar')).toHaveCount(0);
    });
  });
}
