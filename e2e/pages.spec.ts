import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { publicPages } from './helpers';

/** Các trang tĩnh (không có editor): mọi trang công khai trừ trang chủ. */
const STATIC = publicPages().filter((p) => p !== '/');

test.describe('trang tĩnh công khai', () => {
  test('có đủ các trang đã hứa', () => {
    expect(STATIC).toEqual(['/features/', '/guides/', '/guides/how-much-context-does-a-skill-cost/', '/guides/install-a-skill-in-claude-code/', '/guides/markdown-to-pdf-word-and-slides/', '/guides/publish-a-markdown-vault-as-a-static-site/', '/guides/share-a-markdown-document-with-a-password/', '/guides/what-is-inside-a-skill-md/', '/privacy/', '/skill-inspector/']);
  });

  for (const path of STATIC) {
    test(`${path}: một h1, không nạp script nào, liên kết nội bộ không chết`, async ({ page, request }) => {
      const scripts: string[] = [];
      page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      expect(scripts).toEqual([]);
      const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
      const internal = [...new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//')).map((h) => h.split('#')[0]!))];
      expect(internal.length).toBeGreaterThan(0);
      for (const h of internal) expect((await request.get(h)).status(), `${path} → ${h}`).toBe(200);
    });

    for (const theme of ['light', 'dark']) {
      test(`${path}: axe sạch (${theme})`, async ({ page }) => {
        await page.addInitScript((t) => { try { localStorage.setItem('mdprev-theme', t); } catch { /* bỏ qua */ } }, theme);
        await page.goto(path);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
      });
    }
  }

  test('trang chủ: mọi liên kết nội bộ không chết', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
    const internal = [...new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//')).map((h) => h.split('#')[0]!))].filter(Boolean);
    expect(internal).toEqual(expect.arrayContaining(['/skill-inspector/', '/guides/', '/privacy/', '/app/inspect/']));
    for (const h of internal) expect((await request.get(h)).status(), `/ → ${h}`).toBe(200);
  });

  test('/skill-inspector/: form chuyển sang /app/inspect/?u=… kể cả khi tắt JavaScript (CSP cho phép form cùng nguồn)', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/skill-inspector/');
    await page.getByLabel('GitHub link to a skill or a repository').fill('github.com/anthropics/skills');
    await Promise.all([page.waitForURL(/\/app\/inspect\/\?u=github\.com%2Fanthropics%2Fskills$/), page.getByRole('button', { name: 'Inspect' }).click()]);
    await ctx.close();
  });

  test('/skill-inspector/ → /app/inspect/?u=…: nhập thật chạy (GitHub giả)', async ({ page }) => {
    const CORS = { 'access-control-allow-origin': '*' };
    await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ tree: [{ path: 'skills/a/SKILL.md', type: 'blob', size: 60 }], truncated: false }) }));
    await page.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, headers: CORS, body: '---\nname: a\ndescription: Does a. Use when a.\n---\nbody\n' }));
    await page.goto('/skill-inspector/');
    await page.getByLabel('GitHub link to a skill or a repository').fill('github.com/o/r');
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page).toHaveURL(/\/app\/inspect\/\?u=/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('a', { timeout: 10_000 });
  });

  test.describe('điện thoại thật (isMobile)', () => {
    test.use({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
    for (const path of STATIC) {
      test(`${path}: bố cục không rộng hơn màn hình`, async ({ page }) => {
        await page.goto(path);
        expect(await page.evaluate(() => innerWidth)).toBe(412);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
      });
    }
  });

  test('/guides/: liệt kê cả sáu bài và mỗi bài mở được', async ({ page }) => {
    await page.goto('/guides/');
    const links = page.locator('.guide-list a');
    await expect(links).toHaveCount(6);
    await links.first().click();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('article.art')).toBeVisible();
  });
});
