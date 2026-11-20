import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { enterZenWrite, exportMenu, fileMenu, openInspector, seedNotes, viewOptions, viewTab } from './helpers';

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
const caretAt = (p: Page, s: number, e = s) => ta(p).evaluate((t: HTMLTextAreaElement, [a, b]) => { t.focus(); t.setSelectionRange(a!, b!); }, [s, e]);
const selText = (p: Page) => ta(p).evaluate((t: HTMLTextAreaElement) => t.value.slice(t.selectionStart, t.selectionEnd));
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('studio g5: editor', () => {
  test('find nổi trên ô soạn, không đẩy nội dung; Esc đóng và trả focus', async ({ page }) => {
    await open(page, '# T\n\nalpha beta alpha\n');
    const y0 = await page.locator('.ed').evaluate((e) => e.getBoundingClientRect().top);
    await ta(page).focus();
    await page.keyboard.press(`${MOD}+f`);
    const box = page.getByRole('search', { name: 'Find and replace' });
    await expect(box).toBeVisible();
    await expect(box.getByRole('textbox', { name: 'Find' })).toBeFocused();
    expect(await page.locator('.ed').evaluate((e) => e.getBoundingClientRect().top)).toBe(y0);
    await page.keyboard.type('alpha');
    await expect(box.locator('.pv-fcount')).toHaveText('1/2');
    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);
    await expect(ta(page)).toBeFocused();
  });

  test('thao tác dòng: Alt+↑↓ chuyển, Shift+Alt+↓ nhân đôi, ⌘⇧K xoá, ⌘L chọn dòng, ⌘D chọn tiếp; Ctrl+Z hoàn tác', async ({ page }) => {
    await open(page, 'one\ntwo\nthree\n');
    await caretAt(page, 1);
    await page.keyboard.press('Alt+ArrowDown');
    expect(await val(page)).toBe('two\none\nthree\n');
    await page.keyboard.press(`${MOD}+z`);
    expect(await val(page)).toBe('one\ntwo\nthree\n');
    await caretAt(page, 5);
    await page.keyboard.press('Shift+Alt+ArrowDown');
    expect(await val(page)).toBe('one\ntwo\ntwo\nthree\n');
    await page.keyboard.press(`${MOD}+Shift+k`);
    expect(await val(page)).toBe('one\ntwo\nthree\n');
    await caretAt(page, 1);
    await page.keyboard.press(`${MOD}+l`);
    expect(await selText(page)).toBe('one\n');
    await ta(page).fill('cat dog cat\n');
    await caretAt(page, 1);
    await page.keyboard.press(`${MOD}+d`);
    expect(await selText(page)).toBe('cat');
    await page.keyboard.press(`${MOD}+d`);
    expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.selectionStart)).toBe(8);
  });

  test('Enter trong bảng thêm hàng; Enter ở hàng trống cuối thì ra khỏi bảng', async ({ page }) => {
    await open(page, '| a | b |\n| --- | --- |\n| 1 | 2 |');
    await caretAt(page, (await val(page)).length);
    await page.keyboard.press('Enter');
    expect((await val(page)).split('\n')).toHaveLength(4);
    await page.keyboard.press('Enter');
    const v = await val(page);
    expect(v.split('\n').filter((l) => l.startsWith('|'))).toHaveLength(3);
    expect(v.endsWith('\n\n')).toBe(true);
  });

  test('Ctrl/⌘+click lên [x](#heading) nhảy tới heading', async ({ page, browserName }) => {
    const CLICK_MOD = browserName === 'webkit' ? 'Meta' : MOD; // WebKit coi Ctrl+click là chuột phải (như Mac): người dùng Safari bấm ⌘+click
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch { /* bỏ qua */ } }); // toạ độ chuột tính theo lề 16px của chế độ không ngắt dòng
    const md = '# Top\n\nGo [down](#target)\n\n' + 'filler\n\n'.repeat(60) + '## Target\n\nend\n';
    await open(page, md);
    await expect(page.locator('.pv-page .md-doc h2#target')).toBeAttached(); // bản xem đã dựng (WebKit chậm hơn)
    const i = md.indexOf('down');
    await caretAt(page, i);
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.scrollTop = 0; t.scrollLeft = 0; });
    // click có phím mod lên chữ "down" ở dòng 3
    const pt = await ta(page).evaluate((t: HTMLTextAreaElement) => { const r = t.getBoundingClientRect(); return { x: r.left + 16 + 6 * 8.4, y: r.top + 16 + 2 * 23 + 10 }; });
    await page.mouse.move(pt.x, pt.y);
    await page.keyboard.down(CLICK_MOD);
    await page.mouse.down(); await page.mouse.up();
    await page.keyboard.up(CLICK_MOD);
    await expect.poll(() => ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(0, t.selectionStart).split('\n').length)).toBe(md.split('\n').indexOf('## Target') + 1);
  });

  test('lint: dấu ở lề số dòng có chú thích, gạch dưới dòng; tab Checks liệt kê cùng các lỗi', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch {} });
    await open(page, '# A\n\nok line\n\n### Jump\n\n# B\n');
    await expect(page.locator('.ed-gutwin .gw')).toHaveCount(2);
    await expect(page.locator('.ed-gutwin .gw').first()).toHaveAttribute('title', /Heading level jumps/);
    await expect(page.locator('.ed-lint')).toHaveCount(2);
    const insp = await openInspector(page, 'Checks');
    await expect(insp.locator('.pv-insp-issue')).toHaveCount(2);
    await expect(insp.locator('.pv-insp-issue').nth(1)).toContainText('Multiple top-level headings');
  });

  test('lint (dưới 900px): nút trạng thái mở tab Checks trong pane Inspector', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto(URL_);
    await ta(page).fill('# A\n\nok line\n\n### Jump\n\n# B\n');
    await ready(page);
    await expect(page.locator('.pv-lint')).toHaveCount(0);
    await page.locator('.pv-chk').click();
    await expect(page.locator('.pv-insp-issue').first()).toBeVisible();
    await expect(page.locator('.pv-insp-issue')).toHaveCount(2);
  });

  test('menu /: mở ở đầu dòng, lọc, Enter chèn bảng; Esc chỉ đóng menu; /etc/ với dấu cách thì không mở', async ({ page }) => {
    await open(page, '# T\n\n');
    await caretAt(page, (await val(page)).length);
    await page.keyboard.type('/');
    const menu = page.getByRole('listbox', { name: 'Insert block' });
    await expect(menu).toBeVisible();
    await page.keyboard.type('tab');
    await expect(menu.getByRole('option').first()).toHaveText(/Table/);
    await page.keyboard.press('Enter');
    await expect(menu).toHaveCount(0);
    expect(await val(page)).toContain('| Column 1 | Column 2 |');
    await page.keyboard.press('End');
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.press('Enter'); // bảng: thêm hàng
    await ta(page).fill('# T\n\n');
    await caretAt(page, 5);
    await page.keyboard.type('/no');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(ta(page)).toBeFocused();
    await page.keyboard.type(' x');
    await expect(menu).toHaveCount(0);
    await ta(page).fill('');
    await page.keyboard.type('/etc/hosts is a file');
    await expect(menu).toHaveCount(0);
  });

  test('menu / trong zen: Esc đóng menu, không thoát zen', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true })); } catch { /* bỏ qua */ } });
    await open(page, '# T\n\npara\n\n');
    await viewTab(page, 'Zen').click();
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
    await enterZenWrite(page);
    await caretAt(page, (await val(page)).length);
    await page.keyboard.type('/qu');
    const menu = page.getByRole('listbox', { name: 'Insert block' });
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
  });

  test('find trong zen: hiện, tìm được, Esc chỉ đóng hộp tìm', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true })); } catch { /* bỏ qua */ } });
    await open(page, '# T\n\nneedle one\n\nneedle two\n');
    await viewTab(page, 'Zen').click();
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
    await enterZenWrite(page);
    await ta(page).focus();
    await page.keyboard.press(`${MOD}+f`);
    const box = page.getByRole('search', { name: 'Find and replace' });
    await expect(box).toBeVisible();
    await expect(box.getByRole('textbox', { name: 'Find' })).toBeFocused();
    await page.keyboard.type('needle');
    await expect(box.locator('.pv-fcount')).toHaveText('1/2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
  });

  test('dán ảnh: lưu trong trình duyệt, chèn asset:, bản xem dùng blob URL, HTML xuất ra nhúng data URI', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit bỏ clipboardData của ClipboardEvent tạo bằng script; dán thật vẫn chạy');
    await open(page, '# Pics\n\n');
    await caretAt(page, (await val(page)).length);
    const prevented = await ta(page).evaluate(async (t: HTMLTextAreaElement) => {
      // PNG 1x1
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'raft-diagram.png', { type: 'image/png' }));
      dt.setData('text/html', '<img src="x">');
      const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      t.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect.poll(() => val(page)).toMatch(/!\[raft diagram\]\(asset:[a-z0-9]+\.png\)/);
    await ready(page);
    await expect(page.locator('.md-doc img')).toHaveAttribute('src', /^blob:/);
    await exportMenu(page).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTML (.html)' }).click()]);
    const body = await (await import('node:fs/promises')).readFile((await dl.path())!, 'utf8');
    expect(body).toContain('src="data:image/png;base64,');
    expect(body).not.toContain('blob:');
    // tải lại trang: ảnh vẫn hiện (IndexedDB)
    await page.reload();
    await ready(page);
    await expect(page.locator('.md-doc img')).toHaveAttribute('src', /^blob:/);
  });

  test('outline: Alt+↓ trên một mục chuyển cả mục xuống, focus ở lại mục đó', async ({ page }) => {
    await open(page, '# T\n\n## A\n\na\n\n## B\n\nb\n');
    await openInspector(page, 'Outline');
    const a = page.locator('.pv-insp .pv-ol', { hasText: /^└ A$/ });
    await expect(page.locator('.pv-insp .pv-ol', { hasText: /^└ B$/ })).toBeVisible(); // outline đã là của tài liệu mới
    await a.focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(() => val(page)).toBe('# T\n\n## B\n\nb\n\n## A\n\na\n');
    await expect(page.locator('.pv-insp .pv-ol', { hasText: /^└ A$/ })).toBeFocused();
    await page.keyboard.press(`${MOD}+z`); // commit() đi qua undo gốc (focus đã ở outline: hoàn tác từ ô soạn)
  });

  test('outline: kéo mục C lên trước A', async ({ page }) => {
    await open(page, '# T\n\n## A\n\na\n\n## B\n\nb\n\n## C\n\nc\n');
    await openInspector(page, 'Outline');
    await expect(page.locator('.pv-insp .pv-ol', { hasText: /^└ C$/ })).toBeVisible();
    await page.locator('.pv-insp .pv-ol', { hasText: /^└ C$/ }).dragTo(page.locator('.pv-insp .pv-ol', { hasText: /^└ A$/ }));
    await expect.poll(() => val(page)).toBe('# T\n\n## C\n\nc\n\n## A\n\na\n\n## B\n\nb\n');
  });

  test('style: default > paper > compact, áp vào bản xem và nhớ khi tải lại', async ({ page }) => {
    await open(page, '# T\n\ntext\n');
    const pick = async (name: string) => { await viewOptions(page).click(); await page.getByRole('button', { name: new RegExp('^' + name) }).click(); };
    await pick('Paper');
    await expect(page.locator('.pv-page .md-doc')).toHaveAttribute('data-doc', 'paper');
    await viewOptions(page).click();
    await expect(page.getByRole('button', { name: /^Paper/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Compact/ }).click();
    await expect(page.locator('.pv-page .md-doc')).toHaveAttribute('data-doc', 'compact');
    await page.reload();
    await expect(page.locator('.pv-page .md-doc')).toHaveAttribute('data-doc', 'compact');
  });

  test('chế độ chỉ xem: nhấp đúp một đoạn mở ô soạn ở đúng dòng', async ({ page }) => {
    await open(page, '# T\n\n' + 'para\n\n'.repeat(30) + 'the target\n');
    await viewTab(page, 'Read').click();
    await page.locator('.md-doc p', { hasText: 'the target' }).dblclick();
    await expect(ta(page)).toBeVisible();
    await expect.poll(() => ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(0, t.selectionStart).split('\n').length)).toBe(63);
  });
});

