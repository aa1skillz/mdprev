import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileMenu, inspectorToggle, seedNotes, viewTab } from './helpers';

test.beforeEach(async ({ context }) => { await seedNotes(context); });

const URL_ = '/app/';
const ta = (p: Page) => p.locator('.ed-ta');
const ready = (p: Page) => expect(p.locator('.pv-modetag')).toHaveText('READY');
const open = async (p: Page, md?: string) => {
  await p.goto(URL_);
  await expect(p.locator('.md-doc h1')).toBeVisible();
  if (md !== undefined) { await ta(p).fill(md); await ready(p); }
};
const val = (p: Page) => ta(p).inputValue();
/** Dán bằng sự kiện giả; trả về defaultPrevented để biết handler có nhận hay để trình duyệt tự dán. */
const paste = (p: Page, data: Record<string, string>) => ta(p).evaluate((t: HTMLTextAreaElement, d: Record<string, string>) => {
  t.focus();
  const dt = new DataTransfer();
  for (const [k, v] of Object.entries(d)) dt.setData(k, v);
  const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  t.dispatchEvent(e);
  return e.defaultPrevented;
}, data);
const file = async (p: Page, item: string) => {
  await fileMenu(p).click();
  if ((await p.getByRole('button', { name: item, exact: true }).count()) === 0) await p.getByRole('button', { name: 'New from template' }).click(); // mẫu nằm trong mục mở rộng
  await p.getByRole('button', { name: item, exact: true }).click();
};

test.describe('studio: templates', () => {
  test('FILE → New from template thay tài liệu, Restore previous đưa bản cũ về', async ({ page }) => {
    await open(page, '# My draft\n\nsome text of mine\n');
    page.once('dialog', (d) => void d.accept());
    await file(page, 'README');
    await expect.poll(() => val(page)).toContain('# Project name');
    await ready(page);
    await expect(page.locator('.md-doc h1')).toHaveText('Project name');
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Restore previous' }).click();
    await expect.poll(() => val(page)).toBe('# My draft\n\nsome text of mine\n');
  });

  test('mẫu Decision record có ngày hôm nay; Palette có lệnh mẫu', async ({ page }) => {
    await open(page, '');
    await file(page, 'Decision record');
    await expect.poll(() => val(page)).toMatch(/Date: \d{4}-\d\d-\d\d/);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    const box = page.getByRole('dialog').getByRole('textbox');
    await box.fill('>template changelog');
    await expect(page.getByRole('link', { name: /New from template, Changelog/ })).toBeVisible();
  });
});

test.describe('studio: paste HTML', () => {
  const H = '<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://x.io">link</a>.</p><ul><li>one</li><li>two</li></ul>';

  test('HTML có cấu trúc thành Markdown, một bước undo', async ({ page }) => {
    await open(page, 'start\n');
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
    expect(await paste(page, { 'text/html': H, 'text/plain': 'Title Some bold and link. one two' })).toBe(true);
    await expect.poll(() => val(page)).toContain('## Title');
    const v = await val(page);
    expect(v).toContain('**bold**');
    expect(v).toContain('[link](https://x.io)');
    expect(v).toMatch(/^- +one$/m);
    await expect(page.locator('.pv-flash')).toHaveText('Pasted as markdown');
    await page.keyboard.press('Control+z');
    await expect.poll(() => val(page)).toBe('start\n');
  });

  test('HTML chỉ có div/span có style (VS Code, terminal) để trình duyệt dán chữ thường', async ({ page }) => {
    await open(page, '');
    expect(await paste(page, { 'text/html': '<div style="color:red"><span style="font-weight:bold">let a = 1;</span></div>', 'text/plain': 'let a = 1;' })).toBe(false);
    expect(await paste(page, { 'text/plain': 'just plain' })).toBe(false);
  });

  test('bọc <b> của Google Docs không làm cả đoạn đậm', async ({ page }) => {
    await open(page, '');
    expect(await paste(page, { 'text/html': '<b style="font-weight:normal" id="docs-internal-guid-1"><h2>Heading</h2><p>Body text</p></b>', 'text/plain': 'Heading Body text' })).toBe(true);
    await expect.poll(() => val(page)).toContain('## Heading');
    expect(await val(page)).not.toContain('**');
  });

  test('Ctrl+Shift+V (dán chữ thường) không chuyển HTML', async ({ page }) => {
    await open(page, '');
    await ta(page).focus();
    await page.keyboard.press('Control+Shift+v');
    expect(await paste(page, { 'text/html': H, 'text/plain': 'plain' })).toBe(false);
  });

  test('bảng HTML vẫn đi đường bảng cũ', async ({ page }) => {
    await open(page, '');
    await paste(page, { 'text/html': '<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>', 'text/plain': 'A\tB\n1\t2' });
    await expect.poll(() => val(page)).toContain('| A');
  });

  test('turndown nạp lười: không có trong các tệp JS nạp lúc mở trang', async ({ page }) => {
    const bodies: string[] = [];
    page.on('response', (r) => { if (r.url().endsWith('.js')) void r.text().then((t) => bodies.push(t)).catch(() => undefined); });
    await open(page);
    await page.waitForTimeout(500);
    const MARK = /is not a string, or an element/; // chuỗi lỗi chỉ có trong mã nguồn turndown
    expect(bodies.some((b) => MARK.test(b))).toBe(false);
    await ta(page).focus();
    await expect.poll(() => bodies.some((b) => MARK.test(b)), { timeout: 8000 }).toBe(true);
  });
});

