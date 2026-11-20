import { expect, test, type Page } from '@playwright/test';
import { exportMenu, seedNotes } from './helpers';

test.beforeEach(async ({ context }) => { await seedNotes(context); });

const ta = (p: Page) => p.locator('.ed-ta');
const ready = (p: Page) => expect(p.locator('.pv-modetag')).toHaveText('READY');

test.describe('trang chủ công cụ-trước', () => {
  test('/ là trang công cụ: có editor, h1 mô tả, tiêu đề, mô tả và canonical riêng, cho phép lập chỉ mục', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.pv')).toBeVisible();
    await expect(ta(page)).toBeVisible();
    await expect(page.locator('.appbar .appbar-h1')).toHaveText('Markdown editor and agent skill inspector');
    await expect(page).toHaveTitle(/Markdown editor and agent skill inspector/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Free, no account, nothing uploaded/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test('1440×900: editor và thanh "What is mdprev?" cùng nằm trong màn hình đầu', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('.pv')).toBeVisible();
    const bar = (await page.locator('.about-bar').boundingBox())!;
    const pv = (await page.locator('.pv').boundingBox())!;
    expect(bar.height).toBeLessThanOrEqual(36); // thanh About thu gọn
    expect(bar.y + bar.height).toBeLessThanOrEqual(901);
    expect(pv.y + pv.height).toBeLessThanOrEqual(bar.y + 1);
  });

  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`${vp.width}×${vp.height}: bấm thanh tới phần giới thiệu, cuộn tới chân trang, không tràn ngang`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      await expect(page.locator('.pv')).toBeVisible();
      await page.locator('.about-bar').click();
      await expect(page.locator('#about')).toBeInViewport();
      await page.locator('.st-foot').scrollIntoViewIfNeeded();
      await expect(page.locator('.st-foot')).toBeInViewport();
      await expect(page.getByRole('heading', { level: 2, name: 'Know a skill before your agent does.' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('zen ẩn phần giới thiệu và thanh dưới, thoát zen thì hiện lại', async ({ page }) => {
    await page.goto('/');
    await expect(ta(page)).toBeVisible();
    await ta(page).evaluate((t: HTMLTextAreaElement) => t.focus());
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await expect(page.locator('html')).toHaveAttribute('data-focus', '1');
    await expect(page.locator('.about-bar')).toBeHidden();
    await expect(page.locator('#about')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-focus', '1');
    await expect(page.locator('.about-bar')).toBeVisible();
  });

  test('in: không kèm phần giới thiệu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.pv')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#about')).toBeHidden();
    await expect(page.locator('.about-bar')).toBeHidden();
    await expect(page.locator('.appbar')).toBeHidden();
  });

  test('hai tab / và /app/ dùng chung tài liệu đang soạn', async ({ page, context }) => {
    await page.goto('/');
    await ta(page).fill('# Same doc\n\nshared marker\n');
    await ready(page);
    await page.waitForFunction(() => (localStorage.getItem('mdprev-md') ?? '').includes('shared marker'));
    const other = await context.newPage();
    await other.goto('/app/');
    await expect(other.locator('.pv .md-doc h1')).toHaveText('Same doc');
  });

  test('link chia sẻ tạo trên / là /#d=… và mở được ở một tab khác', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'quyền clipboard chỉ cấp được trên Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await ta(page).fill('# Shared from home\n\nbody\n');
    await ready(page);
    await exportMenu(page).click();
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.locator('.pv-flash')).toHaveText('Copied share link');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(link).pathname).toBe('/');
    expect(link).toContain('#d=');
    const fresh = await context.newPage();
    await fresh.goto(link);
    await fresh.getByRole('alertdialog', { name: 'Open shared document' }).getByRole('button', { name: 'OPEN' }).click();
    await expect(fresh.locator('.pv .md-doc [data-h1]')).toHaveText('Shared from home');
  });
});

test.describe('trang chủ trên điện thoại thật (isMobile)', () => {
  test.use({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  for (const path of ['/', '/app/', '/app/inspect/']) {
    test(`${path}: bố cục không rộng hơn màn hình (trình duyệt không phải thu nhỏ trang)`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => innerWidth)).toBe(412);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
    });
  }
  test('/: không có dịch chuyển bố cục đáng kể khi editor thật thay khung tĩnh', async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => { try { localStorage.removeItem('mdprev-md'); } catch { /* bỏ qua */ } });
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Start writing/ }).click();
    await expect(page.locator('.pv .ed-ta')).toBeAttached();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.05);
  });
});

test.describe('khách lần đầu: editor chỉ nạp khi cần', () => {
  test.beforeEach(async ({ context }) => {
    // seedNotes (beforeEach ngoài) đặt tài liệu; ở đây xoá đi để giả lập khách chưa từng ghé
    await context.addInitScript(() => { try { localStorage.removeItem('mdprev-md'); } catch { /* bỏ qua */ } });
  });

  test('chưa tương tác: thấy khung tĩnh, KHÔNG nạp mã editor', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => { if (/MarkdownStudio/.test(r.url())) chunks.push(r.url()); });
    await page.goto('/');
    await expect(page.locator('.studio-facade')).toBeVisible();
    await expect(page.getByRole('button', { name: /Start writing/ })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(chunks).toEqual([]);
    await expect(page.locator('.pv')).toHaveCount(0);
  });

  test('bấm vào khung: editor nạp, nhận con trỏ và gõ được', async ({ page }) => {
    await page.goto('/');
    await page.locator('.studio-facade').click({ position: { x: 200, y: 200 } });
    await expect(page.locator('.pv .ed-ta')).toBeFocused({ timeout: 10_000 });
    await expect(page.locator('.studio-facade')).toBeHidden();
    await page.keyboard.type('hello');
    await expect(page.locator('.ed-ta')).toHaveValue(/hello/);
  });

  // Đổi hợp đồng (2026-11-18): Tab tới nút của thẻ chào không còn tự nạp editor (nạp sẽ thay khung giữa lúc người dùng bàn phím bấm Enter và
  // làm nút biến mất). Bàn phím vẫn tới được editor: Tab tới "Start writing" rồi Enter nạp editor và đưa con trỏ vào ô soạn.
  test('bàn phím: Tab tới "Start writing" chưa nạp; Enter thì editor nạp và nhận con trỏ', async ({ page }) => {
    await page.goto('/');
    const go = page.getByRole('button', { name: /Start writing/ });
    await go.focus();
    await page.waitForTimeout(600);
    await expect(page.locator('.pv')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('.pv .ed-ta')).toBeFocused({ timeout: 10_000 });
  });
});

test.describe('khách quay lại', () => {
  test('có tài liệu riêng: editor nạp ngay không cần tương tác, khung tĩnh không còn là điểm dừng Tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.pv .ed-ta')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.studio-facade')).toBeHidden();
    await expect(page.getByRole('button', { name: /Start writing/ })).toHaveCount(0);
  });
});

