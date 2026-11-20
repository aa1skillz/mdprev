import { expect, test, type Locator, type Page } from '@playwright/test';
import { inspectorTab, inspectorToggle, ready, viewTab } from './helpers';

/** Giai đoạn 4 Quiet Pro: panel Inspector bên phải của editor. */
const DOC = '# A\n\nintro\n\n## B\n\ntext\n\n#### C\n\nlast\n';
const open = async (page: Page, w = 1440, h = 900, doc = DOC) => {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript((d) => { try { if (!localStorage.getItem('mdprev-md')) localStorage.setItem('mdprev-md', d); } catch { /* bỏ qua */ } }, doc);
  await page.goto('/app/');
  await ready(page);
  await expect(page.locator('.pv')).toBeVisible();
};
const panel = (p: Page) => p.getByRole('complementary', { name: 'Inspector' });
type Box = { x: number; y: number; width: number; height: number };
const rectOf = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const mid = (b: Box) => b.x + b.width / 2;
const group = (p: Page) => p.getByRole('group', { name: 'View mode' });
/** Neo của nhóm chế độ là tâm nút Split. */
const anchor = (p: Page) => group(p).locator('.pv-desk');

test.describe('khung inspector', () => {
  test('icon Inspector mở và đóng panel, nhớ lựa chọn sau khi tải lại', async ({ page }) => {
    await open(page);
    await expect(panel(page)).toBeHidden();
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeVisible();
    await expect(inspectorToggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pv')).toHaveAttribute('data-insp', '1');
    await page.reload();
    await ready(page);
    await expect(panel(page)).toBeVisible();
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeHidden();
    await page.reload();
    await ready(page);
    await expect(panel(page)).toBeHidden();
  });

  test('icon Inspector trên header bật và tắt panel, tô accent khi mở', async ({ page }) => {
    await open(page);
    const t = inspectorToggle(page);
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await t.click();
    await expect(panel(page)).toBeVisible();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await t.click();
    await expect(panel(page)).toBeHidden();
    await page.keyboard.press('Control+Shift+Backslash');
    await expect(panel(page)).toBeVisible();
  });

  test('tablist có tab Outline được chọn sẵn', async ({ page }) => {
    await open(page);
    await inspectorToggle(page).click();
    await expect(panel(page).getByRole('tablist')).toBeVisible();
    await expect(panel(page).getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Outline liệt kê mọi cấp tiêu đề và nhảy tới dòng', async ({ page }) => {
    await open(page);
    await inspectorToggle(page).click();
    const items = panel(page).getByRole('tabpanel').locator('button.pv-ol');
    await expect(items).toHaveCount(3); // Inspector liệt kê mọi cấp tiêu đề (kể cả h4)
    await panel(page).getByRole('textbox', { name: 'Filter headings' }).fill('C');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('C'); 
    await items.first().click();
    await expect(page.locator('.pv-mode')).toContainText('Ln 9,');
  });

  test('bố cục: nút Split đúng trục khi mở inspector, panel không đè nội dung', async ({ page }) => {
    await open(page);
    await expect(page.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeVisible();
    await expect.poll(async () => Math.abs(mid(await rectOf(anchor(page))) - mid(await rectOf(page.locator('.pv-sep'))))).toBeLessThanOrEqual(8);
    const pb = await rectOf(panel(page));
    const xs: number[] = [];
    for (const name of ['Edit', 'Read'] as const) {
      await viewTab(page, name).click();
      const sp = await rectOf(page.locator('.pv-split'));
      const center = (sp.x + pb.x) / 2;
      // ở 1440 với Inspector mở (không panel file), tâm cột Edit/Read bị kẹp: đo thật lệch 12px
      await expect.poll(async () => Math.abs(mid(await rectOf(anchor(page))) - center)).toBeLessThanOrEqual(12);
      xs.push(mid(await rectOf(anchor(page))));
      const pane = await rectOf(page.locator(name === 'Edit' ? '.pv-src' : '.pv-view'));
      expect(pane.x + pane.width).toBeLessThanOrEqual(pb.x + 1);
    }
    expect(Math.abs(xs[0]! - xs[1]!)).toBeLessThanOrEqual(8);
    await viewTab(page, 'Split').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('kéo đường chia vẫn bám con trỏ khi inspector mở, nút Split đi theo', async ({ page }) => {
    await open(page);
    await inspectorToggle(page).click();
    const sep = await rectOf(page.locator('.pv-sep'));
    const y = sep.y + sep.height / 2;
    await page.mouse.move(mid(sep), y);
    await page.mouse.down();
    await page.mouse.move(mid(sep) + 90, y, { steps: 6 });
    await page.mouse.up();
    const moved = mid(await rectOf(page.locator('.pv-sep')));
    expect(Math.abs(moved - (mid(sep) + 90))).toBeLessThanOrEqual(12);
    await expect.poll(async () => Math.abs(mid(await rectOf(anchor(page))) - moved)).toBeLessThanOrEqual(8);
  });

  test('có panel file và inspector cùng lúc: hai chốt ở hai biên của chúng', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.wp')).toBeVisible();
    await expect(panel(page)).toBeVisible(); // chế độ skill: Inspector tự mở
    await expect(page.locator('.appbar').getByRole('button', { name: 'Files', exact: true })).toBeVisible();
    await expect(inspectorToggle(page)).toBeVisible();
    await expect(page.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
    await expect.poll(async () => Math.abs(mid(await rectOf(anchor(page))) - mid(await rectOf(page.locator('.pv-sep'))))).toBeLessThanOrEqual(8);
  });

  test('ẩn trong Zen và khi in', async ({ page }) => {
    await open(page);
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(panel(page)).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await viewTab(page, 'Zen').click();
    await expect(panel(page)).toBeHidden();
    await expect(inspectorToggle(page)).toBeHidden();
  });

  for (const w of [800, 390]) {
    test(`dưới 900px (${w}px): Inspector đã lưu mở thì là pane phủ ngang, không tràn trang`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 844 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('mdprev-insp', '1'); } catch { /* bỏ qua */ } });
      const page = await ctx.newPage();
      await open(page, w, 844);
      await expect(inspectorToggle(page)).toBeVisible();
      await expect(panel(page)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await ctx.close();
    });
  }

  test('1100px: mở inspector không tràn ngang và còn chỗ cho editor', async ({ page }) => {
    await open(page, 1100, 800);
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await rectOf(page.locator('.pv-src'))).width).toBeGreaterThanOrEqual(240);
  });
});

