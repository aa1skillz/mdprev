import { expect, test, type Page } from '@playwright/test';
import { viewOptions } from './helpers';

/** Tuỳ chọn ô soạn: tự đóng cặp ( " `, số dòng bật/tắt, cỡ chữ ô soạn. Gõ bằng bàn phím thật. */
const ta = (p: Page) => p.locator('.ed-ta');
const open = async (page: Page, md = '') => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await expect(ta(page)).toBeVisible();
  await ta(page).fill(md);
  await ta(page).focus();
};
const val = (p: Page) => ta(p).inputValue();
const menu = async (page: Page, name: RegExp) => { await viewOptions(page).click(); await page.getByRole('button', { name }).click(); };
/** Nút trong một nhóm phân đoạn của menu VIEW (tên nhóm = nhãn của hàng). */
const seg = async (page: Page, group: string, name: string) => { await viewOptions(page).click(); await page.getByRole('group', { name: group }).getByRole('button', { name, exact: true }).click(); };

test.describe('tự đóng cặp', () => {
  test('( " ` đóng cặp, gõ đóng thì nhảy qua, Backspace xoá cả cặp rỗng', async ({ page }) => {
    await open(page);
    await page.keyboard.type('(ab)');
    expect(await val(page)).toBe('(ab)');
    await page.keyboard.type(' "hi" `x`');
    expect(await val(page)).toBe('(ab) "hi" `x`');
    await ta(page).fill(''); await ta(page).focus();
    await page.keyboard.type('(');
    expect(await val(page)).toBe('()');
    await page.keyboard.press('Backspace');
    expect(await val(page)).toBe('');
    await page.keyboard.type('```');
    expect(await val(page)).toBe('```');
  });
  test('không đụng [ ] { } \' (Telex dùng [ ]) và không đóng cặp trước chữ / sau chữ', async ({ page }) => {
    await open(page);
    await page.keyboard.type("[a]{b} don't");
    expect(await val(page)).toBe("[a]{b} don't");
    await ta(page).fill('abc'); await ta(page).focus();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('(');
    expect(await val(page)).toBe('(abc');
  });
  test('bôi đen rồi gõ ( vẫn bọc vùng chọn; Undo gỡ đúng một bước', async ({ page }) => {
    await open(page, 'hello');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('(');
    expect(await val(page)).toBe('(hello)');
    await page.keyboard.press('Control+Z');
    expect(await val(page)).toBe('hello');
  });
  test('tắt ở VIEW thì ngừng đóng cặp và nhớ sau khi tải lại', async ({ page }) => {
    await open(page);
    await menu(page, /^Auto-close/);
    await ta(page).focus();
    await page.keyboard.type('(');
    expect(await val(page)).toBe('(');
    await page.reload();
    await ta(page).fill(''); await ta(page).focus();
    await page.keyboard.type('(');
    expect(await val(page)).toBe('(');
    await menu(page, /^Auto-close/);
    await ta(page).focus();
    await page.keyboard.type('"');
    expect(await val(page)).toBe('(""');
  });
});

