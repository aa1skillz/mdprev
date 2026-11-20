import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';

/** M2: "Edit a copy" ở Inspector → editor có panel file: sửa, thấy Modified, diff, thêm/đổi tên/xoá, tải zip, giữ sau khi tải lại. */
const ta = (p: Page) => p.locator('.ed-ta');
const row = (p: Page, name: string) => p.locator('.wp-f', { hasText: name });

async function editCopy(page: Page) {
  await page.goto('/app/inspect/');
  await page.getByRole('button', { name: 'try an example' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('example-skill');
  await page.getByRole('button', { name: 'Edit a copy' }).click();
  await page.waitForURL('**/app/');
  await expect(page.locator('.wp')).toBeVisible();
  await expect(ta(page)).not.toHaveAttribute('readonly', '');
}

test.describe('bản sao có thể sửa', () => {
  test('Inspector → Edit a copy mở editor với cây file, SKILL.md đang mở, chưa có thay đổi', async ({ page }) => {
    await editCopy(page);
    await expect(page.locator('.pv')).toHaveAttribute('data-ws', '1');
    await expect(page.locator('.wp-name')).toHaveText('example-skill');
    await expect(page.locator('.wp-sub')).toContainText('no changes');
    await expect(row(page, 'SKILL.md')).toHaveAttribute('aria-current', 'true');
    await expect(ta(page)).toHaveValue(/^---\nname: example-skill/);
  });

  test('đổi sang bản sao không lộ bài cũ và không báo sai "No SKILL.md" ở lúc nạp', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __bad: string[] };
      w.__bad = [];
      const tick = () => {
        const pv = document.querySelector('.pv'), ta = document.querySelector<HTMLTextAreaElement>('.ed-ta');
        if (pv && ta && ta.value.includes('Better meetings') && !pv.hasAttribute('data-wsbusy') && !pv.hasAttribute('data-ws')) w.__bad.push('old doc visible');
        if (document.body?.textContent?.includes('No SKILL.md in this copy')) w.__bad.push('false no-skill');
        if (pv?.hasAttribute('data-wsbusy') && /better.meetings/i.test(document.body.innerText + ' ' + document.title)) w.__bad.push('old doc leaks while busy: ' + document.title + ' | ' + document.body.innerText.match(/.{0,20}better.meetings.{0,20}/i)?.[0]);
        requestAnimationFrame(tick);
      };
      if (location.pathname.startsWith('/app/') && !location.pathname.startsWith('/app/inspect')) { localStorage.setItem('mdprev-md', '# Better meetings\n\nold draft\n'); requestAnimationFrame(tick); }
    });
    await editCopy(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as unknown as { __bad: string[] }).__bad)).toEqual([]);
  });

  test('sửa một file: huy hiệu M, diff với bản gốc, tải lại vẫn còn', async ({ page }) => {
    await editCopy(page);
    await ta(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nAdded by the test.\n');
    await expect(row(page, 'SKILL.md').getByRole('img', { name: 'modified' })).toBeVisible();
    await expect(page.locator('.wp-sub')).toContainText('1 changed');
    await page.getByRole('button', { name: 'Diff' }).click();
    await expect(page.getByRole('dialog', { name: /Changes in SKILL.md/ })).toContainText('+Added by the test.');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('.wp')).toBeVisible();
    await expect(ta(page)).toHaveValue(/Added by the test\./);
    await expect(row(page, 'SKILL.md').getByRole('img', { name: 'modified' })).toBeVisible();
  });

  test('thêm, đổi tên, xoá và khôi phục file; đường dẫn xấu bị từ chối', async ({ page }) => {
    await editCopy(page);
    await page.getByRole('button', { name: 'New file' }).click();
    await page.getByLabel('New file path').fill('../escape.md');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('alert')).toContainText('not allowed');
    await page.getByLabel('New file path').fill('notes/todo.md');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(row(page, 'todo.md')).toHaveAttribute('aria-current', 'true');
    await expect(row(page, 'todo.md').getByRole('img', { name: 'new' })).toBeVisible();
    await page.getByRole('button', { name: 'Rename' }).click();
    await page.getByLabel('Rename to').fill('notes/done.md');
    await page.getByRole('button', { name: 'Rename', exact: true }).last().click();
    await expect(row(page, 'done.md')).toBeVisible();
    await expect(row(page, 'todo.md')).toHaveCount(0);
    // xoá file gốc rồi khôi phục
    await row(page, 'SKILL.md').click();
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await page.getByRole('alert').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('region', { name: 'Deleted files' })).toContainText('SKILL.md');
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(row(page, 'SKILL.md')).toBeVisible();
  });

  test('Download zip chứa đúng các file đã sửa', async ({ page }) => {
    await editCopy(page);
    await ta(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nZIPPED\n');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download zip' }).click()]);
    expect(dl.suggestedFilename()).toBe('example-skill.zip');
    const path = test.info().outputPath('copy.zip');
    await dl.saveAs(path);
    const files = unzipSync(new Uint8Array(readFileSync(path)));
    const names = Object.keys(files);
    expect(names.some((n) => n === 'example-skill/SKILL.md')).toBe(true);
    expect(new TextDecoder().decode(files['example-skill/SKILL.md'])).toContain('ZIPPED');
  });

  test('Close copy trả lại tài liệu nháp cũ nguyên vẹn', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.locator('.pv .ed-ta')).toBeVisible();
    await ta(page).fill('# my scratch note\n');
    await page.waitForTimeout(500);
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.wp')).toBeVisible();
    await expect(ta(page)).not.toHaveValue(/my scratch note/);
    await page.getByRole('button', { name: 'Close copy' }).click();
    await page.getByRole('button', { name: 'Close and remove' }).click();
    await expect(page.locator('.wp')).toHaveCount(0);
    await expect(ta(page)).toHaveValue('# my scratch note\n');
    await page.reload();
    await expect(ta(page)).toHaveValue('# my scratch note\n');
    await expect(page.locator('.pv')).not.toHaveAttribute('data-ws', '1');
  });

  test('tài liệu nháp cũ không bị đụng khi mở bản sao (khoá mdprev-md giữ nguyên)', async ({ page }) => {
    await page.goto('/app/inspect/'); // trang không có editor nên không tự ghi lại khoá nháp sau khi đặt giá trị
    await page.evaluate(() => localStorage.setItem('mdprev-md', '# legacy doc\n'));
    await page.getByRole('button', { name: 'try an example' }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.wp')).toBeVisible();
    await ta(page).click();
    await page.keyboard.type('edit in copy ');
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => localStorage.getItem('mdprev-md'))).toBe('# legacy doc\n');
  });
});