test.describe('studio: slides', () => {
  const DOC = '# One\n\nfirst slide\n\n---\n\n## Two\n\nsecond slide\n\n---\n\n## Three\n\n```\n---\n```\n\nthird slide\n';

  test('chia theo --- (không chia trong khối code), phím chuyển slide, Esc thoát', async ({ page }) => {
    await open(page, DOC);
    await page.getByRole('button', { name: 'present' }).click();
    const dlg = page.getByRole('dialog', { name: 'Slides' });
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('.sl-count')).toHaveText('1 / 3');
    await expect(dlg.locator('h1')).toHaveText('One');
    await page.keyboard.press('ArrowRight');
    await expect(dlg.locator('.sl-count')).toHaveText('2 / 3');
    await page.keyboard.press('Space');
    await expect(dlg.locator('.sl-count')).toHaveText('3 / 3');
    await expect(dlg.locator('pre')).toContainText('---');
    await page.keyboard.press('ArrowRight');
    await expect(dlg.locator('.sl-count')).toHaveText('3 / 3');
    await page.keyboard.press('Home');
    await expect(dlg.locator('.sl-count')).toHaveText('1 / 3');
    await page.keyboard.press('End');
    await expect(dlg.locator('.sl-count')).toHaveText('3 / 3');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab'); // PREV bị tắt ở slide đầu nên bỏ qua: NEXT, GRID, NOTES, PRESENTER, FULLSCREEN, CLOSE
    await expect(dlg.getByRole('button', { name: 'NEXT' })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); // vòng ngược về nút cuối (nút phím tắt ?)
    await expect(dlg.getByRole('button', { name: 'Slide shortcuts' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dlg.getByRole('button', { name: 'CLOSE' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dlg.getByRole('button', { name: 'FULLSCREEN' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'present' })).toBeFocused();
  });

  test('phím của trang không lọt ra sau slide: h, d, f, m không đổi URL, giao diện, zen', async ({ page }) => {
    await open(page, DOC);
    const theme0 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.getByRole('button', { name: 'present' }).click();
    for (const k of ['h', 'a', 'd', 'm', 'r', 'u', '?', '/']) await page.keyboard.press(k);
    await page.keyboard.press('g'); await page.keyboard.press('j');
    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe(URL_);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme0);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-focus'))).toBe(false);
    await expect(page.getByRole('dialog', { name: 'Slides' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
  });

  test('không có --- thì chia theo h1/h2; phím s mở từ ngoài ô soạn', async ({ page }) => {
    await open(page, '# A\n\nx\n\n## B\n\ny\n\n### B1\n\nz\n\n## C\n\nw\n');
    await page.keyboard.press('Escape');
    await page.keyboard.press('s');
    await expect(page.locator('.sl-count')).toHaveText('1 / 3');
    await page.getByRole('button', { name: 'NEXT' }).click();
    await expect(page.locator('.sl-doc h3')).toHaveText('B1');
  });

  test('nhấp nửa phải sang trang sau, nút CLOSE đóng; tài liệu rỗng có thông báo', async ({ page }) => {
    await open(page, DOC);
    await page.getByRole('button', { name: 'present' }).click();
    await page.locator('.sl-stage').click({ position: { x: 800, y: 300 } });
    await expect(page.locator('.sl-count')).toHaveText('2 / 3');
    await page.getByRole('button', { name: 'CLOSE' }).click();
    await expect(page.locator('.sl')).toHaveCount(0);
    await ta(page).fill('');
    await ready(page);
    await page.getByRole('button', { name: 'present' }).click();
    await expect(page.locator('.sl-empty')).toBeVisible();
  });

  test('mobile: thanh nút của slide nằm gọn trong màn hình', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(URL_);
    await expect(ta(page)).toBeVisible();
    await page.getByRole('button', { name: 'File menu', exact: true }).click(); // thanh định dạng ẩn ở điện thoại: Present nằm trong menu File
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const right = await page.locator('.sl-btns button').last().evaluate((b) => b.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('axe sạch ở sáng và tối khi đang trình chiếu', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, DOC);
    await page.getByRole('button', { name: 'present' }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${theme}/${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
    }
  });
});

test.describe('studio: changes and history', () => {
  const BASE = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n';
  // từ 900px nút changes mở tab History của Inspector, nên StudioHistory là region nhúng trong panel Inspector
  const inspector = (p: Page) => p.getByRole('complementary', { name: 'Inspector' });
  const panel = (p: Page) => inspector(p).getByRole('region', { name: 'Changes and history' });
  /** Đặt tài liệu làm mốc "đã lưu": nạp qua ô chọn file như khi mở file thật. */
  const openAs = async (p: Page, text: string) => {
    await p.locator('input[type=file]').setInputFiles({ name: 'doc.md', mimeType: 'text/markdown', buffer: Buffer.from(text) });
    await expect.poll(() => val(p)).toBe(text);
  };

  test('ở chế độ PREVIEW nút changes bị tắt (khôi phục cần ô soạn để undo được)', async ({ page }) => {
    await open(page);
    await viewTab(page, 'Read').click();
    await expect(page.getByRole('button', { name: 'changes', exact: true })).toBeDisabled();
  });

  test('Changes liệt kê từng cụm; REVERT một cụm rồi tính lại; Ctrl+Z hoàn tác', async ({ page }) => {
    await open(page);
    await openAs(page, BASE);
    await ta(page).fill('l1\nX2\nl3\nl4\nl5\nl6\nY7\nl8\nextra\n');
    await ready(page);
    await page.getByRole('button', { name: 'changes', exact: true }).click();
    const p = panel(page);
    await expect(p.locator('.hs-hunk')).toHaveCount(3);
    await expect(p.locator('.hs-b')).toContainText('3 changes since opened or last saved');
    await p.locator('.hs-hunk').first().getByRole('button', { name: 'REVERT' }).click();
    await expect.poll(() => val(page)).toBe('l1\nl2\nl3\nl4\nl5\nl6\nY7\nl8\nextra\n');
    await expect(p.locator('.hs-hunk')).toHaveCount(2); // tính lại từ đầu sau khi hoàn tác
    await p.locator('.hs-hunk').first().getByRole('button', { name: 'REVERT' }).click();
    await expect.poll(() => val(page)).toBe('l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nextra\n');
    await page.keyboard.press('Control+z');
    await expect.poll(() => val(page)).toBe('l1\nl2\nl3\nl4\nl5\nl6\nY7\nl8\nextra\n');
  });

  test('REVERT ALL về bản đã lưu và có bản chụp dự phòng; chưa đổi gì thì báo giống nhau', async ({ page }) => {
    await open(page);
    await openAs(page, BASE);
    await page.getByRole('button', { name: 'changes', exact: true }).click();
    await expect(panel(page).locator('.hs-b')).toContainText('Same as when this page was opened or last saved');
    await ta(page).fill('totally different\n');
    await panel(page).getByRole('button', { name: 'REVERT ALL' }).click();
    await panel(page).getByRole('button', { name: 'CLICK AGAIN TO DISCARD' }).click(); // hai lần bấm thay cho confirm() gốc
    await expect.poll(() => val(page)).toBe(BASE);
    await panel(page).getByRole('button', { name: 'HISTORY' }).click();
    await expect(panel(page).locator('.hs-list')).toContainText('before restore');
  });

  test('History: bản chụp khi mở file, so với văn bản hiện tại, RESTORE là một bước undo, xoá được', async ({ page }) => {
    await open(page);
    await openAs(page, BASE);
    await ta(page).fill('l1\nl2 edited\nl3\n');
    await ready(page);
    await page.getByRole('button', { name: 'changes', exact: true }).click();
    await panel(page).getByRole('button', { name: 'HISTORY' }).click();
    const list = panel(page).locator('.hs-list button');
    await expect(list.first()).toContainText('opened');
    await list.filter({ hasText: 'opened' }).first().click();
    await expect(panel(page).locator('.hs-hunk').first()).toBeVisible();
    await panel(page).getByRole('button', { name: 'RESTORE THIS' }).click();
    await expect.poll(() => val(page)).toBe(BASE);
    await page.keyboard.press('Control+z');
    await expect.poll(() => val(page)).toBe('l1\nl2 edited\nl3\n');
    await ta(page).fill('l1\nl2 edited again\nl3\n');
    await panel(page).getByRole('button', { name: 'SNAPSHOT NOW' }).click();
    await expect(page.locator('.pv-flash')).toContainText('Snapshot taken');
    const n = await list.count();
    await panel(page).getByRole('button', { name: 'DELETE THIS SNAPSHOT' }).click();
    await expect(list).toHaveCount(n - 1);
  });

  test('GO nhảy tới dòng, Esc không đóng (Inspector cố định), đóng Inspector thì History không tồn tại', async ({ page }) => {
    await open(page);
    await openAs(page, BASE);
    await ta(page).fill(BASE.replace('l7', 'Z7'));
    await page.getByRole('button', { name: 'changes', exact: true }).click();
    await panel(page).getByRole('button', { name: 'GO' }).click();
    await expect(page.locator('.pv-mode')).toContainText('Ln 7');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeVisible();
    await inspectorToggle(page).click();
    await expect(inspector(page)).toBeHidden();
    await expect(page.locator('.hs')).toHaveCount(0);
  });

  test('IndexedDB bị chặn: ngăn History báo không dùng được, trang vẫn chạy', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    await open(page);
    await page.getByRole('button', { name: 'changes', exact: true }).click();
    await panel(page).getByRole('button', { name: 'HISTORY' }).click();
    await expect(panel(page)).toContainText('History is unavailable');
    await ta(page).fill('still works\n');
    await ready(page);
  });

  test('axe sạch ở sáng và tối với Inspector History (Changes và History) mở', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await openAs(page, BASE);
    await ta(page).fill('l1\nchanged\nl3\n');
    await ready(page);
    await page.getByRole('button', { name: 'changes', exact: true }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      for (const tab of ['CHANGES', 'HISTORY']) {
        await panel(page).getByRole('button', { name: tab }).click();
        await page.waitForTimeout(300);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.map((v) => `${theme}/${tab}/${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
      }
    }
  });

  test('3000 dòng: ngăn đóng không tốn thêm gì; ngăn mở vẫn không có tác vụ dài khi gõ', async ({ page }) => {
    await open(page);
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i} lorem ipsum dolor sit amet`).join('\n') + '\n';
    await openAs(page, big);
    await ready(page);
    const lt = () => page.evaluate(() => (window as unknown as { __lt: number[] }).__lt.reduce((a, b) => a + b, 0));
    await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(e.duration); }).observe({ entryTypes: ['longtask'] }); });
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(0, 0); });
    await page.keyboard.type('closed ', { delay: 120 });
    await page.waitForTimeout(500);
    const closed = await lt();
    expect(closed).toBeLessThan(600);
    await page.getByRole('button', { name: 'changes', exact: true }).click();
    await expect(panel(page).locator('.hs-hunk')).toHaveCount(1);
    await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; });
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(0, 0); });
    await page.keyboard.type('open now ', { delay: 120 });
    await page.waitForTimeout(800);
    expect(await lt()).toBeLessThan(700);
    await expect(panel(page).locator('.hs-hunk')).toHaveCount(1);
  });
});