test.describe('số dòng và cỡ chữ ô soạn', () => {
  const DOC = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} ` + 'word '.repeat(i % 5 === 0 ? 40 : 3)).join('\n');
  const numbers = (page: Page) => page.evaluate(() => {
    const wrap = document.querySelector('.pv')!.hasAttribute('data-wrap');
    if (wrap) { const l = document.querySelector('.ed-hl .l'); return { wrap, shown: l ? getComputedStyle(l, '::before').content !== 'none' : false, pad: parseFloat(getComputedStyle(document.querySelector('.ed-ta')!).paddingLeft) }; }
    const g = document.querySelector<HTMLElement>('.ed-gutwin')!;
    return { wrap, shown: parseFloat(getComputedStyle(g).fontSize) > 0, pad: document.querySelector('.ed-gut')!.getBoundingClientRect().width };
  });
  for (const wrapOn of [true, false]) {
    test(`số dòng bật/tắt được và nhớ sau khi tải lại (wrap ${wrapOn ? 'bật' : 'tắt'})`, async ({ page }) => {
      await open(page, DOC);
      const isWrap = await page.locator('.pv').getAttribute('data-wrap');
      if ((isWrap === '1') !== wrapOn) await menu(page, /^Wrap lines/);
      const on = await numbers(page);
      expect(on.shown).toBe(true);
      await menu(page, /^Line numbers/);
      await expect(page.locator('.pv')).toHaveAttribute('data-noln', '1');
      const off = await numbers(page);
      expect(off.shown).toBe(false);
      expect(off.pad).toBeLessThan(on.pad);
      await page.reload();
      await expect(page.locator('.pv')).toHaveAttribute('data-noln', '1');
      await menu(page, /^Line numbers/);
      expect((await numbers(page)).shown).toBe(true);
    });
  }
  test('cỡ chữ ô soạn đổi, hai lớp vẫn thẳng hàng, nhớ sau khi tải lại, bản xem không đổi', async ({ page }) => {
    await open(page, DOC);
    await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Split', exact: true }).click();
    const fs = () => page.evaluate(() => ({
      ta: parseFloat(getComputedStyle(document.querySelector('.ed-ta')!).fontSize),
      hl: parseFloat(getComputedStyle(document.querySelector('.ed-hl')!).fontSize),
      doc: parseFloat(getComputedStyle(document.querySelector('.md-doc')!).fontSize),
      taH: document.querySelector<HTMLElement>('.ed-ta')!.scrollHeight, hlH: document.querySelector<HTMLElement>('.ed-hl')!.scrollHeight,
    }));
    const base = await fs();
    await seg(page, 'Text size', 'Large');
    const big = await fs();
    expect(big.ta).toBeGreaterThan(base.ta);
    expect(big.hl).toBe(big.ta);
    expect(Math.abs(big.taH - big.hlH)).toBeLessThanOrEqual(2);
    expect(big.doc).toBe(base.doc);
    await seg(page, 'Text size', 'Small');
    const small = await fs();
    expect(small.ta).toBeLessThan(base.ta);
    expect(Math.abs(small.taH - small.hlH)).toBeLessThanOrEqual(2);
    await page.reload();
    await expect(page.locator('.pv')).toHaveAttribute('data-eds', 's');
    await seg(page, 'Text size', 'Default');
    await expect(page.locator('.pv')).not.toHaveAttribute('data-eds', /./);
  });
});

test.describe('đổi cỡ chữ khi đang ở giữa tài liệu dài (không tải lại)', () => {
  test('3000 dòng, không wrap, cuộn tới dòng 2500: đổi Large/Small thì lề số dòng, lớp tô và vạch dòng hiện tại vẫn đúng chỗ', async ({ page }) => {
    test.setTimeout(120_000); // fill() của Playwright mất ~20 s với 3000 dòng trên máy chậm
    await open(page, Array.from({ length: 3000 }, (_, i) => `row ${i + 1}`).join('\n'));
    const isWrap = await page.locator('.pv').getAttribute('data-wrap');
    if (isWrap === '1') await menu(page, /^Wrap lines/);
    await ta(page).focus();
    const off = 'row 1\n'.length + [...Array(2499).keys()].reduce((a, i) => a + `row ${i + 2}\n`.length, 0);
    await ta(page).evaluate((e: HTMLTextAreaElement, o: number) => { e.setSelectionRange(o, o); e.scrollTop = 2499 * 23 - 200; e.dispatchEvent(new Event('scroll')); }, off);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
    const probe = () => page.evaluate(() => {
      const t = document.querySelector<HTMLTextAreaElement>('.ed-ta')!, cs = getComputedStyle(t);
      const lh = parseFloat(cs.lineHeight), pad = parseFloat(cs.paddingTop);
      const cur = document.querySelector<HTMLElement>('.ed-cur'), gin = document.querySelector<HTMLElement>('.ed-gutin')!;
      const row = document.querySelector<HTMLElement>('.ed-gutwin div.cur');
      const hl = document.querySelector<HTMLElement>('.ed-hl')!;
      const gw = document.querySelector<HTMLElement>('.ed-gutwin')!;
      const ln = Math.round((t.scrollTop + t.clientHeight / 2 - pad) / lh);
      return { pad, lh, taH: t.scrollHeight, ginH: gin.offsetHeight, curTop: cur ? parseFloat(cur.style.top) : null, wantCur: pad + (Number(row?.textContent) - 1) * lh, hlTop: parseFloat(hl.style.top), gwTop: parseFloat(gw.style.top), n: Number(row?.textContent), ln };
    });
    for (const name of ['Large', 'Small', 'Default']) {
      await seg(page, 'Text size', name); await ta(page).focus();
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(150);
      const m = await probe();
      expect(Math.abs(m.ginH - m.taH), `chiều cao lề ${name}`).toBeLessThanOrEqual(2);
      expect(m.n, 'dòng hiện tại có trong lề').toBeGreaterThan(2000);
      expect(m.curTop, `vạch dòng hiện tại ${name}`).not.toBeNull();
      expect(Math.abs((m.curTop ?? 0) - m.wantCur), `vạch dòng hiện tại ${name}`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(m.gwTop - m.pad - m.hlTop), 'lớp tô và lề cùng điểm bắt đầu').toBeLessThanOrEqual(1);
      expect(Math.abs(m.hlTop / m.lh - Math.round(m.hlTop / m.lh)) * m.lh, 'cửa sổ dựng bám đúng bội số của dòng cao').toBeLessThanOrEqual(1);
    }
  });
});

test.describe('chọn tuỳ chọn ô soạn rồi gõ tiếp', () => {
  test('click giữa tài liệu → VIEW ▸ đổi cỡ chữ / số dòng → gõ ngay: chữ vào đúng chỗ con trỏ, không rơi vào nút menu hay cuối tài liệu', async ({ page }) => {
    await open(page, Array.from({ length: 80 }, (_, i) => `Dòng số ${i + 1}`).join('\n'));
    await ta(page).evaluate((e) => { e.scrollTop = 0; });
    const box = (await ta(page).boundingBox())!;
    const lh = await ta(page).evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
    await page.mouse.click(box.x + 150, box.y + 16 + lh * 5 + lh / 2);
    const at = () => ta(page).evaluate((e: HTMLTextAreaElement) => e.value.slice(0, e.selectionStart).split('\n').length);
    const line0 = await at();
    expect(line0).toBeLessThan(15);
    for (const name of ['Large', 'Small', 'Line numbers', 'Default']) {
      if (name === 'Line numbers') await menu(page, /^Line numbers/); else await seg(page, 'Text size', name);
      expect(await ta(page).evaluate((e) => document.activeElement === e), `focus ${name}`).toBe(true);
    }
    await page.keyboard.type('XYZ');
    const v = await val(page);
    expect(v.slice(0, v.indexOf('XYZ')).split('\n').length).toBe(line0);
  });
});