test.describe('studio g5: slides', () => {
  const DOC = '# One\n\nfirst\n\nNote: say hello first\n\n---\n\n## Two\n\nsecond\n\n---\n\n## Three\n\nthird\n';

  test('ghi chú không hiện trên slide, n mở ngăn ghi chú; Alt+P mở từ slide đang soạn', async ({ page }) => {
    await open(page, DOC);
    await caretAt(page, DOC.indexOf('second'));
    await page.keyboard.press('Alt+p');
    const dlg = page.getByRole('dialog', { name: 'Slides' });
    await expect(dlg.locator('.sl-count')).toHaveText('2 / 3');
    await page.keyboard.press('Home');
    await expect(dlg.locator('.sl-doc')).not.toContainText('say hello');
    await page.keyboard.press('n');
    await expect(dlg.getByRole('region', { name: 'Speaker notes' })).toContainText('say hello first');
    await expect(dlg.getByRole('region', { name: 'Speaker notes' })).not.toContainText('Note:');
  });

  test('lưới (g), gõ số rồi Enter, màn trống (b), đồng hồ', async ({ page }) => {
    await open(page, DOC);
    await page.getByRole('button', { name: 'present' }).click();
    const dlg = page.getByRole('dialog', { name: 'Slides' });
    await page.keyboard.press('g');
    await expect(dlg.getByRole('option')).toHaveCount(3);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(dlg.locator('.sl-count')).toHaveText('3 / 3');
    await page.keyboard.press('2');
    await expect(dlg.locator('.sl-count')).toHaveText('go to 2');
    await page.keyboard.press('Enter');
    await expect(dlg.locator('.sl-count')).toHaveText('2 / 3');
    await page.keyboard.press('b');
    await expect(dlg.locator('.sl-blank')).toBeVisible();
    await page.keyboard.press('Escape'); // Esc đầu tiên chỉ bỏ màn trống
    await expect(dlg.locator('.sl-doc')).toBeVisible();
    await expect(dlg.locator('.sl-time')).toHaveText(/^00:0\d$/);
  });

  for (const [w, h] of [[1000, 800], [1280, 720], [1920, 1080], [390, 844]] as const) {
    test(`chuyển slide không nhấp nháy, chữ đủ lớn (bài mẫu, ${w}×${h})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(URL_);
      await expect(ta(page)).toBeVisible();
      page.once('dialog', (d) => void d.accept());
      await fileMenu(page).click();
      await page.getByRole('button', { name: 'Sample' }).click();
      await expect(page.locator('.pv-page .md-doc h1')).toHaveText('Better meetings');
      await ready(page);
      // sơ đồ Mermaid dựng sau (nội dung đổi thật, slide fit lại một lần): chờ xong rồi mới đo
      // sơ đồ chỉ dựng khi cuộn tới (màn hẹp thì bản xem còn ẩn); mở slide là dựng đủ: mở một lần, chờ xong, đóng, rồi mới đo
      await page.keyboard.press('Escape');
      await page.keyboard.press('s');
      await expect(page.getByRole('dialog', { name: 'Slides' })).toBeVisible();
      await expect.poll(() => page.locator('.pv-page .md-doc figure.mermaid svg').count(), { timeout: 15_000 }).toBeGreaterThan(0);
      await expect.poll(() => page.locator('.pv-page .md-doc [data-mermaid]').count(), { timeout: 15_000 }).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Slides' })).toHaveCount(0);
      await page.keyboard.press('s');
      for (let k = 0; k < 3; k++) {
        // khung hình đầu tiên: MutationObserver chạy sau khi DOM và layout effect xong, trước khi vẽ
        await page.evaluate(() => {
          const w = window as unknown as { __first?: string };
          w.__first = '';
          const mo = new MutationObserver(() => {
            const cv = document.querySelector<HTMLElement>('.sl-stage .sv-canvas');
            if (cv && !w.__first) { w.__first = `${cv.style.transform}|${cv.style.width}`; mo.disconnect(); }
          });
          mo.observe(document.querySelector('.sl-stage')!, { childList: true, subtree: true });
        });
        await page.keyboard.press('ArrowRight');
        // lấy mẫu mỗi khung hình trong 1,5 giây: kích thước, transform, zoom của slide không được đổi sau khung đầu
        const frames = await page.evaluate(() => new Promise<string[]>((res) => {
          const out: string[] = [];
          const t0 = performance.now();
          const tick = () => {
            const d = document.querySelector<HTMLElement>('.sl-doc'), s = document.querySelector<HTMLElement>('.sl-stage');
            if (d && s) {
              const cs = getComputedStyle(d), r = d.getBoundingClientRect();
              out.push([cs.zoom, cs.transform, cs.fontSize, Math.round(r.width), Math.round(r.height), s.clientWidth, s.clientHeight, s.scrollHeight].join('|'));
            }
            if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(out);
          };
          requestAnimationFrame(tick);
        }));
        const settled = frames.slice(3);
        expect(new Set(settled).size, `slide ${k + 2}: ${[...new Set(settled)].join(' / ')}`).toBe(1);
        const first = await page.evaluate(() => (window as unknown as { __first?: string }).__first ?? '');
        const now = await page.evaluate(() => { const cv = document.querySelector<HTMLElement>('.sl-stage .sv-canvas')!; return `${cv.style.transform}|${cv.style.width}`; });
        expect(first, `slide ${k + 2}: khung hình đầu`).toBe(now);
        expect(now).toMatch(/^translate\(-50%, -50%\) scale\([\d.]+\)\|\d+px$/);
        if (w < 600) expect(now.endsWith('|720px')).toBe(true); // điện thoại dọc: khung dọc ngay từ khung hình đầu
      }
      // chữ thân bài trên màn hình (cao hộp chữ của một từ) không nhỏ
      const px = await page.evaluate(() => {
        const p = document.querySelector('.sl-doc p, .sl-doc li');
        const node = p && document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
        if (!node) return 0;
        const rg = document.createRange(); rg.setStart(node, 0); rg.setEnd(node, Math.min(3, node.textContent!.length));
        return rg.getBoundingClientRect().height;
      });
      expect(px).toBeGreaterThanOrEqual(w < 600 ? 14 : 22);
    });
  }

  test('cửa sổ presenter: thấy slide kế và ghi chú, NEXT ở presenter chuyển màn chiếu', async ({ page, context }) => {
    await open(page, DOC);
    await page.getByRole('button', { name: 'present' }).click();
    const [pop] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'PRESENTER' }).click()]);
    await pop.waitForLoadState();
    await expect(pop.locator('.pr-count')).toHaveText('1 / 3');
    await expect(pop.getByRole('region', { name: 'Speaker notes' })).toContainText('say hello first');
    await expect(pop.getByRole('region', { name: 'Next slide' })).toContainText('Two');
    await pop.getByRole('button', { name: 'NEXT' }).click();
    await expect(page.locator('.sl-count')).toHaveText('2 / 3');
    await expect(pop.locator('.pr-count')).toHaveText('2 / 3');
    await page.keyboard.press('Escape');
    await expect(pop.locator('.pr-wait')).toContainText('Slides closed');
  });

  test('slide dài: cuộn ở presenter và màn chiếu đồng bộ hai chiều, hết đáy mới sang slide sau', async ({ page, context }) => {
    await open(page, '# Long\n\n' + Array.from({ length: 60 }, (_, i) => `- item ${i}`).join('\n') + '\n\n---\n\n# End\n');
    await page.getByRole('button', { name: 'present' }).click();
    const [pop] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'PRESENTER' }).click()]);
    await pop.waitForLoadState();
    await expect(pop.locator('.pr-count')).toHaveText('1 / 2');
    const main = page.locator('.sl-slide .sv-canvas[data-overflow="1"]');
    const side = pop.locator('.pr-cur .sv-canvas[data-overflow="1"]');
    const frac = (l: typeof main) => l.evaluate((e) => e.scrollTop / (e.scrollHeight - e.clientHeight));
    await expect(side).toHaveCount(1);
    await pop.evaluate(() => document.fonts.ready); // fit chạy lại khi font nạp xong và đưa cuộn về đầu
    await pop.keyboard.press('ArrowDown'); // presenter cuộn → màn chiếu theo
    await page.waitForTimeout(500); // màn chiếu ở thẻ nền: để kênh giao tin xong
    await expect.poll(() => frac(main)).toBeGreaterThan(0.1);
    await expect.poll(async () => Math.abs((await frac(main)) - (await frac(side)))).toBeLessThan(0.03);
    await page.keyboard.press('ArrowDown'); // màn chiếu cuộn → presenter theo
    await expect.poll(async () => Math.abs((await frac(main)) - (await frac(side)))).toBeLessThan(0.03);
    await expect(pop.locator('.pr-count')).toHaveText('1 / 2');
    await expect.poll(async () => { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(250); return page.locator('.sl-count').textContent(); }).toBe('2 / 2'); // cuộn mượt: bấm tới khi chạm đáy rồi mới sang slide
    await expect(pop.locator('.pr-count')).toHaveText('2 / 2');
  });

  test('slide dài: cắt theo dòng (không nửa dòng chữ ở mép), mũi tên "còn nữa" chỉ khi bên dưới còn nội dung', async ({ page }) => {
    await open(page, '# Long\n\n' + Array.from({ length: 60 }, (_, i) => `- item ${i}`).join('\n') + '\n');
    await page.getByRole('button', { name: 'present' }).click();
    const cv = page.locator('.sl-slide .sv-canvas[data-overflow="1"]');
    const more = page.locator('.sl-slide .sv-more');
    await expect(cv).toHaveCount(1);
    const cut = () => cv.evaluate((e) => Number((e as HTMLElement).dataset['cut']));
    const H = await cv.evaluate((e) => e.clientHeight);
    // số dòng chữ vắt qua mép cắt dưới (phải là 0): nửa dòng chữ ở mép là thứ ta không muốn thấy
    const straddle = () => cv.evaluate((e) => {
      const c = Number((e as HTMLElement).dataset['cut']), cr = e.getBoundingClientRect(), s = cr.height / e.clientHeight, rg = document.createRange();
      const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let bad = 0;
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.nodeValue?.trim()) continue;
        rg.selectNodeContents(n);
        for (const r of Array.from(rg.getClientRects())) { const t = (r.top - cr.top) / s, b = (r.bottom - cr.top) / s; if (t < c - 1 && b > c + 1) bad++; }
      }
      return bad;
    });
    await expect(more).toHaveAttribute('data-on', '1'); // đầu slide: còn nội dung bên dưới
    expect(await cut()).toBeLessThanOrEqual(H - 29); // chừa dải cho mũi tên
    expect(await straddle()).toBe(0);
    await cv.evaluate((e) => { e.style.scrollBehavior = 'auto'; e.scrollTop = 400; });
    await expect.poll(straddle).toBe(0); // giữa slide: vẫn không có nửa dòng
    await expect(more).toHaveAttribute('data-on', '1');
    await cv.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect(more).toHaveAttribute('data-on', ''); // đáy: hết mũi tên, không còn dải chừa, dòng cuối rõ nét
    await expect.poll(cut).toBe(H);
  });

  test('presenter không tràn nhưng màn chiếu tràn: phím ↓ ở presenter cuộn màn chiếu trước khi sang slide sau', async ({ page, context }) => {
    await open(page, '# Long\n\n' + Array.from({ length: 60 }, (_, i) => `- item ${i}`).join('\n') + '\n\n---\n\n# End\n');
    await page.getByRole('button', { name: 'present' }).click();
    const [pop] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'PRESENTER' }).click()]);
    await pop.waitForLoadState();
    await expect(pop.locator('.pr-count')).toHaveText('1 / 2');
    await pop.evaluate(() => document.fonts.ready);
    const main = page.locator('.sl-slide .sv-canvas[data-overflow="1"]');
    await expect(main).toHaveCount(1);
    // mô phỏng presenter vừa khung (khung logic khác hướng): gỡ cờ tràn để phím ↓ không cuộn tại chỗ mà gửi lệnh sang màn chiếu
    await pop.locator('.pr-cur .sv-canvas').evaluate((e) => e.removeAttribute('data-overflow'));
    await pop.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    await expect(pop.locator('.pr-count')).toHaveText('1 / 2'); // màn chiếu cuộn thay vì sang slide sau
    await expect.poll(() => main.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    await expect.poll(async () => { await pop.keyboard.press('ArrowDown'); await page.waitForTimeout(250); return pop.locator('.pr-count').textContent(); }).toBe('2 / 2');
  });

  test('slides: bảng phím tắt (nút và phím ?), Esc đóng bảng trước, thanh dưới tự ẩn khi đứng yên', async ({ page }) => {
    await open(page, '# One\n\nhello\n\n---\n\n# Two\n');
    await page.getByRole('button', { name: 'present' }).click();
    const dlg = page.getByRole('dialog', { name: 'Slide shortcuts' });
    await page.getByRole('button', { name: 'Slide shortcuts' }).click();
    await expect(dlg).toContainText('Reveal bullets');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('.sl')).toBeVisible(); // chỉ đóng bảng, slide vẫn mở
    await page.keyboard.press('?');
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.move(300, 300);
    await expect.poll(() => page.locator('.sl-foot').evaluate((e) => getComputedStyle(e).opacity), { timeout: 6000 }).toBe('0'); // đứng yên 2 giây
    await page.mouse.move(320, 320);
    await expect.poll(() => page.locator('.sl-foot').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  });

  test('slides: vạch vị trí cuộn của slide dài; hiện từng bullet (i): tiến, lùi, lùi sang slide trước thì hiện đủ', async ({ page }) => {
    await open(page, '# Long\n\n' + Array.from({ length: 60 }, (_, k) => `- item ${k}`).join('\n') + '\n\n---\n\n# Steps\n\n- a\n- b\n- c\n\n---\n\n# End\n');
    await page.getByRole('button', { name: 'present' }).click();
    await expect(page.locator('.sl-slide .sv-pos[data-on="1"]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight'); // slide 1 → 2 (reveal chưa bật)
    await expect(page.locator('.sl-count')).toHaveText('2 / 3');
    await page.keyboard.press('i'); // bật reveal: slide hiện tại ẩn hết bullet
    const hid = page.locator('.sl-slide .sl-hid');
    await expect(hid).toHaveCount(3);
    await page.keyboard.press('ArrowRight'); await expect(hid).toHaveCount(2);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await expect(hid).toHaveCount(0);
    await expect(page.locator('.sl-count')).toHaveText('2 / 3'); // chưa sang slide sau
    await page.keyboard.press('ArrowLeft'); await expect(hid).toHaveCount(1); // lùi: bớt một bullet
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await expect(page.locator('.sl-count')).toHaveText('3 / 3'); // hết bullet mới sang slide sau
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.sl-count')).toHaveText('2 / 3');
    await expect(hid).toHaveCount(0); // về slide trước thì hiện đủ
    await page.keyboard.press('i');
    await expect(hid).toHaveCount(0);
  });

  test('slides: slide dày chữ (hai đoạn dài + 6 bullet) vẫn vừa khung nhờ thu vừa đủ, không phải cuộn', async ({ page }) => {
    const para = 'Leave it off when the nudge would be noise, or worse, when it would override something the user already told you. Silence is the right default; only add the nudge when there is something concrete worth reflecting on and the user has not already signaled they have verification covered.';
    const item = (t: string) => `- **${t}** - small talk, opinions, banter where nothing rides on the answer, and the user is not going to act on it in any way at all.`;
    await open(page, `# When not to\n\n${para}\n\n${para}\n\n${['Creative', 'Casual', 'Lookups', 'Educational', 'Code', 'Skips'].map(item).join('\n')}\n`);
    await page.getByRole('button', { name: 'present' }).click();
    await expect(page.locator('.sl-slide .sv-canvas')).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator('.sl-slide .sv-canvas').evaluate((e) => e.dataset['overflow'] ?? '')).toBe('');
    const f = await page.locator('.sl-slide .sl-doc').evaluate((e) => parseFloat((e as HTMLElement).style.transform.replace(/[^0-9.]/g, '')) || 1);
    expect(f).toBeGreaterThanOrEqual(0.55); // không thu quá sàn
    expect(f).toBeLessThan(1);
  });

  test('slides: laser (l) chặn click chuyển slide; click bảng phóng to, Esc đóng phóng to trước', async ({ page }) => {
    await open(page, '# One\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\n# Two\n');
    await page.getByRole('button', { name: 'present' }).click();
    await page.keyboard.press('l');
    await expect(page.locator('.sl[data-laser]')).toHaveCount(1);
    await page.mouse.move(200, 400);
    await page.locator('.sl-stage').click({ position: { x: 700, y: 600 } });
    await expect(page.locator('.sl-count')).toHaveText('1 / 2'); // laser bật: click không chuyển slide
    await page.keyboard.press('l');
    await expect(page.locator('.sl[data-laser]')).toHaveCount(0);
    await page.locator('.sl-slide table').click();
    const z = page.getByRole('dialog', { name: 'Zoomed figure' });
    await expect(z.locator('table')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(z).toHaveCount(0);
    await expect(page.locator('.sl')).toBeVisible();
    await expect(page.locator('.sl-count')).toHaveText('1 / 2');
  });

  test('presenter: đếm ngược theo thời lượng dự kiến và đổi cỡ chữ ghi chú', async ({ page, context }) => {
    await open(page, '# One\n\nNote: remember this\n\n---\n\n# Two\n');
    await page.getByRole('button', { name: 'present' }).click();
    const [pop] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'PRESENTER' }).click()]);
    await pop.waitForLoadState();
    await expect(pop.locator('.pr-count')).toHaveText('1 / 2');
    await pop.getByLabel('Goal (min)').fill('20');
    await expect(pop.locator('.pr-left')).toContainText('left');
    const fs = () => pop.locator('.pr-notes .md-doc').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    const before = await fs();
    await pop.getByRole('button', { name: 'Larger notes' }).click();
    await expect.poll(fs).toBeGreaterThan(before);
  });

  test('zen: Alt+P trình chiếu, Esc chỉ đóng slide và vẫn ở zen; menu ⋯ có Present', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true })); } catch { /* bỏ qua */ } });
    await open(page, DOC);
    await viewTab(page, 'Zen').click();
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
    await caretAt(page, DOC.indexOf('third'));
    await page.keyboard.press('Alt+p');
    await expect(page.locator('.sl-count')).toHaveText('3 / 3');
    await page.keyboard.press('Escape');
    await expect(page.locator('.sl')).toHaveCount(0);
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
    await page.mouse.move(400, 400);
    await page.locator('.zc-more').click();
    await page.getByRole('group', { name: 'Present' }).getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.sl-count')).toHaveText('1 / 3');
  });
});

