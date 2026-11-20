import { expect, test, type Page } from '@playwright/test';
import { ready, viewOptions, viewTab, seedSample } from './helpers';

// Các test dưới đây được viết khi bài mặc định của /app/ còn là bài mẫu; gieo lại bài mẫu để chúng bắt đầu đúng như trước (xem seedSample trong helpers.ts).
test.beforeEach(async ({ context }) => { await seedSample(context); });


/** Chi tiết giao diện Quiet Pro: undo/redo, Find bật/tắt, thanh bảng nổi, Bold tiếng Việt, Palette, tooltip, bảng phím tắt, Overview skill, slides. */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const ta = (p: Page) => p.locator('.ed-ta');
const open = async (p: Page, md?: string) => {
  await p.setViewportSize({ width: 1440, height: 900 });
  if (md !== undefined) await p.addInitScript((m: string) => { try { localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, md);
  await p.goto('/app/');
  await ready(p);
  await expect(p.locator('.pv')).toBeVisible();
};
const undoBtn = (p: Page) => p.getByRole('button', { name: /^undo/ });
const redoBtn = (p: Page) => p.getByRole('button', { name: /^redo/ });
const findBtn = (p: Page) => p.locator('.pv-tools').getByRole('button', { name: /^find/ });
/** Mở bản sao skill từ ví dụ (Inspect example → Edit a copy). */
const editCopy = async (p: Page) => {
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('/app/inspect/');
  await p.getByRole('button', { name: 'try an example' }).click();
  await p.getByRole('button', { name: 'Edit a copy' }).click();
  await p.waitForURL('**/app/');
  await expect(p.locator('.wp')).toBeVisible();
  await expect(ta(p)).not.toHaveAttribute('readonly', '');
};

test.describe('undo và redo', () => {
  test('undo vô hiệu khi văn bản chưa đổi, bật khi gõ, tắt lại khi hoàn tác hết; redo chỉ bật sau undo', async ({ page }) => {
    await open(page, '# Doc\n\nbody\n');
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeDisabled();
    await ta(page).click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type('hello');
    await expect(undoBtn(page)).toBeEnabled();
    await expect(redoBtn(page)).toBeDisabled();
    await page.keyboard.press(`${MOD}+z`);
    await expect(redoBtn(page)).toBeEnabled();
    for (let i = 0; i < 12 && await undoBtn(page).isEnabled(); i++) await page.keyboard.press(`${MOD}+z`);
    await expect(ta(page)).toHaveValue('# Doc\n\nbody\n');
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeEnabled();
    await redoBtn(page).click();
    await expect(undoBtn(page)).toBeEnabled();
  });

  test('chế độ skill: gõ vào SKILL.md rồi chuyển sang format.md thì undo vô hiệu', async ({ page }) => {
    await editCopy(page);
    await ta(page).click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type('zz');
    await expect(undoBtn(page)).toBeEnabled();
    await page.locator('.wp-f', { hasText: 'format.md' }).click();
    await expect(page.locator('.pv-bar .pv-name')).toHaveValue(/format\.md/);
    await expect(undoBtn(page)).toBeDisabled();
    await expect(redoBtn(page)).toBeDisabled();
  });
});

test('Find là nút bật/tắt: bấm lần nữa đóng', async ({ page }) => {
  await open(page);
  await expect(findBtn(page)).toHaveAttribute('aria-pressed', 'false');
  await findBtn(page).click();
  await expect(page.locator('.pv-find')).toBeVisible();
  await expect(findBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await findBtn(page).click();
  await expect(page.locator('.pv-find')).toHaveCount(0);
  await expect(findBtn(page)).toHaveAttribute('aria-pressed', 'false');
});

test('thanh bảng nổi ngay cạnh bảng (bên phải nếu còn chỗ, không thì trên hoặc dưới), không che chữ', async ({ page }) => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n\n');
  await open(page, `${lines}\n\n| Name | Qty |\n| --- | --- |\n| b | 10 |\n| a | 2 |\n`);
  await viewTab(page, 'Edit').click();
  await ta(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.press('ArrowUp'); // dòng cuối của bảng (sau dòng trống cuối file)
  const bar = page.locator('.pv-tbar');
  await expect(bar).toBeVisible();
  const g = await ta(page).evaluate((t: HTMLTextAreaElement) => {
    const cs = getComputedStyle(t), r = t.getBoundingClientRect();
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5, pad = parseFloat(cs.paddingTop);
    const before = t.value.slice(0, t.selectionStart).split('\n').length - 1;
    const first = t.value.split('\n').findIndex((l) => l.startsWith('| Name'));
    const total = t.value.replace(/\n$/, '').split('\n').length;
    const y = (i: number) => r.top + pad + i * lh - t.scrollTop;
    return { caretTop: y(before), caretBottom: y(before) + lh, tableTop: y(first), tableBottom: y(total), scroll: t.scrollTop };
  });
  expect(g.scroll).toBeGreaterThan(0); // dòng sâu: ô soạn đã cuộn
  const b = (await bar.boundingBox())!, taBox = (await ta(page).boundingBox())!;
  // thanh bảng nằm ngay cạnh bảng: bên phải phần chữ của bảng (không che chữ), hoặc phía trên / dưới bảng khi không còn chỗ bên phải
  const beside = b.x > taBox.x + 140 && b.y + b.height > g.tableTop - 6 && b.y < g.tableBottom;
  const above = b.y + b.height <= g.tableTop + 2, below = b.y >= g.tableBottom - 2;
  expect(beside || above || below, `thanh bảng ${b.x},${b.y}-${b.y + b.height}, bảng ${g.tableTop}-${g.tableBottom}`).toBe(true);
  if (!beside) expect(b.y + b.height <= g.caretTop + 1 || b.y >= g.caretBottom - 1, 'thanh bảng không chồng lên dòng con trỏ').toBe(true);
});

test('Bold với chữ tiếng Việt cho <strong> đậm thật', async ({ page }) => {
  await open(page, '');
  await ta(page).click();
  await page.keyboard.type('Văn bản in đậm');
  await page.keyboard.press(`${MOD}+a`);
  await page.locator('.pv-tools').getByRole('button', { name: /Bold/ }).click();
  await expect(ta(page)).toHaveValue('**Văn bản in đậm**');
  const strong = page.locator('.md-doc strong');
  await expect(strong).toHaveText('Văn bản in đậm');
  const w = await strong.evaluate((e) => ({ s: parseInt(getComputedStyle(e).fontWeight, 10), p: parseInt(getComputedStyle(e.parentElement!).fontWeight, 10) }));
  expect(w.s >= 600 || w.s > w.p).toBe(true);
});

test('Palette: chưa gõ có tiêu đề nhóm; gõ rồi thì không; phím ↓ không rơi vào tiêu đề', async ({ page }) => {
  await open(page);
  await page.locator('.pv-mode').click();
  await page.keyboard.press('/');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  const groups = page.locator('.pal-group');
  for (const g of ['File', 'Edit', 'View']) await expect(groups.filter({ hasText: new RegExp('^' + g + '$') })).toHaveCount(1);
  const box = page.getByRole('dialog').getByRole('textbox');
  await box.press('ArrowDown');
  const rows = page.locator('.pal-row');
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.pal-list [aria-current]')).toHaveCount(1);
  expect(await page.locator('.pal-list [aria-current]').evaluate((e) => e.tagName + '.' + e.className.includes('pal-row'))).toBe('A.true');
  await box.fill('zen');
  await expect(groups).toHaveCount(0);
  await expect(rows.first()).toBeVisible();
  await box.press('ArrowDown');
  await expect(page.locator('.pal-list [aria-current]')).toHaveCount(1);
});

test('tooltip: rê chuột vào View options hiện .tip, rời đi thì ẩn và title được trả lại', async ({ page }) => {
  await open(page);
  const btn = viewOptions(page), tip = page.locator('.tip');
  await expect(btn).toHaveAttribute('title', 'View settings');
  await btn.hover();
  await page.waitForTimeout(600);
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('View settings');
  await expect(tip).toHaveAttribute('role', 'tooltip');
  await expect(btn).toHaveAttribute('data-tip', 'View settings');
  await expect(btn).not.toHaveAttribute('title', /.*/);
  await page.mouse.move(700, 500);
  await expect(tip).toBeHidden();
  await expect(btn).toHaveAttribute('title', 'View settings');
  await expect(btn).not.toHaveAttribute('data-tip', /.*/);
});

test('bảng phím tắt: bấm ? mở dialog có kbd và nhóm Write', async ({ page }) => {
  await open(page);
  await page.locator('.pv-mode').click(); // focus ngoài ô nhập
  await page.keyboard.press('?');
  const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('heading', { level: 2, name: 'Keyboard shortcuts' })).toBeVisible();
  await expect(dlg.locator('kbd').first()).toBeVisible();
  await expect(dlg.getByRole('heading', { level: 3, name: 'Write' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toHaveCount(0);
});

test('Overview skill: SKILL.md mất frontmatter thì có nút Add frontmatter, bấm thì thêm khung và đặt con trỏ', async ({ page }) => {
  await editCopy(page);
  await ta(page).click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type('# Only a title');
  const insp = page.getByRole('complementary', { name: 'Inspector' }); // chế độ skill: Inspector tự mở ở tab Overview
  await expect(insp.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
  const fix = insp.getByRole('button', { name: 'Add frontmatter to SKILL.md' });
  await expect(fix).toBeVisible({ timeout: 8000 });
  await fix.click();
  const v = await ta(page).inputValue();
  expect(v.startsWith('---\nname: example-skill')).toBe(true);
  const caret = await ta(page).evaluate((t: HTMLTextAreaElement) => t.selectionStart);
  expect(v.slice(0, caret).endsWith('description: ')).toBe(true);
});

test('slides: phím s mở slides, nút icon có aria-label, Close đóng', async ({ page }) => {
  await open(page);
  await page.locator('.pv-mode').click();
  await page.keyboard.press('s');
  const sl = page.locator('.sl');
  await expect(sl).toBeVisible();
  for (const n of ['Prev', 'Next', 'Grid', 'Close']) await expect(sl.getByRole('button', { name: n, exact: true })).toBeVisible();
  await sl.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sl).toHaveCount(0);
});

test('tooltip khi focus bàn phím: .tip hiện nhưng title vẫn còn và tên truy cập không đổi', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const sum = page.locator('.appbar-ins > summary'), tip = page.locator('.tip');
  await sum.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab'); // focus bằng bàn phím: có :focus-visible
  await expect(sum).toBeFocused();
  await expect(tip).toBeVisible();
  await expect(sum).toHaveAttribute('title', /^Inspect a skill/);
  await expect(sum).not.toHaveAttribute('data-tip', /.*/);
  await expect(sum).toHaveAccessibleName(/^Inspect a skill/);
});

test('thông báo ngắn ở thanh trạng thái viết dạng câu', async ({ page }) => {
  await open(page, '# Doc\n\nbody\n');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.locator('.pv-flash')).toHaveText(/^Copied share link$/);
});

test('ngăn Images mở từ File có tiêu đề Images (không in hoa)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'File menu', exact: true }).click();
  await page.getByRole('button', { name: /^Images/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Images' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('span').first()).toHaveText(/^Images/);
});

test('nút Keyboard shortcuts ở header là icon, không có chữ ?', async ({ page }) => {
  await open(page);
  const b = page.locator('.appbar').getByRole('button', { name: 'Keyboard shortcuts' });
  await expect(b).toBeVisible();
  await expect(b).not.toHaveText(/\?/);
  await expect(b.locator('svg')).toHaveCount(1);
});

test('lề số dòng khi không ngắt dòng: dòng vừa gõ có chú thích đã thêm hoặc đã đổi', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch { /* bỏ qua */ } });
  await open(page, '# Doc\n\nbody\n');
  await ta(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('a freshly typed line');
  await expect.poll(async () => (await page.locator('.ed-gutwin div').evaluateAll((ds) => ds.map((d) => d.getAttribute('title') ?? ''))).some((t) => /^(Added|Changed) since the last save$/.test(t))).toBe(true);
});
