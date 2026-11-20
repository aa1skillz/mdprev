import { expect, test, type Page } from '@playwright/test';
import { fileMenu, ready } from './helpers';

/**
 * Khách mới: tờ giấy trống + thẻ chào (WelcomeCard), không nạp sẵn bài mẫu. Khách quay lại không thấy thẻ.
 * Cờ đã chào: `mdprev-welcomed`. "Clear document": hộp hỏi riêng, bản cũ vào Restore previous.
 */
const ta = (p: Page) => p.locator('.ed-ta');
const card = (p: Page) => p.locator('.pv .welcome');
const facadeCard = (p: Page) => p.locator('.studio-facade .welcome');

test.describe('khách mới', () => {
  test.beforeEach(async ({ context }) => {
    // chỉ xoá MỘT lần mỗi phiên (cờ ở sessionStorage): script khởi tạo chạy lại ở mỗi lần điều hướng, kể cả reload, và sẽ xoá luôn dữ liệu test vừa tạo
    await context.addInitScript(() => { try { if (!sessionStorage.getItem('wc-init')) { sessionStorage.setItem('wc-init', '1'); localStorage.removeItem('mdprev-md'); localStorage.removeItem('mdprev-welcomed'); } } catch { /* bỏ qua */ } });
  });

  test('/: khung tĩnh có thẻ chào với ba nút thật, không có tiêu đề thật nào ngoài h1 của trang, không bài mẫu dựng sẵn', async ({ page }) => {
    await page.goto('/');
    await expect(facadeCard(page)).toBeVisible();
    for (const n of ['Start writing', 'Open file']) await expect(facadeCard(page).getByRole('button', { name: n })).toBeVisible();
    await expect(facadeCard(page).getByRole('link', { name: 'Inspect a skill' })).toHaveAttribute('href', /\/app\/inspect\/$/);
    await expect(facadeCard(page).locator('h1, h2, h3, h4, h5, h6')).toHaveCount(0);
    await expect(page.locator('.studio-facade')).not.toContainText('Better meetings');
    expect(await page.locator('h1').count()).toBe(1);
  });

  test('/: gõ một phím in được khi editor chưa nạp: editor nạp, chữ đó nằm trong ô soạn, thẻ tắt, cờ được đặt', async ({ page }) => {
    await page.goto('/');
    await expect(facadeCard(page)).toBeVisible();
    await page.keyboard.type('Hi');
    await expect(ta(page)).toBeFocused({ timeout: 10_000 });
    await expect(ta(page)).toHaveValue(/^Hi/);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('mdprev-welcomed'))).toBe('1');
  });

  test('/: Enter trên "Start writing" nạp editor, tắt thẻ và nhận con trỏ; Tab tới nút không tự nạp (nút còn đó cho Enter)', async ({ page }) => {
    await page.goto('/');
    const go = facadeCard(page).getByRole('button', { name: 'Start writing' });
    await go.focus();
    await page.waitForTimeout(500);
    await expect(page.locator('.pv')).toHaveCount(0); // chưa nạp
    await page.keyboard.press('Enter');
    await expect(ta(page)).toBeFocused({ timeout: 10_000 });
    await expect(card(page)).toHaveCount(0);
  });

  test('/: "Open file" nạp editor rồi mở menu Open (không dựa vào cử chỉ người dùng đã nguội)', async ({ page }) => {
    await page.goto('/');
    await facadeCard(page).getByRole('button', { name: 'Open file' }).click();
    await expect(page.getByRole('button', { name: 'Open…' })).toBeVisible({ timeout: 10_000 });
    await expect(card(page)).toHaveCount(0);
  });

  test('/: "or try a sample" nạp bài mẫu có thanh SAMPLE; sửa một chữ thì thanh biến mất', async ({ page }) => {
    await page.goto('/');
    await facadeCard(page).getByRole('button', { name: 'or try a sample' }).click();
    await expect(ta(page)).toHaveValue(/Better meetings/, { timeout: 10_000 });
    await expect(card(page)).toHaveCount(0);
    const bar = page.getByRole('note').filter({ hasText: 'SAMPLE' });
    await expect(bar).toBeVisible();
    await ta(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('x');
    await expect(bar).toHaveCount(0);
  });

  test('/app/: thẻ chào trong editor; Esc tắt và đặt cờ; Tab, "/" và phím chức năng không tắt thẻ', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    await expect(card(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(card(page)).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('mdprev-welcomed'))).toBe('1');
    await expect(ta(page)).toBeFocused();
    await expect(ta(page)).toHaveValue('');
  });

  test('/app/: gõ chữ đầu tiên tắt thẻ và chữ không bị nuốt; tải lại thì không hiện thẻ nữa', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    await page.keyboard.type('Notes');
    await expect(card(page)).toHaveCount(0);
    await expect(ta(page)).toHaveValue('Notes');
    await page.reload();
    await ready(page);
    await expect(card(page)).toHaveCount(0);
  });

  test('/app/: đã tắt thẻ rồi xoá hết chữ: không hiện lại thẻ, chỉ còn trạng thái trống của bản xem', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    await page.keyboard.type('abc');
    await ta(page).fill('');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('.pv-empty')).toBeVisible();
  });

  test('chuyển động: có chuột thì thẻ trượt nhẹ theo con trỏ; yêu cầu giảm chuyển động thì đứng yên', async ({ page, browser }) => {
    await page.goto('/app/');
    await ready(page);
    await page.mouse.move(60, 400);
    await page.waitForTimeout(500);
    const moved = await page.locator('.pv .wc-card').evaluate((e) => getComputedStyle(e).transform);
    expect(moved).not.toBe('none');
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => { try { localStorage.removeItem('mdprev-md'); localStorage.removeItem('mdprev-welcomed'); } catch { /* bỏ qua */ } });
    await p2.goto('/app/');
    await ready(p2);
    await p2.mouse.move(60, 400);
    await p2.waitForTimeout(500);
    expect(await p2.locator('.pv .wc-card').evaluate((e) => getComputedStyle(e).transform)).toBe('none');
    await ctx.close();
  });
});