test.describe('studio g5: a11y và cửa sổ presenter', () => {
  const DOC = '# One\n\nfirst\n\nNote: say hello\n\n---\n\n## Two\n\nsecond\n';

  test('axe sạch: lưới slide, ngăn ghi chú, menu /, cửa sổ presenter (sáng và tối)', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, DOC);
    const scan = async (p: Page, what: string) => {
      for (const theme of ['light', 'dark']) {
        await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        const r = await new AxeBuilder({ page: p }).analyze();
        expect(r.violations.map((v) => `${what}/${theme}/${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
      }
    };
    await caretAt(page, (await val(page)).length);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
    await scan(page, 'slash');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'present' }).click();
    await page.keyboard.press('g');
    await scan(page, 'grid');
    await page.keyboard.press('g');
    await page.keyboard.press('n');
    await scan(page, 'notes');
    const [pop] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('p')]);
    await pop.emulateMedia({ reducedMotion: 'reduce' });
    await pop.waitForLoadState();
    await expect(pop.locator('.pr-count')).toHaveText('1 / 2');
    await scan(pop, 'presenter');
  });

  test('cửa sổ presenter không nhận phím tắt của trang', async ({ page, context }) => {
    await open(page, DOC);
    await page.getByRole('button', { name: 'present' }).click();
    const [pop] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'PRESENTER' }).click()]);
    await pop.waitForLoadState();
    await expect(pop.locator('.pr-count')).toHaveText('1 / 2');
    for (const k of ['h', 'm', 'p', 't', 'n', 'a', '/', '?', 'f']) await pop.keyboard.press(k);
    await pop.keyboard.press('g'); await pop.keyboard.press('j');
    await pop.waitForTimeout(600);
    expect(new URL(pop.url()).pathname).toBe('/app/presenter/');
    await expect(pop.getByRole('dialog')).toHaveCount(0);
    await pop.keyboard.press('ArrowRight');
    await expect(page.locator('.sl-count')).toHaveText('2 / 2');
  });

  test('tài liệu chia theo heading: đoạn "Note: …" vẫn hiện trên slide', async ({ page }) => {
    await open(page, '# A\n\nNote: this is real content\n\n## B\n\nx\n');
    await page.getByRole('button', { name: 'present' }).click();
    await expect(page.locator('.sl-doc')).toContainText('this is real content');
  });
});

test.describe('studio g6: images, bảng, outline zen, slide PDF', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const pasteImg = (p: Page, name: string, b64 = PNG) => ta(p).evaluate((t: HTMLTextAreaElement, [n, d]) => {
    t.focus();
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(d!), (c) => c.charCodeAt(0))], n!, { type: 'image/png' }));
    t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [name, b64]);

  test('Images: liệt kê, phân biệt đang dùng và không dùng, xoá ảnh không dùng có xác nhận', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit bỏ clipboardData của ClipboardEvent tạo bằng script');
    await open(page, '# Pics\n\n');
    await caretAt(page, (await val(page)).length);
    await pasteImg(page, 'keep.png');
    await expect.poll(() => val(page)).toContain('](asset:');
    // ảnh thứ hai khác nội dung, rồi bỏ khỏi văn bản: thành "unused"
    await caretAt(page, (await val(page)).length);
    await pasteImg(page, 'drop.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    await expect.poll(async () => ((await val(page)).match(/asset:/g) ?? []).length).toBe(2);
    await ta(page).fill((await val(page)).replace(/\n!\[drop\]\(asset:[^)]+\)/, ''));
    await fileMenu(page).click();
    await page.getByRole('button', { name: /^Images/ }).click();
    const panel = page.getByRole('dialog', { name: 'Images' });
    await expect(panel.locator('.as-row')).toHaveCount(2);
    await expect(panel.locator('.as-row', { hasText: 'keep.png' })).toContainText('in document');
    await expect(panel.locator('.as-row', { hasText: 'drop.png' })).toContainText('unused');
    page.once('dialog', (d) => void d.accept());
    await panel.getByRole('button', { name: /REMOVE 1 UNUSED/ }).click();
    await expect(panel.locator('.as-row')).toHaveCount(1);
    await expect(panel.locator('.as-row')).toContainText('keep.png');
  });

  test('thanh bảng: hiện khi con trỏ trong bảng, thêm cột, sắp xếp, căn; không lấy focus khỏi ô soạn', async ({ page }) => {
    await open(page, '# T\n\n| Name | Qty |\n| --- | --- |\n| b | 10 |\n| a | 2 |\n');
    const bar = page.getByRole('toolbar', { name: 'Table' });
    await expect(bar).toHaveCount(0);
    await caretAt(page, (await val(page)).indexOf('Qty') + 1);
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'A-Z' }).click();
    expect((await val(page)).split('\n').slice(4).map((l) => l.split('|')[2]?.trim())).toEqual(['2', '10', undefined]);
    await bar.getByRole('button', { name: 'right', exact: true }).click();
    await expect(bar.getByRole('button', { name: 'right', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await bar.getByRole('button', { name: '+ right' }).click();
    expect((await val(page)).split('\n')[2]).toContain('| Column |');
    await expect(ta(page)).toBeFocused();
    await page.keyboard.press(`${MOD}+z`);
    expect((await val(page)).split('\n')[2]).not.toContain('Column');
  });

  test('zen: kéo mục trong outline (rail giữ mở khi kéo)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true, pin: true })); } catch { /* bỏ qua */ } });
    await open(page, '# T\n\n## A\n\na\n\n## B\n\nb\n\n## C\n\nc\n');
    await viewTab(page, 'Zen').click();
    await enterZenWrite(page); // kéo mục chỉ có ở mặt Write
    const rail = page.locator('.zc-rail .zc-ol');
    await expect(rail.getByRole('button', { name: 'C', exact: true })).toBeVisible();
    await rail.getByRole('button', { name: 'C', exact: true }).dragTo(rail.getByRole('button', { name: 'A', exact: true }));
    await expect.poll(() => val(page)).toBe('# T\n\n## C\n\nc\n\n## A\n\na\n\n## B\n\nb\n');
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
  });

  test('slide nhận kiểu tài liệu; EXPORT → Slides PDF in mỗi slide một trang 16:9', async ({ page, browserName }) => {
    await open(page, '# One\n\nfirst\n\n---\n\n## Two\n\nsecond\n\n---\n\n## Three\n\nthird\n');
    await viewOptions(page).click();
    await page.getByRole('button', { name: /^Paper/ }).click();
    await page.getByRole('button', { name: 'present' }).click();
    await expect(page.locator('.sl-doc')).toHaveAttribute('data-doc', 'paper');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { (window as unknown as { print: () => void }).print = () => { document.documentElement.dataset['printed'] = '1'; }; });
    await exportMenu(page).click();
    await page.getByRole('button', { name: /^Slides PDF/ }).click();
    await expect(page.locator('html[data-printed]')).toHaveCount(1);
    await expect(page.locator('.slp .slp-page')).toHaveCount(3);
    if (browserName !== 'chromium') return; // page.pdf() chỉ có ở Chromium
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBe(3);
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox\s*\[\s*0 0 960 540\s*\]/);
  });

  test('PDF trong Present in được slide; in PDF xong tiêu đề tab trở lại như cũ (kể cả bấm hai lần liên tiếp)', async ({ page }) => {
    await open(page, '# One\n\nfirst\n\n---\n\n## Two\n\nsecond\n');
    await page.evaluate(() => { (window as unknown as { print: () => void }).print = () => { document.documentElement.dataset['printed'] = String(Number(document.documentElement.dataset['printed'] ?? 0) + 1); }; });
    await page.getByRole('button', { name: 'present' }).click();
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await expect(page.locator('html[data-printed]')).toHaveCount(1);
    await expect(page.locator('.sl')).toHaveCount(1); // Present vẫn sống
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.keyboard.press('Escape');
    for (let i = 0; i < 2; i++) { await exportMenu(page).click(); await page.getByRole('button', { name: /^PDF \(print\)/ }).click(); }
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect.poll(() => page.title()).toBe('one.md · mdprev');
  });

  test('axe: menu VIEW, thanh bảng, ngăn Images', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '# T\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    const scan = async (what: string) => {
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.map((v) => `${what}/${theme}/${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
      }
    };
    await caretAt(page, (await val(page)).indexOf('| 1') + 2);
    await expect(page.getByRole('toolbar', { name: 'Table' })).toBeVisible();
    await scan('table');
    await viewOptions(page).click();
    await scan('view');
    await page.keyboard.press('Escape');
    await fileMenu(page).click();
    await page.getByRole('button', { name: /^Images/ }).click();
    await expect(page.getByRole('dialog', { name: 'Images' })).toBeVisible();
    await scan('images');
  });
});

test('zen: outline không ghim (chỉ mở khi rê), kéo mục vẫn giữ rail mở tới lúc thả', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true, pin: false })); } catch { /* bỏ qua */ } });
  await open(page, '# T\n\n## A\n\na\n\n## B\n\nb\n\n## C\n\nc\n');
  await viewTab(page, 'Zen').click();
  await enterZenWrite(page); // kéo mục chỉ có ở mặt Write
  await page.locator('.zc-ticks').hover();
  const rail = page.locator('.zc-rail .zc-ol');
  const c = rail.getByRole('button', { name: 'C', exact: true });
  await expect(c).toBeVisible();
  const from = (await c.boundingBox())!;
  const to = (await rail.getByRole('button', { name: 'A', exact: true }).boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 24, from.y + from.height / 2 - 6, { steps: 4 });
  await page.mouse.move(to.x + 20, to.y + to.height / 2, { steps: 8 });
  await expect(page.locator('.zc-rail')).toHaveClass(/\bopen\b/);
  await page.mouse.up();
  await expect.poll(() => val(page)).toBe('# T\n\n## C\n\nc\n\n## A\n\na\n\n## B\n\nb\n');
});

