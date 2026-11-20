import { expect, test, type Locator, type Page } from '@playwright/test';
import { inspectorTab, ready, viewTab, seedSample } from './helpers';

// Các test dưới đây được viết khi bài mặc định của /app/ còn là bài mẫu; gieo lại bài mẫu để chúng bắt đầu đúng như trước (xem seedSample trong helpers.ts).
test.beforeEach(async ({ context }) => { await seedSample(context); });


/** Giai đoạn 3 Quiet Pro: chỗ đặt các điều khiển của editor. */
const open = async (page: Page, path = '/app/') => { await page.goto(path); await ready(page); await expect(page.locator('.pv')).toBeVisible(); };

test.describe('thanh định dạng, changes, Present', () => {
  test('thanh định dạng nằm trong pane Editor, không nằm trên thanh tách đôi', async ({ page }) => {
    await open(page);
    await expect(page.locator('.pv-src > .pv-tools')).toBeVisible();
    await expect(page.locator('.pv > .pv-tools')).toHaveCount(0);
    await expect(page.locator('.pv-src .pv-tools').getByRole('button', { name: /^find/ })).toBeVisible();
    await expect(page.locator('.pv-src .pv-tools').getByRole('button', { name: /Bold/ })).toBeVisible();
  });

  test('thanh định dạng hiện ở Edit và Split, ẩn ở Read và Zen', async ({ page }) => {
    await open(page);
    const tools = page.locator('.pv-tools');
    await expect(tools).toBeVisible(); // Split
    await viewTab(page, 'Edit').click();
    await expect(tools).toBeVisible();
    await viewTab(page, 'Read').click();
    await expect(tools).toBeHidden();
    await viewTab(page, 'Edit').click();
    await viewTab(page, 'Zen').click();
    await expect(tools).toBeHidden();
  });

  test('changes là nút ở thanh trạng thái và mở ngăn lịch sử', async ({ page }) => {
    await open(page);
    const btn = page.locator('.pv-mode').getByRole('button', { name: 'changes', exact: true });
    await expect(btn).toBeVisible();
    await expect(page.locator('.pv-tools').getByRole('button', { name: 'changes', exact: true })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeHidden();
    await btn.click(); // từ 900px mở Inspector ở tab History thay vì ngăn cố định
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    await expect(inspectorTab(page, 'History')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('dialog', { name: 'Changes and history' })).toHaveCount(0);
  });

  test('changes dưới 900px mở Inspector ở tab History', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto('/app/');
    await ready(page);
    const btn = page.locator('.pv-mode').getByRole('button', { name: 'changes', exact: true });
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Present nằm ở hàng tài liệu (không ở header, không ở thanh định dạng) và mở slide', async ({ page }) => {
    await open(page);
    await expect(page.locator('.pv-tools').getByRole('button', { name: 'Present', exact: true })).toHaveCount(0);
    await expect(page.locator('.pv-view').getByRole('button', { name: 'Present', exact: true })).toHaveCount(0);
    await expect(page.locator('.appbar').getByRole('button', { name: 'Present', exact: true })).toHaveCount(0);
    const btn = page.locator('.pv-bar').getByRole('button', { name: 'Present', exact: true });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('.sl')).toBeVisible();
  });

  test('điện thoại 390px: thanh định dạng ẩn (đã chuyển vào menu File và hàng phím), không tràn ngang', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await open(page);
    await expect(page.locator('.pv-src > .pv-tools')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await ctx.close();
  });
});

type Box = { x: number; y: number; width: number; height: number };
const mid = (b: Box) => b.x + b.width / 2;
const rectOf = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const overlaps = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
const group = (page: Page) => page.getByRole('group', { name: 'View mode' });
/** Neo của nhóm chế độ là tâm nút Split. */
const anchor = (page: Page) => group(page).locator('.pv-desk');
const seamGap = async (page: Page) => Math.abs(mid(await rectOf(anchor(page))) - mid(await rectOf(page.locator('.pv-sep'))));

