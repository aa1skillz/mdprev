import { expect, test, type Page } from '@playwright/test';
import { openView } from './helpers';

/** Chế độ xuống dòng của khung soạn (ngoài zen): mặc định bật (tài liệu <= ~2000 dòng), tắt/bật ở menu VIEW. */
const ta = (p: Page) => p.locator('.ed-ta');
const LONG = 'This is a very long line of prose that must wrap inside the editor pane instead of running off the edge, because reading text that is cut off is a bad experience on a phone.';
const DOC = ['# Title', '', LONG, '', '## Second', '', LONG + ' ' + LONG, '', 'short'].join('\n');
const open = async (page: Page, md: string) => {
  await page.goto('/app/');
  await expect(page.locator('.pv .ed-ta')).toBeVisible();
  await ta(page).fill(md);
  await expect(page.locator('.pv-modetag')).toHaveText('READY');
};
const toggleWrap = async (page: Page) => { await openView(page); await page.getByRole('button', { name: /^Wrap lines/ }).click(); };

test.describe('xuống dòng, màn lớn', () => {
  test('mặc định bật: hai lớp ngắt dòng giống nhau, không cuộn ngang, số dòng thẳng hàng; tắt ở VIEW thì nhớ sau khi tải lại, bật lại được', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, DOC);
    await expect(ta(page)).toHaveAttribute('wrap', 'soft');
    await ta(page).fill(Array.from({ length: 8 }, () => DOC).join('\n\n'));
    await expect(page.locator('.pv')).toHaveAttribute('data-wrap', '1');
    const m = await page.evaluate(() => {
      const t = document.querySelector<HTMLTextAreaElement>('.ed-ta')!, hl = document.querySelector<HTMLElement>('.ed-hl')!;
      const lines = [...hl.querySelectorAll('.l')] as HTMLElement[];
      return { taH: t.scrollHeight, hlH: hl.scrollHeight, overflowX: t.scrollWidth - t.clientWidth, n: lines.length, tops: lines.map((l) => l.offsetTop), nums: lines.map((l) => getComputedStyle(l, '::before').content) };
    });
    expect(Math.abs(m.taH - m.hlH)).toBeLessThanOrEqual(2);
    expect(m.overflowX).toBeLessThanOrEqual(1);
    expect(m.n).toBe(8 * 9 + 7);
    expect(m.nums.slice(0, 4)).toEqual(Array(4).fill('counter(ln)'));
    expect(m.tops[7]! - m.tops[6]!).toBeGreaterThan(40); // dòng 7 dài hơn một dòng hiển thị: dòng 8 nằm thấp hơn hẳn
    await toggleWrap(page);
    await expect(ta(page)).toHaveAttribute('wrap', 'off');
    await page.reload();
    await expect(ta(page)).toHaveAttribute('wrap', 'off');
    await toggleWrap(page);
    await expect(ta(page)).toHaveAttribute('wrap', 'soft');
  });

  test('gõ trong chế độ xuống dòng: con trỏ luôn thấy, nội dung đúng', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, Array.from({ length: 80 }, (_, i) => `${i + 1} ${LONG}`).join('\n'));
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); t.scrollTop = t.scrollHeight; });
    await page.keyboard.type(' END');
    await expect(ta(page)).toHaveValue(/ END$/);
    const visible = await page.evaluate(() => {
      const t = document.querySelector<HTMLTextAreaElement>('.ed-ta')!;
      return t.scrollTop + t.clientHeight >= t.scrollHeight - 60;
    });
    expect(visible).toBe(true);
  });

  test('đồng bộ cuộn: kéo khung soạn thì bản xem cuộn theo (chế độ xuống dòng, chia đôi)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const md = Array.from({ length: 60 }, (_, i) => `## Section ${i + 1}\n\n${LONG} ${LONG}\n`).join('\n');
    await open(page, md);
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.scrollTop = t.scrollHeight / 2; t.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => page.locator('.pv-out').evaluate((o) => o.scrollTop)).toBeGreaterThan(300);
  });

  test('tắt lại thì về dạng không xuống dòng', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, DOC);
    await expect(ta(page)).toHaveAttribute('wrap', 'soft');
    await toggleWrap(page);
    await expect(ta(page)).toHaveAttribute('wrap', 'off');
    await expect(page.locator('.pv')).not.toHaveAttribute('data-wrap', '1');
  });
});

