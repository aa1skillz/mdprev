import { expect, test, type Page } from '@playwright/test';
import { ready, viewTab, newDocument } from './helpers';

/** Header kiểu app: cụm trái (New / Open / Inspect), nhóm chế độ có nhãn, theme, Copy, thanh định dạng, bấm lần nữa để đóng Inspector. */
const ta = (p: Page) => p.locator('.ed-ta');
const bar = (p: Page) => p.locator('.appbar');
const open = async (p: Page, md = 'x', w = 1440, h = 900) => {
  await p.setViewportSize({ width: w, height: h });
  await p.addInitScript((m: string) => { try { if (localStorage.getItem('mdprev-md') === null) localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, md);
  await p.goto('/app/');
  await ready(p);
  await expect(p.locator('.pv')).toBeVisible();
  await expect(ta(p)).toBeVisible();
};
const atEnd = (p: Page) => ta(p).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
const tool = (p: Page, label: string) => p.locator('.pv-tools').getByRole('button', { name: new RegExp('^' + label + ' ') });
const panel = (p: Page) => p.getByRole('complementary', { name: 'Inspector' });

test.describe('cụm trái của header', () => {
  test('ở 1440: New document, Open menu, Inspect; menu Open có các mục', async ({ page }) => {
    await open(page);
    await expect(bar(page).getByRole('button', { name: 'New document' })).toBeVisible();
    await expect(bar(page).locator('.appbar-ins > summary')).toBeVisible();
    await expect(bar(page).locator('.appbar-ins > summary')).toHaveAttribute('title', /Inspect a skill/);
    const menu = bar(page).getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-haspopup', 'true');
    await menu.click();
    const dd = page.locator('.pv-menu-open');
    await expect(dd).toBeVisible();
    await expect(dd.getByRole('button', { name: 'Open…', exact: true })).toBeVisible();
    await expect(dd.getByRole('button', { name: 'Open URL…', exact: true })).toBeVisible();
    await expect(dd.getByRole('link', { name: 'Open a skill…' })).toBeVisible();
  });

  test('New document ở chế độ thường: hỏi rồi làm trống ô soạn', async ({ page }) => {
    await open(page, 'something else');
    page.on('dialog', (d) => d.accept());
    await newDocument(page, bar(page).getByRole('button', { name: 'New document' }));
    await expect(ta(page)).toHaveValue('');
  });

  test('New document ở chế độ skill: không đổi file đang mở, mở form New file path', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.wp')).toBeVisible();
    await expect(ta(page)).not.toHaveAttribute('readonly', '');
    const before = await ta(page).inputValue();
    expect(before.length).toBeGreaterThan(0);
    let asked = false;
    page.on('dialog', (d) => { asked = true; void d.dismiss(); });
    await bar(page).getByRole('button', { name: 'New document' }).click();
    await expect(page.getByRole('textbox', { name: 'New file path' })).toBeVisible();
    expect(asked).toBe(false);
    await expect(ta(page)).toHaveValue(before);
  });

  test('Inspect a skill: Esc hoặc bấm ra ngoài thì đóng', async ({ page }) => {
    await open(page);
    const ins = page.locator('.appbar-ins');
    await ins.locator('summary').click();
    await expect(ins).toHaveAttribute('open', '');
    await expect(page.getByRole('textbox', { name: 'Skill link' })).toBeVisible();
    await expect(ins.getByRole('button', { name: 'Inspect', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ins).not.toHaveAttribute('open', '');
    await ins.locator('summary').click();
    await expect(ins).toHaveAttribute('open', '');
    await page.mouse.click(700, 500);
    await expect(ins).not.toHaveAttribute('open', '');
  });
});

test.describe('nhóm chế độ có nhãn', () => {
  test('nhãn Edit hiện chữ ở 1440, chỉ còn icon ở 1000 nhưng nút vẫn truy cập được', async ({ page }) => {
    await open(page, 'x', 1440);
    const lbl = viewTab(page, 'Edit').locator('.lbl');
    await expect(lbl).toBeVisible();
    await expect(lbl).toHaveText('Edit');
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(lbl).toBeHidden();
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible();
    await expect(viewTab(page, 'Edit')).toBeVisible();
  });
});

test.describe('nút theme', () => {
  const disp = (p: Page, c: string) => p.locator('.appbar-theme ' + c).evaluate((e) => getComputedStyle(e).display);
  test('system lần đầu, chosen sau khi bấm; icon trăng ↔ mặt trời đổi', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme-source', 'system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await disp(page, '.ic-moon')).not.toBe('none');
    expect(await disp(page, '.ic-sun')).toBe('none');
    await bar(page).getByRole('button', { name: 'Switch theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme-source', 'chosen');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await disp(page, '.ic-sun')).not.toBe('none');
    expect(await disp(page, '.ic-moon')).toBe('none');
    await ctx.close();
  });

  test('hệ thống tối lần đầu: icon mặt trời hiện', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme-source', 'system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await disp(page, '.ic-sun')).not.toBe('none');
    expect(await disp(page, '.ic-moon')).toBe('none');
    await ctx.close();
  });
});

