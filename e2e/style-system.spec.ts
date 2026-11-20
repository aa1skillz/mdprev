import { expect, test } from '@playwright/test';
import { ready, seedSample } from './helpers';

// Các test dưới đây được viết khi bài mặc định của /app/ còn là bài mẫu; gieo lại bài mẫu để chúng bắt đầu đúng như trước (xem seedSample trong helpers.ts).
test.beforeEach(async ({ context }) => { await seedSample(context); });


/** Hệ thống thiết kế Quiet Pro: hành vi thật của token ở in ấn và điều khiển gốc (luật tĩnh ở tests/style-system.test.ts). */
test.describe('Quiet Pro', () => {
  test('in từ theme tối ra nền trắng, liên kết xanh accent sáng', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-theme', 'dark'); } catch { /* bỏ qua */ } });
    await page.goto('/app/');
    await ready(page);
    await page.locator('.md-doc a').first().waitFor({ state: 'attached' });
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => ({
      bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      link: getComputedStyle(document.querySelector('.md-doc a')!).color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(r.bg).toBe('#fff');
    expect(r.link).toBe('rgb(30, 91, 161)');
    expect(r.scheme).toBe('light'); // checkbox và điều khiển gốc in ra kiểu sáng trên giấy trắng
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`điều khiển gốc theo theme (${theme}): color-scheme`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('mdprev-theme', t); } catch { /* bỏ qua */ } }, theme);
      await page.goto('/app/');
      await ready(page);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
    });
  }
  test.describe('theme theo hệ điều hành', () => {
    const themeOf = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.dataset['theme']);
    test('lần đầu (bộ nhớ trống) theo hệ điều hành tối', async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: 'dark' });
      const page = await ctx.newPage();
      await page.goto('/app/');
      await ready(page);
      expect(await themeOf(page)).toBe('dark');
      await ctx.close();
    });
    test('lựa chọn đã lưu thắng hệ điều hành', async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: 'dark' });
      await ctx.addInitScript(() => { try { localStorage.setItem('mdprev-theme', 'light'); } catch { /* bỏ qua */ } });
      const page = await ctx.newPage();
      await page.goto('/app/');
      await ready(page);
      expect(await themeOf(page)).toBe('light');
      await ctx.close();
    });
    test('hệ điều hành đổi sau khi tải thì theo, trừ khi đã có lựa chọn', async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: 'light' });
      const page = await ctx.newPage();
      await page.goto('/app/');
      await ready(page);
      expect(await themeOf(page)).toBe('light');
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => themeOf(page)).toBe('dark');
      await ctx.close();
    });
    test('đã lưu light thì hệ điều hành đổi sang tối lúc đang mở vẫn light', async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: 'light' });
      await ctx.addInitScript(() => { try { localStorage.setItem('mdprev-theme', 'light'); } catch { /* bỏ qua */ } });
      const page = await ctx.newPage();
      await page.goto('/app/');
      await ready(page);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(300);
      expect(await themeOf(page)).toBe('light');
      await ctx.close();
    });
    test('xoá lựa chọn ở tab khác: cửa sổ pop-out quay về theo hệ điều hành', async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: 'dark' });
      const a = await ctx.newPage();
      await a.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('mdprev-theme', 'light'); } } catch { /* bỏ qua */ } });
      await a.goto('/app/preview/');
      expect(await themeOf(a)).toBe('light');
      const b = await ctx.newPage();
      await b.goto('/app/');
      await b.evaluate(() => localStorage.removeItem('mdprev-theme'));
      await expect.poll(() => themeOf(a)).toBe('dark');
      await ctx.close();
    });
    test('cửa sổ pop-out cũng theo hệ điều hành', async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: 'dark' });
      const page = await ctx.newPage();
      await page.goto('/app/preview/');
      expect(await themeOf(page)).toBe('dark');
      await ctx.close();
    });
  });
});