test.describe('xuống dòng, điện thoại', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  // khách mới trên điện thoại mở bài mẫu ở Read; các bài này kiểm ô soạn nên chọn sẵn Edit như người đã dùng trước đó (chỉ ở /app/; trang chủ phải tự vào Edit)
  test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { if (location.pathname.replace(/\/$/, '').endsWith('/app') && !localStorage.getItem('mdprev-md-ui')) localStorage.setItem('mdprev-md-ui', JSON.stringify({ view: 'src' })); } catch { /* bỏ qua */ } }); });
  test('mặc định bật: không còn dòng bị cắt ở mép, không cuộn ngang', async ({ page }) => {
    await open(page, DOC);
    await expect(ta(page)).toHaveAttribute('wrap', 'soft');
    const m = await page.evaluate(() => { const t = document.querySelector<HTMLTextAreaElement>('.ed-ta')!; return { overflowX: t.scrollWidth - t.clientWidth, pageX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    expect(m.overflowX).toBeLessThanOrEqual(1);
    expect(m.pageX).toBeLessThanOrEqual(0);
  });

  test('người dùng tắt thì được nhớ, không bị bật lại theo mặc định điện thoại', async ({ page }) => {
    await open(page, DOC);
    await toggleWrap(page);
    await expect(ta(page)).toHaveAttribute('wrap', 'off');
    await page.reload();
    await expect(ta(page)).toHaveAttribute('wrap', 'off');
  });

  test('căn lớp phủ: ~~gạch~~, **đậm**, `mã` không làm lệch ngắt dòng so với ô soạn', async ({ page }) => {
    const L = 'plain ~~struck words here~~ and **bold words here** plus `inline code` then more words to force the wrapping onto several rows of the narrow pane';
    await open(page, Array.from({ length: 12 }, () => L).join('\n'));
    const m = await page.evaluate(() => {
      const t = document.querySelector<HTMLTextAreaElement>('.ed-ta')!, hl = document.querySelector<HTMLElement>('.ed-hl')!;
      const rows = (hl.querySelector('.l') as HTMLElement).offsetHeight / parseFloat(getComputedStyle(t).lineHeight);
      return { taH: t.scrollHeight, hlH: hl.offsetHeight, rows };
    });
    expect(m.rows).toBeGreaterThan(3);
    expect(Math.abs(m.taH - m.hlH)).toBeLessThanOrEqual(2);
  });

  test('tài liệu 3000 dòng, wrap bật: gõ không có tác vụ dài kéo lê', async ({ page }) => {
    test.slow();
    await open(page, Array.from({ length: 3000 }, (_, i) => `line ${i} lorem ipsum dolor sit amet`).join('\n'));
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
    await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(e.duration); }).observe({ entryTypes: ['longtask'] }); });
    for (let i = 0; i < 10; i++) await page.keyboard.type('x');
    await page.waitForTimeout(300);
    const worst = await page.evaluate(() => Math.max(0, ...(window as unknown as { __lt: number[] }).__lt));
    console.log('wrap 390px, 3000 dòng, tác vụ dài nhất (ms):', worst);
    expect(worst).toBeLessThan(250);
  });

  test('trang chủ: phần ~~gạch~~ trong lớp tô màu không bị lớp CSS của trang tĩnh làm rộng ra', async ({ page }) => {
    await page.goto('/');
    await page.locator('.studio-facade').click();
    await expect(page.locator('.pv .ed-ta')).toBeVisible();
    await ta(page).fill('a ~~struck~~ b');
    const w = await page.evaluate(() => { const e = document.querySelector('.ed-hl .st') as HTMLElement; const cs = getComputedStyle(e); return { w: e.getBoundingClientRect().width, fs: cs.fontSize, mk: parseFloat(getComputedStyle(document.querySelector('.ed-hl .mk')!).fontSize) }; });
    expect(parseFloat(w.fs)).toBe(w.mk);
    expect(Math.abs(w.w - 6 * (w.mk * 0.571))).toBeLessThan(w.mk); // 6 ký tự mono ≈ 0,57 em mỗi ký tự
  });

  test('hàng phím Markdown: hiện khi ô soạn được chọn, chạm "B" in đậm vùng chọn mà không mất focus', async ({ page }) => {
    await open(page, 'hello world');
    await ta(page).evaluate((t: HTMLTextAreaElement) => t.blur());
    await expect(page.locator('.pv-keys')).toHaveCount(0);
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(0, 5); });
    await expect(page.locator('.pv-keys')).toBeVisible();
    await page.locator('.pv-keys button', { hasText: /^B$/ }).click();
    await expect(ta(page)).toHaveValue('**hello** world');
    await expect(ta(page)).toBeFocused();
    const box = await page.locator('.pv-keys').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);
  });
});