/** Điều khiển của header (dùng chung cho các kiểm tra không chồng lên nhau). */
const headerItems = (page: Page, path: string): [string, Locator][] => {
  const bar = page.locator('.appbar');
  const items: [string, Locator][] = [
    ['brand', bar.locator('.appbar-brand')], ['New document', bar.getByRole('button', { name: 'New document' })], ['Open menu', bar.getByRole('button', { name: 'Open menu' })],
    ['Inspect summary', bar.locator('.appbar-ins > summary')],
    ['tìm kiếm', bar.locator('.appbar-search')], ['Aa', page.getByRole('button', { name: 'View options', exact: true })],
    ['theme', bar.getByRole('button', { name: 'Switch theme' })], ['Present', page.getByRole('button', { name: 'Present', exact: true })], ['Export', page.getByRole('button', { name: 'Export', exact: true })],
    ['Inspector', page.getByRole('button', { name: 'Inspector', exact: true })],
  ];
  void path;
  return items;
};
const expectNoOverlap = async (page: Page, path: string, tag: string) => {
  const boxes: [string, Box][] = [];
  for (const [name, l] of headerItems(page, path)) boxes.push([name, await rectOf(l)]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    expect(overlaps(boxes[i]![1], boxes[j]![1]), `${boxes[i]![0]} chồng ${boxes[j]![0]} ${tag}`).toBe(false);
  }
  // hàng 2: nhóm chế độ không chồng lên tên file và menu File, và nằm trọn trong thanh tài liệu
  const doc = await rectOf(page.locator('.pv-bar')), g = await rectOf(group(page));
  for (const [name, l] of [['tên file', page.locator('.pv-bar .pv-title')], ['menu File', page.getByRole('button', { name: 'File menu', exact: true })]] as [string, Locator][]) {
    expect(overlaps(g, await rectOf(l)), `nhóm chế độ chồng ${name} ${tag}`).toBe(false);
  }
  expect(g.x, `nhóm chế độ lọt mép trái thanh tài liệu ${tag}`).toBeGreaterThanOrEqual(doc.x);
  expect(g.x + g.width, `nhóm chế độ lọt mép phải thanh tài liệu ${tag}`).toBeLessThanOrEqual(doc.x + doc.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};

test.describe('nhóm chế độ nằm ở thanh tài liệu (hàng 2), nút Split trên trục đường chia', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Split: nhóm trong thanh tài liệu, nút Split đúng trục đường chia, không chồng lên điều khiển khác', async ({ page }) => {
    await open(page);
    await expect(page.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
    await expect(page.locator('.appbar').getByRole('group', { name: 'View mode' })).toHaveCount(0);
    await expect(page.locator('.pv-bar')).toHaveAttribute('data-seam', 'seam');
    expect(await seamGap(page)).toBeLessThanOrEqual(8);
    await expectNoOverlap(page, '/app/', 'ở Split');
  });

  test('tên file và chỉ báo đã lưu ở thanh tài liệu dưới header; menu File ở header cạnh New/Open', async ({ page }) => {
    await open(page);
    const doc = page.locator('.pv-bar');
    await expect(doc.getByRole('textbox', { name: 'File name' })).toBeVisible();
    await expect(page.locator('.appbar').getByRole('button', { name: 'File menu', exact: true })).toBeVisible();
    await expect(page.locator('.appbar').getByRole('textbox', { name: 'File name' })).toHaveCount(0);
    const h = await rectOf(page.locator('.appbar')), d = await rectOf(doc);
    expect(d.y).toBeGreaterThanOrEqual(h.y + h.height - 1);
    expect(d.height).toBeLessThanOrEqual(44);
  });

  test('Edit và Read: nút Split ở giữa cột nội dung, không nhảy khi đổi giữa Edit và Read', async ({ page }) => {
    await open(page);
    const xs: number[] = [];
    for (const name of ['Edit', 'Read'] as const) {
      await viewTab(page, name).click();
      await expect.poll(async () => Math.abs(mid(await rectOf(anchor(page))) - mid(await rectOf(page.locator('.pv-split'))))).toBeLessThanOrEqual(8);
      xs.push(mid(await rectOf(anchor(page))));
    }
    expect(Math.abs(xs[0]! - xs[1]!)).toBeLessThanOrEqual(8);
    await viewTab(page, 'Split').click();
    await expect(group(page)).toBeVisible();
    await expect.poll(() => seamGap(page)).toBeLessThanOrEqual(8);
  });

  /** Kéo đường chia tới `pct`% bề rộng vùng chia (tính như dragSplit). */
  const dragToPct = async (page: Page, pct: number) => {
    const sp = await rectOf(page.locator('.pv-split'));
    const sep = await rectOf(page.locator('.pv-sep'));
    const y = sep.y + sep.height / 2;
    await page.mouse.move(mid(sep), y);
    await page.mouse.down();
    await page.mouse.move(sp.x + (pct / 100) * sp.width, y, { steps: 8 });
    await page.mouse.up();
  };

  for (const pct of [41, 61]) {
    test(`kéo đường chia tới ${pct}%: nút Split vẫn trong 8px so với đường chia`, async ({ page }) => {
      await open(page);
      await dragToPct(page, pct);
      await expect(page.locator('.pv-sep')).toHaveAttribute('aria-valuenow', String(pct));
      await expect.poll(() => seamGap(page)).toBeLessThanOrEqual(8);
      await expectNoOverlap(page, '/app/', `sau khi kéo tới ${pct}%`);
    });
  }

  test('kéo đường chia ra ngoài khoảng bám (70%): nhóm bị kẹp, không chồng lên cụm phải, không tràn', async ({ page }) => {
    await open(page);
    await dragToPct(page, 70);
    await expect(page.locator('.pv-sep')).toHaveAttribute('aria-valuenow', '70');
    await expectNoOverlap(page, '/app/', 'ở 70%');
  });

  test('kéo đường chia tới 25%: nhóm được kẹp, không chồng lên cụm trái', async ({ page }) => {
    await open(page);
    const sep = await rectOf(page.locator('.pv-sep'));
    const y = sep.y + sep.height / 2;
    await page.mouse.move(mid(sep), y);
    await page.mouse.down();
    await page.mouse.move(40, y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('.pv-bar')).toHaveAttribute('data-seam', 'seam');
    const g = await rectOf(group(page)), t = await rectOf(page.locator('.pv-bar .pv-title'));
    expect(g.x).toBeGreaterThanOrEqual(t.x + t.width);
    await expectNoOverlap(page, '/app/', 'ở 25%');
  });

  test('đổi cỡ cửa sổ: nút Split bám trục, nhóm vẫn trong header và không tràn ngang', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 1320, height: 900 });
    await expect(page.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
    await expect.poll(() => seamGap(page)).toBeLessThanOrEqual(8);
    await expectNoOverlap(page, '/app/', 'ở 1320px');
  });

  test('có panel file và Inspector: trục đường chia và tâm cột đều tính phần giữa hai panel', async ({ page }) => {
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).click();
    await page.waitForURL('**/app/');
    await expect(page.locator('.wp')).toBeVisible();
    await expect(page.locator('.pv-insp')).toBeVisible(); // chế độ skill: Inspector tự mở
    await expect(page.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
    await expect.poll(() => seamGap(page)).toBeLessThanOrEqual(8);
    await viewTab(page, 'Read').click();
    const wp = await rectOf(page.locator('.wp')), ip = await rectOf(page.locator('.pv-insp'));
    const center = (wp.x + wp.width + ip.x) / 2;
    await expect.poll(async () => Math.abs(mid(await rectOf(anchor(page))) - center)).toBeLessThanOrEqual(8);
    await expectNoOverlap(page, '/app/', 'ở chế độ skill');
  });

  test('mọi độ rộng nhóm đều ở trong thanh tài liệu; từ 900px bám đường chia, dưới đó đứng sau tên file', async ({ browser }) => {
    const wide = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const p1 = await wide.newPage();
    await open(p1);
    await expect(p1.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
    await expect(p1.locator('.appbar').getByRole('group', { name: 'View mode' })).toHaveCount(0);
    await expect(p1.locator('.pv-bar')).toHaveAttribute('data-seam', 'seam');
    await wide.close();
    const narrow = await browser.newContext({ viewport: { width: 800, height: 800 } });
    const p2 = await narrow.newPage();
    await open(p2);
    await expect(p2.locator('.pv-bar').getByRole('group', { name: 'View mode' })).toBeVisible();
    await expect(p2.locator('.appbar').getByRole('group', { name: 'View mode' })).toHaveCount(0);
    await narrow.close();
  });
});