test.describe('tab Properties và Checks', () => {
  const FM = '---\ntitle: T\ntags: [a, b]\nupdated: 2026-01-01\n---\n\n# H\n';
  const LINKS = '# Title\n\n[ok](#title) [bad](#nope)\n\nsee [x][missing] and a note[^1]\n';

  test('Properties khớp front matter của preview', async ({ page }) => {
    await open(page, 1440, 900, FM);
    await inspectorToggle(page).click();
    await inspectorTab(page, 'Properties').click();
    const rows = panel(page).getByRole('table', { name: 'Front matter' }).getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('title');
    await expect(rows.first().getByRole('textbox', { name: 'title' })).toHaveValue(/T/); // Properties sửa được: giá trị nằm trong ô nhập
    await expect(page.locator('.pv-fm, table.pv-props')).toHaveCount(0); // preview không còn gập front matter ở >= 900px: Inspector là nơi duy nhất
  });

  test('Properties không có front matter thì báo rỗng', async ({ page }) => {
    await open(page);
    await inspectorToggle(page).click();
    await inspectorTab(page, 'Properties').click();
    await expect(panel(page).getByRole('tabpanel')).toContainText('No front matter');
  });

  test('Checks khớp nút trạng thái: cùng số lỗi, bấm mục tới đúng dòng', async ({ page }) => {
    await open(page, 1440, 900, LINKS);
    await expect(page.locator('.pv-lint')).toHaveCount(0); // thanh lint cũ đã bỏ ở >= 900px
    await expect(page.locator('.pv-chk')).toContainText('3 issues'); // nút trạng thái cùng số lỗi với tab Checks
    await inspectorToggle(page).click();
    await expect(inspectorTab(page, 'Checks')).toContainText('3');
    await inspectorTab(page, 'Checks').click();
    const items = panel(page).getByRole('tabpanel').getByRole('button', { name: /^Line \d+:/ });
    await expect(items).toHaveCount(3);
    const label = (await items.first().getAttribute('aria-label'))!;
    const line = Number(/^Line (\d+):/.exec(label)![1]);
    await items.first().click();
    await expect(page.locator('.pv-mode')).toContainText(`Ln ${line},`);
  });

  test('Checks không lỗi thì báo No issues', async ({ page }) => {
    await open(page, 1440, 900, '# Clean\n\nall good\n');
    await inspectorToggle(page).click();
    await inspectorTab(page, 'Checks').click();
    await expect(panel(page).getByRole('tabpanel')).toContainText('No issues');
    await expect(panel(page).getByRole('button', { name: /^Fix \d+ trailing/ })).toHaveCount(0);
  });

  test('khoảng trắng cuối dòng: liệt kê như lỗi và sửa được bằng một bước undo', async ({ page }) => {
    await open(page, 1440, 900, 'a   \nb\n');
    await inspectorToggle(page).click();
    await inspectorTab(page, 'Checks').click();
    await expect(panel(page).getByRole('button', { name: /Trailing whitespace/ })).toHaveCount(1);
    await panel(page).getByRole('button', { name: /^Fix 1 trailing/ }).click();
    await expect(page.locator('.ed-ta')).toHaveValue('a\nb\n');
    await page.keyboard.press('Control+z');
    await expect(page.locator('.ed-ta')).toHaveValue('a   \nb\n');
  });

  test('bốn tab theo thứ tự, mũi tên và Home/End chuyển tab, aria-controls đúng', async ({ page }) => {
    await open(page);
    await inspectorToggle(page).click();
    const tabs = panel(page).getByRole('tab');
    await expect(tabs).toHaveText([/Outline/, /Properties/, /Checks/, /History/]);
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(inspectorTab(page, 'Properties')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(inspectorTab(page, 'History')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(inspectorTab(page, 'Outline')).toHaveAttribute('aria-selected', 'true');
    const ctl = await inspectorTab(page, 'Outline').getAttribute('aria-controls');
    await expect(page.locator('#' + ctl)).toHaveAttribute('role', 'tabpanel');
  });
});

test.describe('tab History', () => {
  const BASE = 'l1\nl2\nl3\n';
  const region = (p: Page) => panel(p).getByRole('region', { name: 'Changes and history' });
  const drawer = (p: Page) => p.getByRole('dialog', { name: 'Changes and history' });
  const changesBtn = (p: Page) => p.locator('.pv-mode').getByRole('button', { name: 'changes', exact: true });
  const edit = async (p: Page) => {
    await p.locator('input[type=file]').setInputFiles({ name: 'doc.md', mimeType: 'text/markdown', buffer: Buffer.from(BASE) });
    await expect(p.locator('.ed-ta')).toHaveValue(BASE);
    await p.locator('.ed-ta').fill('l1\nX2\nl3\n');
  };

  test('tab History hiện Changes và History bên trong, đúng dữ liệu', async ({ page }) => {
    await open(page);
    await edit(page);
    await inspectorToggle(page).click();
    await inspectorTab(page, 'History').click();
    await expect(region(page)).toBeVisible();
    await expect(region(page).locator('.hs-hunk')).toHaveCount(1);
    await expect(region(page).locator('.hs-b')).toContainText('1 change');
    await region(page).locator('.hs-hunk').first().getByRole('button', { name: 'REVERT' }).click();
    await expect(page.locator('.ed-ta')).toHaveValue(BASE);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.ed-ta')).toHaveValue('l1\nX2\nl3\n');
  });

  test('tab History nhớ ngăn con HISTORY khi chuyển sang tab khác rồi quay lại', async ({ page }) => {
    await open(page);
    await edit(page);
    await inspectorToggle(page).click();
    await inspectorTab(page, 'History').click();
    await region(page).getByRole('button', { name: 'HISTORY', exact: true }).click();
    await inspectorTab(page, 'Checks').click();
    await inspectorTab(page, 'History').click();
    await expect(region(page).getByRole('button', { name: 'HISTORY', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('chỉ một bản StudioHistory: inspector mở ở History thì nút changes đóng Inspector, không mở ngăn cố định', async ({ page }) => {
    await open(page);
    await edit(page);
    await inspectorToggle(page).click();
    await inspectorTab(page, 'History').click();
    await expect(changesBtn(page)).toHaveAttribute('aria-expanded', 'true');
    await changesBtn(page).click(); // Inspector đã ở đúng tab History: bấm lần nữa thì đóng
    await expect(panel(page)).toBeHidden();
    await expect(changesBtn(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.locator('.hs')).toHaveCount(0);
  });

  test('nút changes khi inspector đang mở ở tab khác: chuyển sang tab History, không có ngăn cố định', async ({ page }) => {
    await open(page);
    await edit(page);
    await inspectorToggle(page).click();
    await expect(inspectorTab(page, 'Outline')).toHaveAttribute('aria-selected', 'true');
    await changesBtn(page).click();
    await expect(inspectorTab(page, 'History')).toHaveAttribute('aria-selected', 'true');
    await expect(drawer(page)).toHaveCount(0);
    await expect(region(page)).toBeVisible();
    await expect(page.locator('.hs')).toHaveCount(1);
  });

  test('nút changes khi inspector đóng: mở inspector ở tab History; bản chụp lưu trong tab vẫn còn khi mở lại', async ({ page }) => {
    await open(page);
    await edit(page);
    await changesBtn(page).click();
    await expect(inspectorTab(page, 'History')).toHaveAttribute('aria-selected', 'true');
    await expect(drawer(page)).toHaveCount(0);
    await region(page).getByRole('button', { name: 'HISTORY' }).click();
    const count = async (l: Locator) => Number(/(\d+) of \d+ snapshots/.exec(await l.innerText())![1]);
    await expect(region(page)).toContainText('snapshots');
    const n0 = await count(region(page));
    await region(page).getByRole('button', { name: 'SNAPSHOT NOW' }).click();
    await expect.poll(() => count(region(page))).toBe(n0 + 1);
    await inspectorToggle(page).click(); // đóng inspector
    await expect(panel(page)).toBeHidden();
    await changesBtn(page).click();
    await region(page).getByRole('button', { name: 'HISTORY' }).click();
    await expect.poll(() => count(region(page))).toBe(n0 + 1);
  });
});

test.describe('review cuối: Zen và màn hẹp', () => {
  test('Zen không chừa 300px trống bên phải khi inspector đang mở', async ({ page }) => {
    await open(page);
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('f');
    await expect(page.locator('.pv')).toHaveAttribute('data-zen', '1');
    expect(await page.locator('.pv-split').evaluate((e) => getComputedStyle(e).paddingRight)).toBe('0px');
  });

  test('dưới 900px Inspector là một pane phủ lên ô soạn; nút icon đóng lại, changes mở tab History', async ({ page }) => {
    test.slow(); // lúc cả bộ chạy song song, trang đôi khi nạp chậm (khi chạy riêng đạt ổn định)
    await open(page, 390, 800);
    await expect(panel(page)).toBeHidden();
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeVisible();
    await expect.poll(async () => (await panel(page).boundingBox())?.width ?? 0).toBeGreaterThan(380); // phủ hết bề ngang, không phải panel bên (poll: khung giữ chỗ được thay bằng panel thật)
    await inspectorTab(page, 'Outline').click();
    await expect(page.locator('.pv-outline')).toBeVisible();
    await inspectorToggle(page).click();
    await expect(panel(page)).toBeHidden();
    await page.locator('.ed-ta').fill('x\n');
    await page.locator('.ed-ta').blur(); // bàn phím ảo hạ xuống thì hàng phím Markdown không còn phủ thanh trạng thái
    await expect(page.locator('.pv-keys')).toHaveCount(0);
    await page.locator('.pv-mode').getByRole('button', { name: 'changes', exact: true }).click();
    await expect(panel(page)).toBeVisible();
    await expect(inspectorTab(page, 'History')).toHaveAttribute('aria-selected', 'true');
  });
});

test('hẹp rồi rộng: Inspector mount theo ngữ cảnh, phím o mở Outline và focus ô lọc ở cả hai cỡ', async ({ page }) => {
  await open(page, 800, 700);
  await expect(page.locator('.pv-rail, .pv-lint, .pv-outbtn, .pv-fm')).toHaveCount(0); // điều khiển cũ đã gỡ
  await page.locator('.pv-mode').click();
  await page.keyboard.press('o');
  await expect(page.locator('.pv-outline .pv-railq')).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 700 });
  await expect(panel(page)).toBeVisible();
  await page.locator('.pv-mode').click();
  await page.keyboard.press('o');
  await expect(page.locator('.pv-outline .pv-railq')).toBeFocused();
});
