import { expect, test, type Page } from '@playwright/test';
import { ready, seedNotes, seedSample } from './helpers';

// Các test dưới đây được viết khi bài mặc định của /app/ còn là bài mẫu; gieo lại bài mẫu để chúng bắt đầu đúng như trước (xem seedSample trong helpers.ts).
test.beforeEach(async ({ context }) => { await seedSample(context); });


/** Giai đoạn 2 Quiet Pro: một header cho /, /app/ và /app/inspect/. */
const PAGES = ['/', '/app/', '/app/inspect/'] as const;
const themeOf = (p: Page) => p.evaluate(() => document.documentElement.dataset['theme']);

test.describe('header chung', () => {
  for (const path of PAGES) {
    test(`${path}: cùng header, có dấu m, liên kết về trang chủ, nút Switch theme`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      const bar = page.locator('.appbar');
      await expect(bar).toBeVisible();
      await expect(bar.locator('.appbar-mark')).toBeVisible(); // logo là SVG; tên truy cập của liên kết là "mdprev"
      await expect(bar.getByRole('link', { name: 'mdprev', exact: true })).toBeVisible();
      await expect(bar.locator('a.appbar-brand')).toHaveAttribute('href', /\/$/);
      await expect(bar.getByRole('button', { name: 'Switch theme' })).toBeVisible();
    });

    test(`${path}: nút theme đổi đúng một lần, nhớ lựa chọn sau khi tải lại`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      const before = await themeOf(page);
      await page.locator('.appbar').getByRole('button', { name: 'Switch theme' }).click();
      const after = before === 'dark' ? 'light' : 'dark';
      expect(await themeOf(page)).toBe(after);
      expect(await page.evaluate(() => localStorage.getItem('mdprev-theme'))).toBe(after);
      await page.reload();
      await ready(page);
      expect(await themeOf(page)).toBe(after);
    });

    test(`${path}: điện thoại 390px không tràn ngang`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(path);
      await ready(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await ctx.close();
    });
  }

  test('phím d đổi thêm đúng một lần sau khi bấm nút (không cộng dồn)', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    const t0 = await themeOf(page);
    await page.locator('.appbar').getByRole('button', { name: 'Switch theme' }).click();
    const t1 = await themeOf(page);
    expect(t1).not.toBe(t0);
    await page.locator('.pv-name').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // (5,300) giờ rơi vào ô soạn nên không click body được nữa
    await page.keyboard.press('d');
    expect(await themeOf(page)).toBe(t0);
  });

  test('Inspector: header hiện nguồn đang xem', async ({ page }) => {
    await page.goto('/app/inspect/');
    await expect(page.locator('#appbar-where')).toHaveText('Skill inspector');
    await page.getByRole('button', { name: 'try an example' }).click();
    await expect(page.locator('#appbar-where')).toHaveText('Skill inspector / built-in example');
  });

  test('liên kết chéo giữa editor và Inspector', async ({ page }) => {
    await page.goto('/app/');
    const ins = page.locator('.appbar-ins');
    await expect(page.locator('.appbar').getByRole('link', { name: 'Inspect a skill' })).toHaveCount(0);
    await ins.locator('summary').click();
    await expect(ins).toHaveAttribute('open', '');
    await page.locator('.appbar-ins-in').fill('github.com/owner/repo');
    await page.keyboard.press('Escape');
    await expect(ins).not.toHaveAttribute('open', '');
    await ins.locator('summary').click();
    await page.locator('.appbar-ins-in').fill('github.com/owner/repo');
    await page.locator('.appbar-ins-in').press('Enter');
    await expect(page).toHaveURL(/\/app\/inspect\/\?u=github\.com(%2F|\/)owner(%2F|\/)repo$/);
    await expect(page.locator('.appbar').getByRole('link', { name: 'Editor' })).toHaveAttribute('href', /\/app\/$/);
  });

  test('ô tìm kiếm trong header mở Command palette', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    await page.locator('.appbar').getByRole('button', { name: 'Search or run a command' }).click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  });

  for (const w of [1280, 1440]) for (const path of ['/', '/app/']) {
    test(`${path} ở ${w}px: nhóm chế độ ở thanh tài liệu (hàng 2) dưới header, header vẫn một hàng`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      await seedNotes(ctx); // khách quay lại: trang chủ nạp editor ngay (khách mới chỉ thấy khung tĩnh cho tới khi bấm)
      const page = await ctx.newPage();
      await page.goto(path);
      await ready(page);
      await expect(page.locator('.pv')).toBeVisible();
      await expect(page.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
      await expect(page.locator('.appbar').getByRole('group', { name: 'View mode' })).toHaveCount(0);
      const h = await page.locator('.appbar').evaluate((e) => e.getBoundingClientRect().height);
      expect(h).toBeLessThanOrEqual(52);
      const doc = await page.locator('.pv-bar').evaluate((e) => e.getBoundingClientRect());
      expect(doc.top).toBeGreaterThanOrEqual(h - 1);
      expect(doc.width).toBeGreaterThanOrEqual(w - 20);
      await ctx.close();
    });
  }

  test('Inspector: trang không dài hơn màn hình (báo cáo và tab Files)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('example-skill');
    await page.getByRole('button', { name: 'Files' }).click();
    const over = await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
    expect(over).toBeLessThanOrEqual(2);
  });
  for (const path of ['/', '/app/']) {
    test(`${path} ở 1280px với tên tài liệu dài: không tràn ngang, nút theme còn trong màn hình`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('mdprev-md', '# A very long document title that keeps going and going for the header test\n\nbody\n'); } catch { /* bỏ qua */ } });
      const page = await ctx.newPage();
      await page.goto(path);
      await ready(page);
      await expect(page.locator('.pv-bar .pv-title')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const right = await page.locator('.appbar').getByRole('button', { name: 'Switch theme' }).evaluate((e) => e.getBoundingClientRect().right);
      expect(right).toBeLessThanOrEqual(1280);
      await ctx.close();
    });
  }
});
