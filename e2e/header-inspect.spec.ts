import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Ô "Inspect a skill" trên header: gõ thật (không fill), phím tắt toàn cục không chen vào, Enter bắt đầu kiểm tra thật. */
const SKILL = (n: string) => `---\nname: ${n}\ndescription: Does ${n}. Use when you need ${n}.\n---\n# ${n}\n\nRun \`python scripts/run.py\`.\n`;
const FILES: Record<string, string> = {
  'skills/alpha/SKILL.md': SKILL('alpha'),
  'skills/alpha/scripts/run.py': 'import subprocess\nsubprocess.run("ls", shell=True)\n',
  'skills/beta/SKILL.md': SKILL('beta'),
  'README.md': '# Demo\n',
};
const CORS = { 'access-control-allow-origin': '*' };
async function mockGithub(page: Page) {
  await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ tree: Object.entries(FILES).map(([path, text]) => ({ path, type: 'blob', size: text.length })), truncated: false }) }));
  await page.route('https://raw.githubusercontent.com/**', (r) => {
    const p = decodeURIComponent(new URL(r.request().url()).pathname.replace(/^\/o\/r\/[^/]+\//, ''));
    return r.fulfill({ status: FILES[p] === undefined ? 404 : 200, headers: CORS, body: FILES[p] ?? '' });
  });
}

test('gõ link GitHub thật vào ô header: /, ? và d không kích hoạt phím tắt; Enter mở Inspector và bắt đầu kiểm tra', async ({ page }) => {
  await mockGithub(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await page.locator('.pv').waitFor();
  const theme0 = await page.evaluate(() => document.documentElement.dataset['theme']);
  await page.locator('.appbar-ins > summary').click();
  const input = page.getByRole('textbox', { name: 'Skill link' });
  await expect(input).toBeFocused();
  await input.pressSequentially('github.com/o/r/tree/main/skills? d', { delay: 15 });
  await expect(input).toHaveValue('github.com/o/r/tree/main/skills? d');
  await expect(page.getByRole('dialog')).toHaveCount(0); // không mở Palette hay bảng phím tắt
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe(theme0); // phím d không đổi theme
  await input.fill('github.com/o/r');
  await input.press('Enter');
  await page.waitForURL(/\/app\/inspect\/\?u=github\.com%2Fo%2Fr|\/app\/inspect\/\?u=github\.com\/o\/r/);
  await expect(page.locator('.ix')).toContainText(/alpha/, { timeout: 15000 }); // kiểm tra thật đã chạy trên link đó
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe sạch (${theme}) với ô Inspect đang mở và với menu Open ▾`, async ({ page }) => {
    await page.addInitScript((t) => { try { localStorage.setItem('mdprev-theme', t); } catch { /* bỏ qua */ } }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/');
    await page.locator('.pv').waitFor();
    const run = async () => (await new AxeBuilder({ page }).include('.appbar').analyze()).violations.map((v) => `${v.id}:${v.nodes.map((n) => n.target).join('|')}`);
    await page.locator('.appbar-ins > summary').click();
    expect(await run()).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open menu' }).click();
    expect(await run()).toEqual([]);
  });
}

test('theme: nút nói rõ bấm sẽ ra gì; Palette "follow the system" trả lại việc theo hệ điều hành', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await page.locator('.pv').waitFor();
  const btn = page.getByRole('button', { name: 'Switch theme' });
  await expect(btn).toHaveAttribute('title', /Switch to light.*following the system/);
  await btn.click();
  await expect(btn).toHaveAttribute('title', 'Switch to dark');
  expect(await page.evaluate(() => document.documentElement.dataset['themeSource'])).toBe('chosen');
  await btn.focus();
  await page.keyboard.press('/');
  await page.getByRole('dialog').getByRole('textbox').fill('>theme system');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset['themeSource'])).toBe('system');
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('dark'); // hệ điều hành đang tối
  await expect(btn).toHaveAttribute('title', /following the system/);
  await ctx.close();
});
