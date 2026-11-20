import { expect, test, type Page } from '@playwright/test';
import { openInspector } from './helpers';

/** Ô soạn ngắt dòng mặc định: dấu lint, dấu thay đổi, highlight của Find, thanh chia, tài liệu dài, thanh định dạng, Outline thu gọn, mục Install. */
const ta = (p: Page) => p.locator('.ed-ta');
const seed = (p: Page, md: string) => p.addInitScript((m: string) => { try { localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, md);
const open = async (p: Page, md: string, w = 1440, h = 900) => {
  await p.setViewportSize({ width: w, height: h });
  await seed(p, md);
  await p.goto('/app/');
  await expect(p.locator('.pv .ed-ta')).toBeVisible();
  await expect(p.locator('.pv-modetag')).toHaveText('READY');
};
const atEnd = (p: Page) => ta(p).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
const dragSep = async (p: Page, toX: number) => {
  const b = (await p.locator('.pv-sep').boundingBox())!;
  const y = b.y + b.height / 2, x = b.x + b.width / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(toX, y, { steps: 10 });
  await p.mouse.up();
};
const hlSize = (p: Page, name: string) => p.evaluate((n) => (CSS as unknown as { highlights: Map<string, { size: number }> }).highlights.get(n)?.size ?? 0, name);

test('lint trong chế độ ngắt dòng: dòng lỗi có lớp lw, không còn gạch ed-lint', async ({ page }) => {
  await open(page, '# A\n\nok\n\n### Jump\n');
  await expect(ta(page)).toHaveAttribute('wrap', 'soft');
  const lw = page.locator('.ed-hl .l.lw');
  await expect(lw).toHaveCount(1);
  expect(await page.locator('.ed-hl .l').evaluateAll((ls) => ls.findIndex((l) => l.classList.contains('lw')))).toBe(4); // dòng 5
  await expect(page.locator('.ed-lint')).toHaveCount(0);
});

test('dấu thay đổi trong chế độ ngắt dòng: dòng thêm có lớp ga hoặc gm trên .l', async ({ page }) => {
  await open(page, '# T\n\nbody');
  await expect(page.locator('.ed-hl .l.ga, .ed-hl .l.gm, .ed-hl .l.gd')).toHaveCount(0);
  await atEnd(page);
  await page.keyboard.type('\nnew line');
  await expect.poll(() => page.locator('.ed-hl .l').evaluateAll((ls) => ls.map((l) => /\b(ga|gm)\b/.test(l.className)))).toEqual([false, false, false, true]);
});

test('Find dùng CSS Custom Highlight: số kết quả, kết quả hiện tại, Enter, đóng thì xoá; dòng bị ngắt nhiều hàng', async ({ page }) => {
  const long = Array.from({ length: 60 }, () => 'word').join(' ');
  await open(page, `foo one\n${long} foo tail ${long}\nfoo last\n`);
  test.skip(!(await page.evaluate(() => 'highlights' in CSS)), 'trình duyệt không có CSS.highlights');
  await ta(page).click();
  await page.keyboard.press('Control+f');
  const q = page.getByRole('textbox', { name: 'Find', exact: true });
  await expect(q).toBeVisible();
  await q.fill('foo');
  await expect(page.locator('.pv-fcount')).toHaveText('1/3');
  await expect.poll(() => hlSize(page, 'mdprev-find')).toBe(2);
  expect(await hlSize(page, 'mdprev-find-cur')).toBe(1);
  const curText = () => page.evaluate(() => { const r = [...(CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get('mdprev-find-cur')!][0]!; return r.toString() + '@' + r.startContainer.parentElement!.closest('.l')!.textContent!.slice(0, 7); });
  const first = await curText();
  await q.press('Enter');
  await expect(page.locator('.pv-fcount')).toHaveText('2/3');
  await expect.poll(curText).not.toBe(first);
  expect(await hlSize(page, 'mdprev-find')).toBe(2);
  expect(await hlSize(page, 'mdprev-find-cur')).toBe(1);
  // kết quả nằm ở dòng dài bị ngắt thành nhiều hàng: range có nhiều hàng hoặc ít nhất khớp đúng chữ
  expect(await page.evaluate(() => { const l = document.querySelectorAll('.ed-hl .l')[1] as HTMLElement; return l.getClientRects().length > 0 && l.offsetHeight > 40; })).toBe(true);
  expect(await curText()).toMatch(/^foo@/);
  await q.press('Escape');
  await expect(page.locator('.pv-find')).toHaveCount(0);
  await expect.poll(() => hlSize(page, 'mdprev-find')).toBe(0);
  expect(await hlSize(page, 'mdprev-find-cur')).toBe(0);
});

test('kéo thanh chia làm hẹp ô soạn: không cuộn ngang, số dòng giữ nguyên, lớp tô cao hơn', async ({ page }) => {
  const L = 'This is a long line of prose that should wrap again when the editor pane gets narrower than before.';
  await open(page, Array.from({ length: 10 }, () => L).join('\n'));
  const m = () => page.evaluate(() => { const t = document.querySelector<HTMLTextAreaElement>('.ed-ta')!; return { over: t.scrollWidth - t.clientWidth, n: document.querySelectorAll('.ed-hl .l').length, h: document.querySelector<HTMLElement>('.ed-hl')!.getBoundingClientRect().height, w: t.clientWidth }; });
  const a = await m();
  await dragSep(page, 40);
  await expect.poll(async () => (await m()).w).toBeLessThan(a.w - 100);
  const b = await m();
  expect(b.over).toBeLessThanOrEqual(1);
  expect(b.n).toBe(a.n);
  expect(b.h).toBeGreaterThan(a.h);
});

test('tài liệu hơn 1000 dòng: tự tắt ngắt dòng và cửa sổ hoá lớp tô; lưu "1" thì vẫn bật', async ({ page }) => {
  test.slow();
  const big = Array.from({ length: 2500 }, (_, i) => `line ${i} lorem ipsum dolor sit amet`).join('\n');
  await open(page, '# T\n');
  await ta(page).click();
  await page.keyboard.insertText(big);
  await expect(page.locator('.pv-modetag')).toHaveText('READY');
  await expect(page.locator('.pv')).not.toHaveAttribute('data-wrap', '1');
  await expect(ta(page)).toHaveAttribute('wrap', 'off');
  expect(await page.locator('.ed-hl .l').count()).toBeLessThan(300);
});

test('tài liệu hơn 1000 dòng nhưng đã lưu wrap = 1: vẫn ngắt dòng', async ({ page }) => {
  test.slow();
  await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '1'); } catch { /* bỏ qua */ } });
  await open(page, '# T\n');
  await ta(page).click();
  await page.keyboard.insertText(Array.from({ length: 2500 }, (_, i) => `line ${i} lorem ipsum dolor sit amet`).join('\n'));
  await expect(page.locator('.pv-modetag')).toHaveText('READY');
  await expect(page.locator('.pv')).toHaveAttribute('data-wrap', '1');
  await expect(ta(page)).toHaveAttribute('wrap', 'soft');
});

