import { expect, test } from '@playwright/test';
import { exportMenu, ready } from './helpers';

// Link #e=: crypto.subtle chỉ chạy ở nơi an toàn (localhost/HTTPS), nên chạy trên 127.0.0.1.
const pw = () => 'pw-' + Math.random().toString(36).slice(2);

async function makeLink(page: import('@playwright/test').Page, md: string, password: string, expiry?: string): Promise<string> {
  await page.goto('/app/');
  await ready(page);
  await page.locator('.ed-ta').fill(md);
  await exportMenu(page).click();
  await page.getByRole('button', { name: /Share with password/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Share with a password' });
  await dlg.locator('input[type=password]').fill(password);
  if (expiry) await dlg.getByRole('combobox').selectOption({ label: expiry });
  await dlg.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('.pv-flash')).toHaveText(/Copied protected link/i, { timeout: 15_000 });
  return page.evaluate(() => navigator.clipboard.readText());
}

test.describe('link chia sẻ có mật khẩu #e=', () => {
  test.beforeEach(async ({ context, browserName }) => {
    test.skip(browserName !== 'chromium', 'quyền clipboard chỉ cấp được trên Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('vòng khứ hồi: sai mật khẩu báo chung, đúng mật khẩu mở đúng nội dung; mật khẩu không nằm trong URL hay localStorage', async ({ page, context }) => {
    test.setTimeout(60_000);
    const p = pw();
    const link = await makeLink(page, '# Secret plan\n\nchữ có dấu: đường đi\n', p);
    expect(link).toMatch(/\/app\/#e=[A-Za-z0-9_-]+$/);
    expect(link).not.toContain(p);
    const fresh = await context.newPage();
    await fresh.goto(link);
    const dlg = fresh.getByRole('dialog', { name: 'Open protected document' });
    await expect(dlg).toBeVisible();
    await expect(fresh).toHaveURL(/\/app\/$/); // hash đã xoá
    await dlg.locator('input[type=password]').fill(p + 'x');
    await dlg.getByRole('button', { name: 'Open' }).click();
    await expect(dlg.getByRole('alert')).toHaveText('Could not open: the password is wrong or the link is damaged.', { timeout: 15_000 });
    await dlg.locator('input[type=password]').fill(p);
    await dlg.getByRole('button', { name: 'Open' }).click();
    await expect(fresh.locator('.pv .md-doc h1')).toHaveText('Secret plan', { timeout: 15_000 });
    await expect(fresh.locator('.pv .md-doc p').first()).toHaveText('chữ có dấu: đường đi');
    const stored = await fresh.evaluate(() => JSON.stringify(localStorage));
    expect(stored).not.toContain(p);
  });

  test('sửa một byte header thì báo lỗi chung', async ({ page, context }) => {
    test.setTimeout(60_000);
    const p = pw();
    const link = await makeLink(page, '# Tamper\n', p, '7 days');
    const [base, payload] = link.split('#e=') as [string, string];
    const bytes = Buffer.from(payload, 'base64url');
    bytes[36] = (bytes[36] ?? 0) ^ 1; // byte thấp của hạn dùng
    const fresh = await context.newPage();
    await fresh.goto(`${base}#e=${bytes.toString('base64url')}`);
    const dlg = fresh.getByRole('dialog', { name: 'Open protected document' });
    await dlg.locator('input[type=password]').fill(p);
    await dlg.getByRole('button', { name: 'Open' }).click();
    await expect(dlg.getByRole('alert')).toHaveText(/password is wrong or the link is damaged/, { timeout: 15_000 });
  });

  test('link quá hạn bị từ chối trước khi hỏi mật khẩu', async ({ page, context }) => {
    test.setTimeout(60_000);
    const link = await makeLink(page, '# Old\n', pw(), '1 day');
    const fresh = await context.newPage();
    await fresh.addInitScript(() => { const real = Date.now; Date.now = () => real() + 2 * 86_400_000; }); // đồng hồ người xem đã qua hạn
    await fresh.goto(link);
    const dlg = fresh.getByRole('alertdialog', { name: 'Shared link expired' });
    await expect(dlg).toContainText('This shared link expired on');
    await expect(fresh.locator('input[type=password]')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Close' }).click();
    await expect(dlg).toHaveCount(0);
  });
});
