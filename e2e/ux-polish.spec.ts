import { expect, test } from '@playwright/test';
import { ready } from './helpers';

test('empty state có nút, Properties sửa được, Revert all không ngắt dòng, số từ mở Checks', async ({ page }) => {
  await page.goto('/app/');
  await ready(page);
  const ta = page.locator('.ed-ta');
  await page.getByRole('button', { name: 'Start writing' }).click({ timeout: 3000 }).catch(() => undefined); // thẻ chào phủ lên preview trống: tắt nó thì mới thấy khối "Nothing to preview" bên dưới
  await ta.fill('');
  await expect(page.getByRole('button', { name: 'Load sample' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paste from clipboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open a file…' })).toBeVisible();

  await ta.fill('---\ntitle: Hello\ntags: [a, b]\n---\n\n# Hi');
  await page.getByRole('button', { name: 'Inspector' }).click();
  await page.getByRole('tab', { name: 'Properties' }).or(page.getByText('Properties', { exact: true })).first().click();
  const t = page.locator('input.pv-insp-in[aria-label="title"]');
  await t.fill('New: title');
  await t.press('Enter');
  await expect(ta).toHaveValue(/title: "New: title"\ntags: \[a, b\]/);

  await page.getByText('History', { exact: true }).first().click();
  await page.getByRole('button', { name: 'changes' }).first().click();
  const rev = page.getByRole('button', { name: /revert all/i });
  await expect(rev).toBeVisible();
  expect((await rev.boundingBox())!.height).toBeLessThan(24);

  await page.getByRole('button', { name: /words/ }).first().click();
  await expect(page.getByRole('tab', { name: 'Checks', selected: true }).or(page.getByText('Writing').first()).first()).toBeVisible();
});