test.describe('bản sao: các trường hợp biên', () => {
  test('file CRLF: mở ra không tự thành Modified, zip giữ nguyên byte khi chưa sửa', async ({ page }) => {
    const md = '---\r\nname: crlf-skill\r\ndescription: Does crlf. Use when you need crlf.\r\n---\r\n# crlf\r\n';
    const buffer = Buffer.from(zipSync({ 'crlf-skill/SKILL.md': strToU8(md) }));
    await page.goto('/app/inspect/');
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'c.zip', mimeType: 'application/zip', buffer });
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.wp')).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.locator('.wp-sub')).toContainText('no changes');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download zip' }).click()]);
    const path = test.info().outputPath('crlf.zip');
    await dl.saveAs(path);
    const files = unzipSync(new Uint8Array(readFileSync(path)));
    expect(new TextDecoder().decode(files['crlf-skill/SKILL.md'])).toBe(md);
  });

  test('tab thứ hai trên cùng bản sao chỉ đọc, không đè lên tab đầu', async ({ page, context }) => {
    await editCopy(page);
    const second = await context.newPage();
    await second.goto('/app/');
    await expect(second.locator('.wp')).toBeVisible();
    await expect(second.locator('.ed-ta')).toHaveAttribute('readonly', '');
    await expect(ta(page)).not.toHaveAttribute('readonly', '');
  });

  test('Close copy xoá bản sao khỏi trình duyệt sau khi xác nhận', async ({ page }) => {
    await editCopy(page);
    await page.getByRole('button', { name: 'Close copy' }).click();
    await expect(page.getByRole('alert')).toContainText('removed from this browser');
    await page.getByRole('button', { name: 'Close and remove' }).click();
    await expect(page.locator('.wp')).toHaveCount(0);
    const n = await page.evaluate(() => new Promise<number>((res) => { const r = indexedDB.open('mdprev', 1); r.onsuccess = () => { const q = r.result.transaction('workspaces').objectStore('workspaces').count(); q.onsuccess = () => res(q.result); }; }));
    expect(n).toBe(0);
  });
});