test('nút Copy của khối code là icon, chép xong có data-done rồi tắt', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await open(page, '# T\n\n```js\nconst a = 1;\n```\n');
  const btn = page.locator('.cb-copy').first();
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('aria-label', 'Copy code');
  await expect(btn).not.toContainText(/copy/i);
  await expect(btn).not.toHaveAttribute('data-done', /.*/);
  await btn.click();
  await expect(btn).toHaveAttribute('data-done', /.*/);
  await expect(btn).not.toHaveAttribute('data-done', /.*/, { timeout: 4000 });
});

test.describe('thanh định dạng', () => {
  test('Undo / Redo cố định: undo làm chữ mất, redo đưa về', async ({ page }) => {
    await open(page, 'x');
    await expect(page.locator('.pv-tools .pv-fixed')).toBeVisible();
    await atEnd(page);
    await page.keyboard.type(' hello');
    await expect(ta(page)).toHaveValue('x hello');
    await page.getByRole('button', { name: 'undo Undo (Ctrl/⌘+Z)' }).click();
    await expect(ta(page)).not.toHaveValue('x hello');
    await expect(ta(page)).not.toHaveValue(/hello/);
    await page.getByRole('button', { name: 'redo Redo (Ctrl/⌘+⇧+Z)' }).click();
    await expect(ta(page)).toHaveValue('x hello');
  });

  test('rule chèn ---, math chèn $x$, image chèn ![alt text](https://)', async ({ page }) => {
    await open(page, 'x');
    await viewTab(page, 'Edit').click(); // ô soạn rộng nhất: đủ chỗ cho mọi nhóm
    await atEnd(page);
    await tool(page, 'rule').click();
    await expect(ta(page)).toHaveValue(/---/);
    await tool(page, 'math').click();
    await expect(ta(page)).toHaveValue(/\$x\$/);
    await atEnd(page); // sau math, chữ x đang được chọn nên image sẽ lấy làm alt
    await tool(page, 'image').click();
    await expect(ta(page)).toHaveValue(/!\[alt text\]\(https:\/\/\)/);
  });

  test('ToC chèn danh sách liên kết tới tiêu đề', async ({ page }) => {
    await open(page, '# T\n\n## Alpha\n\n### Beta');
    await atEnd(page);
    await tool(page, 'ToC').click();
    const v = await ta(page).inputValue();
    expect(v).toContain('- [Alpha](#alpha)');
    expect(v).toContain('[Beta](#beta)');
    expect(v).toMatch(/- \[Heading\]|- \[Alpha\]\(#alpha\)/);
  });
});

test.describe('bấm lần nữa thì đóng Inspector', () => {
  test('.pv-chk', async ({ page }) => {
    await open(page, '# A\n\nok\n\n### Jump\n');
    const chk = page.locator('.pv-chk');
    await expect(chk).toHaveAttribute('aria-expanded', 'false');
    await chk.click();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Checks' })).toHaveAttribute('aria-selected', 'true');
    await expect(chk).toHaveAttribute('aria-expanded', 'true');
    await chk.click();
    await expect(panel(page)).toBeHidden();
    await expect(chk).toHaveAttribute('aria-expanded', 'false');
  });

  test('changes (≥900px)', async ({ page }) => {
    await open(page, 'base');
    const btn = page.locator('.pv-mode').getByRole('button', { name: 'changes', exact: true });
    await atEnd(page);
    await page.keyboard.type(' more');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await btn.click();
    await expect(panel(page)).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('.pv-curlint', async ({ page }) => {
    await open(page, '# A\n\nok\n\n### Jump\n');
    await ta(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('ArrowUp');
    const lint = page.locator('.pv-curlint');
    await expect(lint).toContainText(/Heading level jumps/);
    await expect(lint).toHaveAttribute('aria-expanded', 'false');
    await lint.click();
    await expect(panel(page)).toBeVisible();
    await expect(lint).toHaveAttribute('aria-expanded', 'true');
    await lint.click();
    await expect(panel(page)).toBeHidden();
    await expect(lint).toHaveAttribute('aria-expanded', 'false');
  });
});

test('Edit/Split/Read: đổi chế độ trong header vẫn dùng được', async ({ page }) => {
  await open(page);
  await viewTab(page, 'Read').click();
  await expect(page.locator('.pv-tools')).toBeHidden();
});