test.describe('điện thoại', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => { try { localStorage.removeItem('mdprev-md'); localStorage.removeItem('mdprev-welcomed'); } catch { /* bỏ qua */ } });
  });

  test('/app/: thẻ gọn (không cảnh nền), không tràn ngang; "Start writing" đưa vào Edit và tắt thẻ', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    await expect(card(page)).toBeVisible();
    await expect(page.locator('.pv .wc-art')).toBeHidden();
    await expect(page.locator('.pv .wc-pts')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await card(page).getByRole('button', { name: 'Start writing' }).tap();
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('.pv')).toHaveAttribute('data-sview', 'src');
  });
});

test.describe('Clear document', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => { try { if (localStorage.getItem('mdprev-md') === null) localStorage.setItem('mdprev-md', '# Mine\n\nreal words'); localStorage.setItem('mdprev-welcomed', '1'); } catch { /* bỏ qua */ } });
  });

  test('File ▾ → Clear document: "Keep editing" giữ chữ; xác nhận thì trống; Restore previous đưa chữ về', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/');
    await ready(page);
    await fileMenu(page).click();
    await page.getByRole('button', { name: 'Clear document' }).click();
    const ask = page.getByRole('alertdialog', { name: 'Clear this document' });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText('Undo');
    await ask.getByRole('button', { name: 'Keep editing' }).click();
    await expect(ask).toHaveCount(0);
    await expect(ta(page)).toHaveValue(/real words/);
    await fileMenu(page).click();
    await page.getByRole('button', { name: 'Clear document' }).click();
    await ask.getByRole('button', { name: 'Clear document' }).click();
    await expect(ta(page)).toHaveValue('');
    await expect(page.getByRole('status').filter({ hasText: 'Cleared the document' })).toBeVisible();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: /Restore previous/ }).first().click();
    await expect(ta(page)).toHaveValue(/real words/);
  });

  test('Esc đóng hộp Clear mà không xoá; New mở tab mới không hỏi', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/');
    await ready(page);
    await fileMenu(page).click();
    await page.getByRole('button', { name: 'Clear document' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Clear this document' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(ta(page)).toHaveValue(/real words/);
    await page.getByRole('button', { name: 'New document' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0); // New mở tab mới, không hỏi
    await expect(page.locator('.pv-tabgo')).toHaveCount(2);
  });

  test('palette tìm được "Clear document" và mở đúng hộp hỏi', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/');
    await ready(page);
    await page.keyboard.press('Control+/');
    await page.getByRole('textbox', { name: 'Command palette' }).fill('clear document');
    await expect(page.locator('[role=dialog][aria-label="Command palette"]')).toContainText('Clear document');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog', { name: 'Clear this document' })).toBeVisible();
  });

  test('bài mẫu nguyên văn: nút Clear của thanh SAMPLE xoá thẳng (không phải chữ của khách), không hỏi', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => { try { localStorage.removeItem('mdprev-md'); } catch { /* bỏ qua */ } });
    await page.goto('/app/');
    await ready(page);
    await fileMenu(page).click();
    await page.getByRole('button', { name: 'Sample', exact: true }).click();
    await expect(ta(page)).toHaveValue(/Better meetings/);
    await page.getByRole('note').filter({ hasText: 'SAMPLE' }).getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(ta(page)).toHaveValue('');
  });

  test('khách quay lại có chữ riêng: không thấy thẻ chào', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    await expect(ta(page)).toHaveValue(/real words/);
    await expect(card(page)).toHaveCount(0);
  });
});