test.describe('studio g7: gợi ý link', () => {
  test('](# gợi ý tiêu đề (lọc không dấu), Enter chèn id và dấu đóng; Esc đóng', async ({ page }) => {
    await open(page, '# Doc\n\n## Cài đặt nhanh\n\n## Usage\n\nSee [setup](');
    await expect(page.locator('.pv-page .md-doc h2').first()).toHaveAttribute('id', 'cài-đặt-nhanh');
    await caretAt(page, (await val(page)).length);
    await page.keyboard.type('#cai');
    const list = page.getByRole('listbox', { name: 'Link to heading' });
    await expect(list.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    expect(await val(page)).toMatch(/See \[setup\]\(#cài-đặt-nhanh\)$/);
    await page.keyboard.type(' and [u](#');
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(ta(page)).toBeFocused();
  });

  test('[^ gợi ý chú thích đã có; trong zen cũng chạy', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true })); } catch { /* bỏ qua */ } });
    await open(page, '# T\n\nClaim\n\n[^raft]: Ongaro and Ousterhout, 2014\n');
    await viewTab(page, 'Zen').click();
    await enterZenWrite(page);
    await caretAt(page, (await val(page)).indexOf('Claim') + 5);
    await page.keyboard.type('[^');
    const list = page.getByRole('listbox', { name: 'Footnotes' });
    await expect(list.getByRole('option')).toHaveText([/\^raft.*Ongaro/]);
    await page.keyboard.press('Tab');
    expect(await val(page)).toContain('Claim[^raft]\n');
    await expect(page.locator('.pv[data-zen]')).toBeVisible();
  });

  test('![](  gợi ý ảnh đã dán, điền alt khi trống', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'dán ảnh bằng script chỉ chạy trên Chromium');
    await open(page, '# T\n\n');
    await caretAt(page, (await val(page)).length);
    await ta(page).evaluate((t: HTMLTextAreaElement) => {
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'leader-flow.png', { type: 'image/png' }));
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => val(page)).toContain('](asset:');
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type('\n\n![](');
    const list = page.getByRole('listbox', { name: 'Pasted images' });
    await expect(list.getByRole('option', { name: /leader-flow\.png/ })).toBeVisible();
    await list.getByRole('option', { name: /leader-flow\.png/ }).click();
    expect(await val(page)).toMatch(/!\[leader flow\]\(asset:[a-z0-9]+\.png\)$/);
  });

  test('không mở gợi ý trong khối code', async ({ page }) => {
    await open(page, '```\n');
    await caretAt(page, 4);
    await page.keyboard.type('[x](#');
    await expect(page.locator('.pv-slash')).toHaveCount(0);
  });
});

