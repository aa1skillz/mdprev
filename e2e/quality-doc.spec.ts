/**
 * Chất lượng của một Markdown editor thật: tài liệu thử toàn diện (toán LaTeX, sơ đồ, bảng, code, danh sách, HTML được phép) chạy qua bản xem
 * và được đo chứ không chỉ "có render": typography, khoảng cách giữa các block, bề rộng, overflow, và độ nhất quán Light/Dark.
 * Fixture: e2e/fixtures/quality-doc.md (đừng rút gọn: mỗi phần của nó từng là một lỗi thật).
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { viewTab } from './helpers';

const DOC = readFileSync('e2e/fixtures/quality-doc.md', 'utf8').replace(/\r\n/g, '\n');

/** Nạp tài liệu, chuyển sang Read, cuộn qua từng tiêu đề để các sơ đồ (vẽ lười khi tới gần màn hình) được dựng. */
async function loadDoc(page: Page): Promise<void> {
  await page.goto('/app/');
  await page.locator('.ed-ta').fill(DOC);
  await viewTab(page, 'Read').click();
  await expect(page.locator('.md-doc h2').first()).toBeVisible();
  const heads = page.locator('.md-doc h2, .md-doc h3');
  const n = await heads.count();
  for (let i = 0; i < n; i++) { await heads.nth(i).evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(120); }
  await expect(page.locator('.md-doc svg[aria-roledescription]')).toHaveCount(4, { timeout: 25_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.md-doc h1').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
}

/** Số đo typography/khoảng cách không phụ thuộc màu, để so Light với Dark. */
const metrics = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('.md-doc')!;
  const cs = (s: string) => { const e = root.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { size: c.fontSize, lh: c.lineHeight, font: c.fontFamily.split(',')[0], mt: c.marginTop, mb: c.marginBottom }; };
  const TEXT = new Set(['P', 'H1', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE', 'HR', 'TABLE']);
  const kids = [...root.children].filter((e) => e.getBoundingClientRect().height > 0);
  const gaps: Record<string, number[]> = {};
  for (let i = 1; i < kids.length; i++) {
    const a = kids[i - 1]!, b = kids[i]!;
    if (!TEXT.has(a.tagName) || !TEXT.has(b.tagName)) continue;
    (gaps[a.tagName + '>' + b.tagName] ||= []).push(Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom));
  }
  return { h1: cs('h1'), h2: cs('h2'), h3: cs('h3'), p: cs('p'), li: cs('li'), td: cs('td'), pre: cs('pre code'), width: Math.round(root.getBoundingClientRect().width), gaps };
});

test.describe('chất lượng bản xem: tài liệu thử toàn diện', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('mọi thành phần được render đúng: toán LaTeX, kbd, details, 4 sơ đồ, bảng, code, tick task', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await loadDoc(page);
    const root = page.locator('.md-doc');
    // toán: \( \) và \[ \] thành KaTeX (1 dòng + 8 khối), không còn mã thô
    expect(await root.locator('.katex').count()).toBeGreaterThanOrEqual(9);
    expect(await root.locator('.katex-display').count()).toBe(8);
    expect(await root.locator('.katex-error').count()).toBe(0);
    const visible = await root.evaluate((e) => (e as HTMLElement).innerText);
    expect(visible).not.toMatch(/\\frac|\\sqrt|\\begin\{bmatrix\}|\\\[|\\\(/);
    // HTML được phép
    await expect(root.locator('kbd')).toHaveText(['Ctrl', 'S']);
    const det = root.locator('details');
    await expect(det).toHaveCount(1);
    await expect(det.locator('summary')).toHaveText('Click to expand additional information');
    const inside = det.getByText('This is hidden content');
    await expect(inside).toBeHidden(); // mặc định thu gọn
    await det.locator('summary').click();
    await expect(inside).toBeVisible();
    await expect(det.locator('li')).toHaveCount(3);
    // phần còn lại
    expect(await root.locator('table').count()).toBe(3);
    expect(await root.locator('.cb').count()).toBe(4); // 4 khối code (4 khối mermaid đã thành hình, không còn .cb)
    await expect(root.locator('input[type=checkbox]')).toHaveCount(8);
    await expect(root.locator('input[type=checkbox]:checked')).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test('khoảng cách: H2 liền sau là H3 ngắn, quanh --- gọn, bảng thẳng mép phải', async ({ page }) => {
    await loadDoc(page);
    const r = await page.evaluate(() => {
      const root = document.querySelector('.md-doc')!;
      const kids = [...root.children];
      const gap = (a: Element, b: Element) => Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom);
      const stacked: number[] = [], aroundHr: number[] = [];
      for (let i = 1; i < kids.length; i++) {
        const a = kids[i - 1]!, b = kids[i]!;
        if (/^H[12]$/.test(a.tagName) && /^H[34]$/.test(b.tagName)) stacked.push(gap(a, b));
        if (a.tagName === 'HR' && b.tagName === 'H2' && i >= 2) aroundHr.push(gap(kids[i - 2]!, b)); // từ cuối khối trước --- tới tiêu đề
      }
      // chữ cột cuối của bảng chạm đúng mép phải của bảng
      const t = root.querySelector('table')!, tr = t.getBoundingClientRect(), rg = document.createRange();
      const edges = [...t.querySelectorAll('tr')].map((row) => { const cell = row.lastElementChild!; rg.selectNodeContents(cell); const rects = [...rg.getClientRects()]; return Math.round(Math.max(...rects.map((x) => x.right)) - tr.right); });
      // khe giữa mục cha và danh sách con (danh sách rộng) so với khe giữa các mục cùng cấp
      const ol = root.querySelector('ol')!;
      const first = ol.querySelector(':scope > li')!;
      const p = first.querySelector(':scope > p'), sub = first.querySelector(':scope > ul');
      const nestedGap = p && sub ? Math.round(sub.getBoundingClientRect().top - p.getBoundingClientRect().bottom) : -1;
      return { stacked, aroundHr, edges, nestedGap };
    });
    for (const g of r.stacked) expect(g, 'tiêu đề liền tiêu đề').toBeLessThanOrEqual(18);
    expect(r.stacked.length).toBeGreaterThanOrEqual(3);
    for (const g of r.aroundHr) expect(g, 'quanh ---').toBeLessThanOrEqual(72);
    for (const e of r.edges) expect(Math.abs(e), 'chữ cột cuối so với mép phải bảng').toBeLessThanOrEqual(1);
    expect(r.nestedGap).toBeLessThanOrEqual(12);
  });

  test('không có cuộn ngang của trang; bảng/code/sơ đồ rộng tự cuộn trong khung của chúng', async ({ browser }) => {
    test.setTimeout(120_000); // nạp tài liệu ở ba bề rộng, mỗi lần trong một phiên sạch (chế độ xem đã lưu của phiên trước không làm ô soạn biến mất)
    for (const w of [1440, 768, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();
      await loadDoc(page);
      // sơ đồ rộng cố ý thoát khỏi cột chữ (.md-doc) nên đo ở khung xem (.pv-out) và cả trang: cả hai không được cuộn ngang
      const r = await page.evaluate(() => { const pane = document.querySelector('.pv-out')!; return { doc: document.documentElement.scrollWidth, win: innerWidth, pane: pane.scrollWidth, paneW: pane.clientWidth }; });
      expect(r.doc, `trang ở ${w}px`).toBeLessThanOrEqual(r.win + 1);
      expect(r.pane, `khung xem ở ${w}px`).toBeLessThanOrEqual(r.paneW + 1);
      await ctx.close();
    }
  });

  test('Gantt: mốc trục không lặp nhãn; sơ đồ rộng giữ cỡ chữ gần tự nhiên (không co vào cột 680px)', async ({ page }) => {
    await loadDoc(page);
    const r = await page.evaluate(() => {
      const fig = [...document.querySelectorAll('.md-doc figure.mermaid')].find((f) => f.querySelector('svg')?.getAttribute('aria-roledescription') === 'gantt')!;
      const svg = fig.querySelector('svg')!, vb = svg.viewBox.baseVal;
      const ticks = [...fig.querySelectorAll('.tick text')].map((t) => t.textContent!.trim());
      return { ticks, scale: svg.getBoundingClientRect().width / vb.width, wide: fig.hasAttribute('data-wide'), figW: Math.round(fig.getBoundingClientRect().width) };
    });
    expect(r.ticks.length).toBeGreaterThan(2);
    expect(new Set(r.ticks).size, `nhãn mốc: ${r.ticks.join(' | ')}`).toBe(r.ticks.length);
    expect(r.scale).toBeGreaterThanOrEqual(0.9);
    expect(r.wide).toBe(true);
    expect(r.figW).toBeGreaterThan(700);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`mermaid ở giao diện ${scheme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    test('chữ trong node có màu nền riêng đọc được (tương phản ≥ 4.5)', async ({ page }) => {
      await loadDoc(page);
      const r = await page.evaluate(() => {
        const cx = document.createElement('canvas').getContext('2d')!;
        const rgb = (c: string) => { cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0]!, d[1]!, d[2]!]; };
        const lum = ([a, b, c]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(a!) + 0.7152 * f(b!) + 0.0722 * f(c!); };
        const out: { label: string; ratio: number }[] = [];
        for (const node of document.querySelectorAll('.md-doc figure.mermaid g.node')) {
          const shape = [...node.querySelectorAll<SVGElement>('rect, path, polygon, circle, ellipse')].find((e) => !e.closest('foreignObject') && e.style.fill);
          if (!shape) continue; // chỉ node có màu nền do tác giả đặt
          const lab = node.querySelector('span, text, p'); if (!lab) continue;
          const a = lum(rgb(getComputedStyle(shape).fill)), b = lum(rgb(getComputedStyle(lab).color));
          out.push({ label: lab.textContent!.trim(), ratio: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2) });
        }
        return out;
      });
      expect(r.map((x) => x.label).sort()).toEqual(['PostgreSQL', 'Redis Cache', 'User']);
      for (const x of r) expect(x.ratio, x.label).toBeGreaterThanOrEqual(4.5);
    });
  });
}

test('Light và Dark: typography và khoảng cách giống hệt (chỉ màu khác)', async ({ browser }) => {
  const out: Record<string, Awaited<ReturnType<typeof metrics>>> = {};
  for (const scheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await page.locator('.ed-ta').fill(DOC);
    await viewTab(page, 'Read').click();
    await expect(page.locator('.md-doc h2').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    out[scheme] = await metrics(page);
    await ctx.close();
  }
  expect(out['dark']!.p).toEqual(out['light']!.p);
  expect(out['dark']!.h1).toEqual(out['light']!.h1);
  expect(out['dark']!.h2).toEqual(out['light']!.h2);
  expect(out['dark']!.h3).toEqual(out['light']!.h3);
  expect(out['dark']!.li).toEqual(out['light']!.li);
  expect(out['dark']!.td).toEqual(out['light']!.td);
  expect(out['dark']!.pre).toEqual(out['light']!.pre);
  expect(out['dark']!.width).toBe(out['light']!.width);
  expect(out['dark']!.gaps).toEqual(out['light']!.gaps);
});
