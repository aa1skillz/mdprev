import { expect, test, type Page } from '@playwright/test';
import { openInspector, ready } from './helpers';

test.use({ viewport: { width: 1400, height: 900 } });

async function seed(page: Page, md: string) {
  await page.addInitScript((m: string) => { localStorage.setItem('mdprev-md', m); }, md);
  await page.goto('/app/');
  await ready(page);
}

/** Độ trễ từ keydown tới khung hình kế tiếp, cho n phím gõ cách nhau `gap` ms (gần nhịp gõ người). */
async function typingLatency(page: Page, n: number, gap: number): Promise<{ avg: number; max: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[] };
    w.__lat = [];
    document.addEventListener('keydown', () => { const t0 = performance.now(); requestAnimationFrame(() => setTimeout(() => w.__lat.push(performance.now() - t0), 0)); }, true);
  });
  for (let i = 0; i < n; i++) { await page.keyboard.type(i % 6 === 5 ? ' ' : 'w'); await page.waitForTimeout(gap); }
  await page.waitForTimeout(400);
  const lat = await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat);
  return { avg: lat.reduce((a, b) => a + b, 0) / lat.length, max: Math.max(...lat) };
}

test.describe('Style Check trong tab Checks', () => {
  test('hiện thống kê và gợi ý tiếng Anh, bỏ qua code; nhấp mục nhảy tới dòng', async ({ page }) => {
    await seed(page, '# Notes\n\nWe met in order to discuss the plan.\n\nThe report was written by the team.\n\n```\nvery very\n```\n');
    const insp = await openInspector(page, 'Checks');
    await expect(insp.getByRole('heading', { name: 'Writing' })).toBeVisible();
    await expect(insp.getByRole('heading', { name: 'Style suggestions · 2' })).toBeVisible();
    await expect(insp.getByRole('button', { name: 'L3 Wordy "in order to": try "to" (wordy suggestion)' })).toBeVisible();
    await expect(insp.getByRole('button', { name: /L5 Passive voice "was written".*passive suggestion/ })).toBeVisible();
    await expect(insp.getByText('Suggestions, not errors', { exact: false })).toBeVisible();
    await insp.getByRole('button', { name: /^L5 Passive/ }).click();
    const caretLine = await page.locator('.ed-ta').evaluate((t: HTMLTextAreaElement) => t.value.slice(0, t.selectionStart).split('\n').length);
    expect(caretLine).toBe(5);
    // badge của tab Checks chỉ đếm lỗi Markdown, không đếm gợi ý
    await expect(page.getByRole('tab', { name: 'Checks' })).toHaveText('Checks');
    // nhật ký số từ viết hôm nay: gõ thêm 3 từ thì cộng 3 (lưu cục bộ)
    await page.keyboard.press('End');
    await page.keyboard.type(' one two three', { delay: 20 });
    await expect.poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mdprev-writing-log') ?? '{}') as Record<string, number>)[0] ?? 0)).toBe(3);
  });

  test('tài liệu 3000 dòng, Checks mở: gõ không chậm', async ({ page }) => {
    test.setTimeout(90_000);
    const para = 'The report was written in order to explain why the result looked very odd to the team, and it was basically fine.';
    const md = '# Long\n\n' + Array.from({ length: 3000 }, (_, i) => (i % 3 === 2 ? '' : `${para} Line ${i}.`)).join('\n') + '\n';
    await seed(page, md);
    const insp = await openInspector(page, 'Checks');
    await expect(insp.getByRole('heading', { name: /Style suggestions · \d+/ })).toBeVisible({ timeout: 20_000 });
    await page.locator('.ed-ta').click();
    await page.keyboard.press('Control+End');
    const lat = await typingLatency(page, 40, 120);
    console.log(`typing latency, 3000 lines + Checks open: avg ${lat.avg.toFixed(1)} ms, max ${lat.max.toFixed(1)} ms`);
    expect(lat.avg).toBeLessThan(50);
    await expect(insp.getByText('Showing the first 200', { exact: false })).toBeVisible();
  });
});
