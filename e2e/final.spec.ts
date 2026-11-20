import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ready, seedSample } from './helpers';

// Các test dưới đây được viết khi bài mặc định của /app/ còn là bài mẫu; gieo lại bài mẫu để chúng bắt đầu đúng như trước (xem seedSample trong helpers.ts).
test.beforeEach(async ({ context }) => { await seedSample(context); });


/** Chốt phiên bản web đầu: ⌘S không bật hộp thoại, spellcheck chỉ off hoặc English, privacy và FAQ khớp tính năng. */
test('⌘/Ctrl+S: không mở hộp thoại lưu hay tải tệp, chỉ báo đã lưu trong trình duyệt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { (window as unknown as Record<string, unknown>)['showSaveFilePicker'] = () => { (window as unknown as Record<string, unknown>)['__picker'] = true; return Promise.reject(new Error('x')); }; });
  await page.goto('/app/');
  await ready(page);
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.locator('.ed-ta').click();
  await page.keyboard.type('hello');
  await page.keyboard.press('Control+s');
  await expect(page.getByText(/saved in this browser/i).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__picker'] ?? false)).toBe(false);
  expect(downloads).toEqual([]);
});

test('spellcheck: chỉ Off và English', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-spell', 'vi'); } catch { /* bỏ qua */ } });
  await page.goto('/app/');
  await ready(page);
  await expect(page.locator('.ed-ta')).toHaveAttribute('spellcheck', 'false'); // giá trị vi cũ về Off
  await page.getByRole('button', { name: 'View options' }).click();
  await expect(page.getByRole('button', { name: /^Vietnamese/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^English/ })).toBeVisible();
});

test('privacy nhắc bản sao skill; trang skill-inspector có FAQ sửa bản sao', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByText('A copy of a skill you chose to edit')).toBeVisible();
  await page.goto('/skill-inspector/');
  await expect(page.getByText('Can I fix a skill here?')).toBeVisible();
});

test('/app/: CLS khi nạp và dựng sơ đồ gần 0 (kiểm chặn lỗi nhẹ; lỗi thanh cuộn do Mermaid chỉ lộ ra với thanh cuộn thật, đã đo bằng Lighthouse)', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 940 });
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__shift += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/app/');
  await ready(page);
  await expect(page.locator('.pv-out figure.mermaid').first()).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBeLessThan(0.02);
});

test('/app/: chunk editor không nạp được thì header vẫn hiện sau ~2,5 s (lưới an toàn)', async ({ page }) => {
  await page.route('**/MarkdownStudio.*.js', (r) => r.abort());
  await page.goto('/app/');
  const ins = page.locator('.appbar-ins summary');
  await expect(ins).toBeHidden();
  await expect(ins).toBeVisible({ timeout: 6000 });
});

test('điện thoại 390px: chrome gọn, Export ở header và trong menu File, Inspector là pane, không tràn ngang', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/');
  await ready(page);
  await expect(page.locator('.appbar .pv-exportwrap')).toBeVisible(); // Export là hành động chính: luôn thấy ở header
  await expect(page.locator('.pv-lint, .pv-outbtn, .pv-rail, .pv-fm')).toHaveCount(0);
  const bar = await page.locator('.pv-bar').boundingBox();
  expect(bar!.height).toBeLessThan(60); // tên file, chế độ, Aa, Inspector cùng một hàng
  await page.getByRole('button', { name: 'File menu', exact: true }).click();
  await page.locator('.pv-menu-file').getByRole('button', { name: /^Export/ }).click();
  await expect(page.getByRole('button', { name: /Download Markdown/ })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`điện thoại 390px (${scheme}): axe sạch với Inspector mở và với menu File mở`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    await seedSample(ctx); // bài mặc định giờ là tờ giấy trống: gieo bài mẫu như trước (xem seedSample)
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    await page.getByRole('button', { name: 'File menu', exact: true }).click();
    await page.locator('.pv-menu-file').getByRole('button', { name: /^Export/ }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Inspector', exact: true }).click();
    await page.getByRole('tab', { name: 'Checks' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await ctx.close();
  });
}