for (const w of [1280, 1440]) for (const path of ['/', '/app/']) {
  test(`${path} ở ${w}px với tên 70 ký tự: các điều khiển của header không chồng lên nhau`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('mdprev-md', '# A very long document title that keeps going and going for the header test\n\nbody\n'); } catch { /* bỏ qua */ } });
    const page = await ctx.newPage();
    await open(page, path);
    const bar = page.locator('.appbar');
    await expect(page.locator('.pv-bar .pv-title')).toBeVisible(); // tên file ở thanh tài liệu, không ảnh hưởng header
    await expectNoOverlap(page, path, `ở ${w}px trên ${path}`);
    expect(['seam', 'flow']).toContain(await page.locator('.pv-bar').getAttribute('data-seam'));
    expect(await bar.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(52);
    await ctx.close();
  });
}

const page_escape = (p: import('@playwright/test').Page) => p.keyboard.press('Escape');

test.describe('sau review giai đoạn 3', () => {
  test('Present với tới được: menu File ở điện thoại (Edit và Read), hàng tài liệu ở desktop (mọi chế độ)', async ({ browser }) => {
    const ph = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await seedSample(ph); // bài mặc định giờ là tờ giấy trống: gieo bài mẫu như trước (xem seedSample)
    const p1 = await ph.newPage();
    await open(p1);
    await viewTab(p1, 'Edit').click(); // điện thoại mở bài mẫu ở Read
    await p1.getByRole('button', { name: 'File menu', exact: true }).click(); // Edit: thanh định dạng ẩn ở điện thoại, Present nằm trong menu File
    await expect(p1.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
    await page_escape(p1);
    await page_escape(p1);
    await viewTab(p1, 'Read').click();
    await p1.getByRole('button', { name: 'File menu', exact: true }).click();
    await expect(p1.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
    await ph.close();
    const dt = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await dt.newPage();
    await open(p2);
    for (const mode of ['Edit', 'Split', 'Read'] as const) { // ở header, chỗ cố định ở mọi chế độ
      await viewTab(p2, mode).click();
      await expect(p2.locator('.pv-bar').getByRole('button', { name: 'Present', exact: true })).toBeVisible();
    }
    await dt.close();
  });

  test('hộp Find mở ra không đè lên thanh định dạng', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /^find/ }).click();
    const f = await rectOf(page.locator('.pv-find')), t = await rectOf(page.locator('.pv-src > .pv-tools'));
    expect(f.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  });

  test('Transform qua Palette ở Read không sửa văn bản đang ẩn', async ({ page }) => {
    await page.goto('/app/');
    await ready(page);
    const ta = page.locator('.ed-ta');
    await ta.fill('banana\napple\ncherry\n');
    await ta.evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(0, t.value.length - 1); });
    await viewTab(page, 'Read').click();
    await page.locator('.pv-mode').click();
    await page.keyboard.press('/');
    const box = page.getByRole('dialog').getByRole('textbox');
    await box.fill('>transform sort lines a');
    await box.press('Enter');
    await expect(page.locator('.pv-flash')).toHaveText('Switch to edit first');
    await viewTab(page, 'Edit').click();
    await expect(ta).toHaveValue('banana\napple\ncherry\n');
  });
});