test.describe('studio g8: Word', () => {
  test('EXPORT → Word: file .docx có tiêu đề, bảng, sơ đồ Mermaid thành ảnh PNG', async ({ page }) => {
    await open(page, '# Report\n\n## Part\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```\n\nSee [part](#part).\n');
    await expect(page.locator('.pv-page figure.mermaid svg')).toBeVisible({ timeout: 15_000 });
    await exportMenu(page).click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: /^Word \(\.docx\)/ }).click()]);
    expect(dl.suggestedFilename()).toBe('report.docx');
    const { readFile } = await import('node:fs/promises');
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(new Uint8Array(await readFile((await dl.path())!)));
    const doc = strFromU8(files['word/document.xml']!);
    expect(doc).toContain('w:pStyle w:val="Heading1"');
    expect(doc).toContain('<w:tbl>');
    expect(doc).toMatch(/w:hyperlink[^>]*w:anchor="h2"/);
    expect(doc).not.toContain('flowchart LR'); // sơ đồ đã thành ảnh, không rơi về khối code
    expect(Object.keys(files).some((f) => f.startsWith('word/media/') && f.endsWith('.png'))).toBe(true);
    // bản xem vẫn dùng nhãn HTML sau khi xuất (cấu hình Mermaid được trả lại)
    await expect(page.locator('.pv-page figure.mermaid svg')).toBeVisible();
  });
});