test.describe('bản sao: bố cục', () => {
  test('kéo thanh chia khi panel đang mở: vạch theo con trỏ (không lệch bề rộng panel)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await editCopy(page);
    const box = async () => { const b = (await page.locator('.pv-sep').boundingBox())!; return b.x + b.width / 2; };
    const x0 = await box();
    await page.mouse.move(x0, 400); await page.mouse.down(); await page.mouse.move(x0 + 120, 400, { steps: 6 }); await page.mouse.up();
    expect(Math.abs((await box()) - (x0 + 120))).toBeLessThanOrEqual(6);
  });
});

test.describe('bản sao, điện thoại', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('panel là ngăn kéo: đóng sẵn sau khi mở file, mở bằng icon Files trên header, không cuộn ngang trang', async ({ page }) => {
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.pv')).toHaveAttribute('data-wsclosed', '1');
    // nút mở panel phải nằm trong màn hình ngay khi mở (Playwright tự cuộn tới nút nên cú nhấp không chứng minh điều này)
    const r = await page.locator('.appbar').getByRole('button', { name: 'Files', exact: true }).boundingBox();
    expect(r!.x + r!.width).toBeLessThanOrEqual(390);
    expect(r!.x).toBeGreaterThanOrEqual(0);
    await page.locator('.appbar').getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.locator('.wp')).toBeVisible();
    const m = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - document.documentElement.clientWidth, w: document.querySelector('.wp')!.getBoundingClientRect().width }));
    expect(m.x).toBeLessThanOrEqual(0);
    expect(m.w).toBeLessThan(390);
    await page.getByRole('button', { name: 'Close file panel' }).click();
    await expect(page.locator('.wp')).toBeHidden();
  });
});

test.describe('icon Files trên header', () => {
  test('thu lại và mở lại, tô accent khi mở, phím ⌘\\', async ({ page }) => {
    await editCopy(page);
    const btn = page.locator('.appbar').getByRole('button', { name: 'Files', exact: true });
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    const first = (await btn.boundingBox())!, brand = (await page.locator('.appbar-brand').boundingBox())!;
    expect(first.x).toBeGreaterThan(brand.x + brand.width); // sau logo
    await btn.click();
    await expect(page.locator('.wp')).toBeHidden();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Control+Backslash');
    await expect(page.locator('.wp')).toBeVisible();
    await expect(page.locator('.pv-edge')).toHaveCount(0); // tay nắm biên đã bỏ
  });

  test('ẩn trong zen', async ({ page }) => {
    await editCopy(page);
    await ta(page).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
    await expect(page.locator('.appbar').getByRole('button', { name: 'Files', exact: true })).toBeHidden();
  });

  test('có trên điện thoại 390px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.pv[data-ws]')).toBeVisible();
    await expect(page.locator('.appbar').getByRole('button', { name: 'Files', exact: true })).toBeVisible();
    await ctx.close();
  });
});

test('không còn nút chữ files: icon Files trên header có ở desktop và điện thoại', async ({ page, browser }) => {
  await editCopy(page);
  await expect(page.getByRole('button', { name: 'files', exact: true })).toBeHidden();
  await expect(page.locator('.appbar').getByRole('button', { name: 'Files', exact: true })).toBeVisible();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ph = await ctx.newPage();
  await ph.goto('/app/inspect/');
  await ph.getByRole('button', { name: 'try an example' }).click();
  await ph.getByRole('button', { name: 'Edit a copy' }).click();
  await ph.waitForURL('**/app/');
  await expect(ph.getByRole('button', { name: 'files', exact: true })).toHaveCount(0);
  await expect(ph.locator('.appbar').getByRole('button', { name: 'Files', exact: true })).toBeVisible();
  await ctx.close();
});