/** Khoảng tỉ lệ chia mà tâm nút Split còn bám đường chia (≤8px), đo thật. */
const sweeps: { name: string; w: number; skill: boolean; lo: number; hi: number }[] = [
  { name: '1280 không panel', w: 1280, skill: false, lo: 39, hi: 57 },
  { name: '1440 không panel', w: 1440, skill: false, lo: 41, hi: 61 },
  { name: '1920 không panel', w: 1920, skill: false, lo: 33, hi: 61 },
  { name: '1440 có panel file và Inspector', w: 1440, skill: true, lo: 41, hi: 75 },
];
for (const c of sweeps) {
  test(`quét tỉ lệ chia ở ${c.name}: trong khoảng bám thì lệch ≤8px, ngoài khoảng thì không chồng lên điều khiển khác`, async ({ page }) => {
    await page.setViewportSize({ width: c.w, height: 900 });
    if (c.skill) {
      await page.goto('/app/inspect/');
      await page.getByRole('button', { name: 'try an example' }).click();
      await page.getByRole('button', { name: 'Edit a copy' }).click();
      await page.waitForURL('**/app/');
      await expect(page.locator('.wp')).toBeVisible();
      await expect(page.locator('.pv-insp')).toBeVisible();
    } else await open(page, '/app/');
    const sep = page.locator('.pv-sep');
    await sep.focus();
    await page.keyboard.press('Home');
    for (const dir of ['ArrowLeft', 'ArrowRight'] as const) {
      await page.keyboard.press('Home');
      for (let v = dir === 'ArrowLeft' ? 48 : 52; v >= 25 && v <= 75; v += dir === 'ArrowLeft' ? -2 : 2) {
        await page.keyboard.press(dir);
        await expect(sep).toHaveAttribute('aria-valuenow', String(v));
        if (v >= c.lo && v <= c.hi) await expect.poll(() => seamGap(page), { message: `${c.name} ở ${v}%` }).toBeLessThanOrEqual(8);
        else await expectNoOverlap(page, '/app/', `${c.name} ở ${v}%`);
      }
    }
  });
}