test('thanh định dạng hẹp: nút More formatting tools hiện ra và áp dụng được định dạng', async ({ page }) => {
  await open(page, 'x', 2400, 900);
  await expect(page.getByRole('button', { name: /More formatting tools/ })).toHaveCount(0); // đủ rộng: đủ chỗ cho mọi nhóm
  await dragSep(page, 40);
  const more = page.getByRole('button', { name: /More formatting tools/ });
  await expect(more).toBeVisible();
  await more.click();
  const item = page.getByRole('menuitem', { name: /^table\b/i }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(ta(page)).toHaveValue(/\| .* \|/);
});

test('Outline thu gọn nhánh: bấm mép phải và phím ←/→', async ({ page }) => {
  await open(page, '# A\n\n## B\n\n### C\n\n## D\n');
  const insp = await openInspector(page, 'Outline');
  const items = insp.locator('button.pv-ol');
  await expect(items).toHaveCount(4);
  const a = items.filter({ hasText: /^A$/ });
  await expect(a).toHaveAttribute('data-fold', 'open');
  await expect(a).toHaveAttribute('aria-expanded', 'true');
  const bb = (await a.boundingBox())!;
  await a.click({ position: { x: bb.width - 8, y: bb.height / 2 } });
  await expect(items).toHaveCount(1);
  await expect(a).toHaveAttribute('data-fold', 'closed');
  await expect(a).toHaveAttribute('aria-expanded', 'false');
  await a.click({ position: { x: bb.width - 8, y: bb.height / 2 } });
  await expect(items).toHaveCount(4);
  await expect(a).toHaveAttribute('data-fold', 'open');
  const b = items.filter({ hasText: /B$/ });
  await b.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(items).toHaveCount(3);
  await expect(b).toHaveAttribute('data-fold', 'closed');
  await b.focus();
  await page.keyboard.press('ArrowRight');
  await expect(items).toHaveCount(4);
  await expect(b).toHaveAttribute('data-fold', 'open');
});

test('báo cáo Inspector có mục Install với hai đường dẫn và nút Copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await page.goto('/app/inspect/');
  await page.getByRole('button', { name: 'try an example' }).click();
  await expect(page.getByRole('heading', { name: 'Install' })).toBeVisible();
  const rows = page.locator('.ix-inst');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('code')).toContainText('~/.claude/skills/example-skill/');
  await expect(rows.nth(1).locator('code')).toContainText('.claude/skills/example-skill/');
  const copy = rows.nth(0).getByRole('button', { name: /^Copy/ });
  await expect(copy).toHaveText('Copy');
  await copy.click();
  await expect(copy).toHaveText('Copied');
});
