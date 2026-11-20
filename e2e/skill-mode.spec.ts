import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Giai đoạn 5b: sửa bản sao skill → Inspector có Overview · Findings · Outline, cây file có dấu phát hiện và token. */
const ta = (p: Page) => p.locator('.ed-ta');
const insp = (p: Page) => p.getByRole('complementary', { name: 'Inspector' });

async function editCopy(page: Page, theme?: 'light' | 'dark') {
  if (theme) await page.addInitScript((t) => { try { localStorage.setItem('mdprev-theme', t); } catch { /* bỏ qua */ } }, theme);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/inspect/');
  await page.getByRole('button', { name: 'try an example' }).click();
  await page.getByRole('button', { name: 'Edit a copy' }).click();
  await page.waitForURL('**/app/');
  await expect(page.locator('.wp')).toBeVisible();
  await expect(ta(page)).not.toHaveAttribute('readonly', '');
}

test.describe('chế độ skill', () => {
  test('Inspector tự mở với bốn tab Overview · Findings · Outline · Checks, Overview có kết luận và ba mức token', async ({ page }) => {
    await editCopy(page);
    await expect(insp(page)).toBeVisible();
    await expect(insp(page).getByRole('tab')).toHaveText([/Overview/, /Findings/, /Outline/, /Checks/]);
    await expect(insp(page).getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
    const body = insp(page).getByRole('tabpanel');
    await expect(body).toContainText('one script worth a read');
    await expect(body).toContainText('always loaded');
    await expect(body).toContainText('on trigger');
    await expect(body).toContainText('all files');
    await expect(insp(page).getByRole('tab', { name: /Findings/ })).toContainText('2');
  });

  test('bấm một phát hiện nằm ngoài SKILL.md mở đúng file và nhảy tới đúng dòng', async ({ page }) => {
    await editCopy(page);
    await insp(page).getByRole('tab', { name: /Findings/ }).click();
    await insp(page).getByRole('button', { name: /outline\.py is worth a read/ }).click();
    await expect(page.locator('.wp-f[aria-current="true"]')).toContainText('outline.py');
    await expect(ta(page)).toHaveValue(/shell=True/);
    await expect(page.locator('.pv-mode')).toContainText('Ln 6,');
  });

  test('cây file có dấu ! ở file có phát hiện và token ước lượng ở file còn lại', async ({ page }) => {
    await editCopy(page);
    await expect(page.locator('.wp-f', { hasText: 'outline.py' }).getByRole('img', { name: '1 finding' })).toBeVisible();
    await expect(page.locator('.wp-f', { hasText: 'SKILL.md' }).getByRole('img', { name: '1 finding' })).toBeVisible();
    await expect(page.locator('.wp-f', { hasText: 'format.md' })).toContainText('~');
  });

  test('nút trạng thái "findings" mở tab Findings; sửa mô tả quá 1024 ký tự thì báo cáo cập nhật', async ({ page }) => {
    await editCopy(page);
    await expect(page.locator('.pv-chk')).toContainText('2 findings');
    await ta(page).click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.insertText(' ' + 'long '.repeat(220));
    await expect(page.locator('.pv-chk')).toContainText('3 findings', { timeout: 8000 });
    await page.locator('.pv-chk').click();
    await expect(insp(page).getByRole('tab', { name: /Findings/ })).toHaveAttribute('aria-selected', 'true');
    await expect(insp(page).getByRole('tabpanel')).toContainText(/description/i);
  });

  test('changes vẫn mở ngăn lịch sử cố định (không có tab History ở chế độ skill)', async ({ page }) => {
    await editCopy(page);
    await page.locator('.pv-modebtn', { hasText: 'changes' }).click();
    await expect(page.getByRole('dialog').or(page.locator('.hs'))).toBeVisible();
  });

  test('⌘/Ctrl+\\ đóng mở panel file, ⌘/Ctrl+⇧+\\ đóng mở Inspector; mở lại tải lại vẫn nhớ riêng', async ({ page }) => {
    await editCopy(page);
    await page.locator('.pv-mode').click();
    await page.keyboard.press('Control+Backslash');
    await expect(page.locator('.pv')).toHaveAttribute('data-wsclosed', '1');
    await page.keyboard.press('Control+Backslash');
    await expect(page.locator('.pv')).not.toHaveAttribute('data-wsclosed', '1');
    await page.keyboard.press('Control+Shift+Backslash');
    await expect(insp(page)).toBeHidden();
    await page.reload();
    await expect(page.locator('.wp')).toBeVisible();
    await expect(insp(page)).toBeHidden(); // lựa chọn của chế độ skill được nhớ
  });

  test('hộp diff: axe sạch ở sáng và tối, dòng thêm/bớt vẫn có ký hiệu + và -', async ({ browser }) => {
    for (const theme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await editCopy(page, theme);
      await ta(page).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\nAdded line.\n');
      await page.getByRole('button', { name: 'Diff' }).click();
      const dlg = page.getByRole('dialog', { name: /Changes in SKILL.md/ });
      await expect(dlg).toContainText('+Added line.');
      const v = (await new AxeBuilder({ page }).analyze()).violations.map((x) => `${x.id}:${x.nodes.map((n) => n.target).join('|')}`);
      expect(v, theme).toEqual([]);
      await ctx.close();
    }
  });

  test('khung làm việc sát mép màn hình; panel bên dùng tông --side; nhãn nguồn dài ngắt dòng trong panel', async ({ page }) => {
    await editCopy(page);
    const pv = (await page.locator('.pv').boundingBox())!;
    expect(pv.x).toBe(0);
    expect(Math.round(pv.width)).toBe(1440);
    const bg = (sel: string) => page.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor);
    const side = await page.evaluate(() => { const d = document.createElement('i'); d.style.background = 'var(--side)'; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });
    expect(await bg('.wp')).toBe(side);
    expect(await bg('.pv-insp')).toBe(side);
    expect(await page.locator('.wp-sub').evaluate((e) => getComputedStyle(e).textOverflow)).toBe('ellipsis'); // một dòng, cắt bằng dấu ba chấm (URL đầy đủ ở tooltip)
  });

  test('Open ▾ có lối vào "Open a skill…" tới màn Inspector', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('link', { name: /Open a skill/ })).toHaveAttribute('href', /\/app\/inspect\/$/);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe sạch (${theme}) với menu File mở và mục mẫu mở rộng`, async ({ page }) => {
      await editCopy(page, theme);
      await page.getByRole('button', { name: 'File menu' }).click();
      await page.getByRole('button', { name: 'New from template' }).click();
      await expect(page.getByRole('button', { name: 'README' })).toBeVisible();
      const v = (await new AxeBuilder({ page }).analyze()).violations.map((x) => `${x.id}:${x.nodes.map((n) => n.target).join('|')}`);
      expect(v).toEqual([]);
    });
  }

  test('tên file: dấu đã lưu và ▾ nằm sát ngay sau tên (không trôi xa tên ngắn)', async ({ page }) => {
    await editCopy(page);
    const nm = (await page.locator('.pv-name').boundingBox())!, sv = (await page.locator('.pv-sv').boundingBox())!;
    expect(sv.x - (nm.x + nm.width)).toBeLessThan(24);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe sạch (${theme}) với Overview và Findings mở`, async ({ page }) => {
      await editCopy(page, theme);
      const run = async () => (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target).join('|')}`);
      expect(await run()).toEqual([]);
      await insp(page).getByRole('tab', { name: /Findings/ }).click();
      expect(await run()).toEqual([]);
    });
  }
});
