import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { enterZenWrite, exportMenu, fileMenu, openInspector, openView, ready, viewOptions, viewTab, newDocument, docName } from './helpers';

const URL_ = '/app/';
// Từ 2026-11-18 bài mặc định của /app/ là tờ giấy trống (thẻ chào); bài mẫu về buổi họp (src/lib/studio/sample.md) chỉ nạp khi khách bấm "Try a sample".
// Các test cũ dựa vào bài nhỏ một-h1 nên được seed sẵn như lần ghé đầu tiên; test gắn tag @default cần chính bài mẫu nên được seed bài mẫu
// (trước đây chúng không seed và nhận bài mẫu mặc định; điều chúng canh về nội dung bài mẫu không đổi).
const NOTES = readFileSync('e2e/fixtures/project-notes.md', 'utf8');
const SAMPLE_MD = readFileSync('src/lib/studio/sample.md', 'utf8').replace(/\r\n/g, '\n');
test.beforeEach(async ({ context }, info) => {
  const md = info.tags.includes('@default') ? SAMPLE_MD : NOTES;
  await context.addInitScript((m: string) => { try { if (localStorage.getItem('mdprev-md') === null) localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, md);
});
const ta = (p: Page) => p.locator('.ed-ta');
const open = async (p: Page, md?: string) => {
  await p.goto(URL_);
  await expect(p.locator('.md-doc h1').first()).toBeVisible();
  if (md !== undefined) { await ta(p).fill(md); await expect(p.locator('.pv-modetag')).toHaveText('READY'); }
};
const select = (p: Page, needle: string) => ta(p).evaluate((t: HTMLTextAreaElement, n: string) => { const i = t.value.indexOf(n); t.focus(); t.setSelectionRange(i, i + n.length); }, needle);
const paste = (p: Page, data: Record<string, string>) => ta(p).evaluate((t: HTMLTextAreaElement, d: Record<string, string>) => {
  const dt = new DataTransfer();
  for (const [k, v] of Object.entries(d)) dt.setData(k, v);
  t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, data);

test.describe('markdown preview', () => {
  test('dựng bài mẫu: tài liệu sạch, bảng thuộc tính, bảng, task, code có Copy', async ({ page }) => {
    await open(page);
    await expect(page.locator('.md-doc h1')).toHaveText('Project notes');
    await expect(page.locator('.pv-props')).toHaveCount(0); // preview không còn gập front matter
    const insp = await openInspector(page, 'Properties');
    await expect(insp.locator('table.pv-insp-props')).toContainText('updated');
    await expect(page.locator('.md-doc table')).toHaveCount(1);
    await expect(page.locator('.md-doc input[type=checkbox]')).toHaveCount(2);
    await expect(page.locator('.md-doc .cb-copy')).toHaveCount(1);
    await expect(page.locator('.pv-chk')).toContainText('No issues');
    // không còn chi tiết riêng của bài blog
    await expect(page.locator('.md-doc img, .pv-tile, .note')).toHaveCount(0);
    await expect(page.locator('.pv-modetag')).toHaveText('READY');
  });

  test('lớp tô màu khớp textarea: cùng độ rộng, và dòng của lề số, lớp tô, vạch dòng hiện tại thẳng hàng', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch {} });
    await open(page, ('## Heading **bold** `code` [l](https://x.dev) tiếng Việt có dấu đậm ' + 'x'.repeat(120) + '\n\n- [x] a *b* ~~c~~\n\n```ts\nconst a = 1;\n```\n\n> q\n\n').repeat(8));
    // chữ dài nhất trong lớp tô rộng đúng bằng phần nội dung của textarea (scrollWidth của textarea chỉ tính lề trái 16px)
    const m = await page.evaluate(() => { const t = document.querySelector('.ed-ta') as HTMLTextAreaElement; const w = Math.max(...[...document.querySelectorAll('.ed-hl .l')].map((l) => l.getBoundingClientRect().width)); return { content: t.scrollWidth - 16, w }; });
    expect(Math.abs(m.content - m.w)).toBeLessThanOrEqual(1.5);
    // dòng i của lề số = dòng i của lớp tô = hàng i của textarea: cùng một đáy tính từ pre (cỡ dòng cố định)
    const rows = await page.evaluate(() => { const nums = [...document.querySelectorAll('.ed-gutwin div')]; const pre = document.querySelector('.ed-hl') as HTMLElement; const lh = parseFloat(getComputedStyle(pre).lineHeight); const top = pre.getBoundingClientRect().top + parseFloat(getComputedStyle(pre).paddingTop); return [0, 5, 20].map((i) => [Math.round(nums[i]!.getBoundingClientRect().top), Math.round(top + i * lh)]); });
    for (const [n, l] of rows) expect(Math.abs(n! - l!)).toBeLessThanOrEqual(1);
  });

  test('định dạng đi qua undo gốc: Bold rồi Ctrl+Z trả lại văn bản', async ({ page }) => {
    await open(page, 'one two three');
    await select(page, 'two');
    await page.getByRole('button', { name: /Bold/ }).click();
    await expect(ta(page)).toHaveValue('one **two** three');
    await page.keyboard.press('Control+z');
    await expect(ta(page)).toHaveValue('one two three');
    await page.keyboard.press('Control+Shift+z');
    await expect(ta(page)).toHaveValue('one **two** three');
  });

  test('Tab trong bảng căn cột và chọn ô kế tiếp; ở ô cuối thêm hàng', async ({ page }) => {
    await open(page, '| a | bb |\n| - | - |\n| 1 | 2 |');
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(2, 2); });
    await page.keyboard.press('Tab');
    await expect(ta(page)).toHaveValue('| a   | bb  |\n| --- | --- |\n| 1   | 2   |');
    expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(t.selectionStart, t.selectionEnd))).toBe('bb');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await expect.poll(() => ta(page).inputValue().then((v) => v.split('\n').length)).toBe(4);
  });

  test('paste thông minh: URL lên vùng chọn thành link, bảng spreadsheet thành bảng Markdown', async ({ page }) => {
    await open(page, 'see blog\n');
    await select(page, 'blog');
    await paste(page, { 'text/plain': 'https://example.com/a' });
    await expect(ta(page)).toHaveValue('see [blog](https://example.com/a)\n');
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
    await paste(page, { 'text/plain': 'Name\tQty\nfig\t3\n' });
    await expect(page.locator('.md-doc table')).toHaveCount(1);
    await expect(ta(page)).toHaveValue(/\| Name \| Qty \|\n\| ---- \| --- \|\n\| fig {2}\| 3 {3}\|/);
  });

  test('outline: liệt kê heading, bấm để nhảy, đánh dấu mục đang đọc', async ({ page }) => {
    await open(page, '# Top\n\n' + '## Alpha\n\n' + 'filler\n\n'.repeat(60) + '## Beta\n\n' + 'filler\n\n'.repeat(60) + '### Gamma\n\nend\n');
    const insp = await openInspector(page, 'Outline');
    const nav = insp.getByRole('navigation', { name: 'Outline' });
    await expect(nav.getByRole('button')).toHaveText(['Top', '└ Alpha', '└ Beta', '└ Gamma']);
    await nav.getByRole('button', { name: /Beta/ }).click();
    await expect(nav).toBeVisible(); // Inspector là panel cố định: nhảy xong không đóng
    await expect(nav.getByRole('button', { name: /Beta/ })).toHaveAttribute('aria-current', 'true');
    expect(await page.locator('.pv-out').evaluate((e) => e.scrollTop)).toBeGreaterThan(200);
  });

  test('click bản xem nhảy về đúng dòng nguồn', async ({ page }) => {
    await open(page, '# T\n\nfirst\n\n## Second\n\nbody\n\n## Third\n');
    await page.locator('.md-doc h2', { hasText: 'Third' }).click();
    const sel = await ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(0, t.selectionStart).split('\n').length);
    expect(sel).toBe(9);
    await expect(ta(page)).not.toBeFocused(); // chỉ đưa con trỏ tới dòng, không lấy focus (phím đơn ?, d, s vẫn chạy khi đang đọc bản xem)
  });

  test('lint: tab Checks liệt kê từng lỗi, bấm từng mục nhảy tới dòng', async ({ page }) => {
    await open(page, '# A\n\n### B\n\nsee https://x.dev\n');
    await expect(page.locator('.pv-chk')).toContainText('2 issues');
    const insp = await openInspector(page, 'Checks');
    const items = insp.locator('.pv-insp-issue');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Heading level jumps from h1 to h3');
    await items.first().click();
    expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(0, t.selectionStart).split('\n').length)).toBe(3);
    await expect(items.nth(1)).toContainText('Bare URL');
    await items.nth(1).click();
    expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(0, t.selectionStart).split('\n').length)).toBe(5);
  });

  test('zen: Esc rồi f, làm mờ đoạn khác, giữ con trỏ trong ô soạn, Esc thoát', async ({ page }) => {
    await open(page, 'first para\n\nsecond para\n\nthird para\n');
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.focus(); t.setSelectionRange(14, 14); });
    await page.keyboard.press('Escape');
    await expect(ta(page)).not.toBeFocused();
    await page.keyboard.press('f');
    await expect(page.locator('html')).toHaveAttribute('data-focus', '1');
    await enterZenWrite(page); // Zen mở ở mặt đọc
    await expect(page.locator('.pv-view')).toBeHidden();
    await expect(ta(page)).toBeFocused();
    await expect(page.locator('.ed-hl .dz')).not.toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-focus', '1');
    await expect(page.locator('.pv-view')).toBeVisible();
  });

  for (const w of [1600, 900, 390]) {
    test(`zen xuống dòng mềm (${w}px): hai lớp ngắt dòng giống nhau, không cuộn ngang, đoạn đang gõ vẫn sáng`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      const L = 'To establish parameters that emerge naturally from the algorithmic philosophy, consider: "What properties of this system should be tunable" ';
      const md = ['# Title', L.repeat(2), 'short', L + 'https://example.com/' + 'a'.repeat(180), '- ' + L + '\n- item', L.repeat(3), L.repeat(3), L.repeat(3)].join('\n\n');
      await page.goto(URL_); // dưới 960px bản xem ẩn nên không chờ .md-doc
      await ta(page).fill(md);
      await expect(page.locator('.pv-modetag')).toHaveText('READY');
      await select(page, 'short');
      await expect(page.locator('.pv-mode')).toContainText(/Ln 5,/); // chờ con trỏ đã được ghi nhận trước khi vào zen (WebKit đôi khi chậm), nếu không đoạn sáng tính theo dòng cũ
      await page.keyboard.press('Escape');
      await page.keyboard.press('f');
      await enterZenWrite(page);
      await page.waitForTimeout(400); // chờ ResizeObserver đồng bộ bề rộng lớp tô màu
      const m = await page.evaluate(() => {
        const t = document.querySelector('.ed-ta') as HTMLTextAreaElement, h = document.querySelector('.ed-hl') as HTMLElement;
        return { taH: t.scrollHeight, ch: t.clientHeight, hlH: h.getBoundingClientRect().height, sw: t.scrollWidth, cw: t.clientWidth, hlW: h.getBoundingClientRect().width };
      });
      expect(m.sw).toBeLessThanOrEqual(m.cw);
      expect(Math.abs(m.hlW - m.cw)).toBeLessThanOrEqual(1);
      expect(m.taH).toBeGreaterThan(m.ch); // đủ dài để cuộn, nếu không scrollHeight chỉ là chiều cao khung
      expect(Math.abs(m.taH - m.hlH)).toBeLessThanOrEqual(1); // lệch chiều cao = hai lớp ngắt dòng khác nhau
      await expect(page.locator('.ed-hl .dz')).not.toHaveCount(0);
      expect(await page.evaluate(() => [...document.querySelectorAll('.ed-hl .dz')].some((e) => (e.textContent ?? '').includes('short')))).toBe(false); // đoạn đang gõ không bị làm mờ
    });
  }

  test('zen: đổi bề rộng khi đang bật (bàn phím ảo) vẫn dựng đủ văn bản; căn con trỏ giữa khung trong tài liệu dài', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    const para = (i: number) => `P${i} ` + 'word '.repeat(60);
    await page.goto(URL_);
    await ta(page).fill(['# Title', ...Array.from({ length: 30 }, (_, i) => para(i))].join('\n\n'));
    await expect(page.locator('.pv-modetag')).toHaveText('READY');
    await select(page, 'P20 ');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await enterZenWrite(page);
    const top = await ta(page).evaluate((t: HTMLTextAreaElement) => t.scrollTop);
    expect(top).toBeGreaterThan(500); // con trỏ ở sâu trong tài liệu nên khung phải cuộn tới đó
    await page.waitForTimeout(700); // lớp tô màu bám theo cuộn qua sự kiện scroll
    const mid = await page.evaluate(() => { // đoạn sáng (không .dz) nằm quanh giữa khung nhìn
      const t = document.querySelector('.ed-ta') as HTMLElement, hl = document.querySelector('.ed-hl') as HTMLElement;
      const r = document.createRange(); const n = [...hl.querySelectorAll('.l')].find((c) => (c.textContent ?? '').includes('P20 ') && !(c as HTMLElement).classList?.contains('dz'));
      if (!n) return -1; r.selectNode(n); const b = r.getBoundingClientRect(), tb = t.getBoundingClientRect();
      return (b.top + b.height / 2 - tb.top) / tb.height;
    });
    expect(mid).toBeGreaterThan(0.2); expect(mid).toBeLessThan(0.8);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => { const t = document.querySelector('.ed-ta') as HTMLTextAreaElement, h = document.querySelector('.ed-hl') as HTMLElement; return { first: h.textContent?.slice(0, 7), hlH: h.getBoundingClientRect().height, taH: t.scrollHeight }; });
    expect(after.first).toContain('# Title'); // không bị cắt còn một cửa sổ
    expect(Math.abs(after.hlH - after.taH)).toBeLessThanOrEqual(1);
  });

  for (const focus of ['paragraph', 'sentence'] as const) test(`zen (${focus}): chữ trong lớp tô màu khớp từng ký tự với textarea (đậm, code, link, escape, tiếng Việt NFC và NFD)`, async ({ page }) => {
    await page.addInitScript((f) => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true, focus: f })); } catch { /* bỏ qua */ } }, focus); // sentence: lớp tô màu chèn thêm span, vẫn không được lệch chữ
    await page.setViewportSize({ width: 1280, height: 800 });
    const nfd = 'Tiếng Việt có dấu'.normalize('NFD');
    const line = `Một câu. Hai câu đây! Và ba? **Đậm** và \`code\` với [liên kết](https://x.dev) \\*thoát\\* ${nfd} ${'lorem ipsum dolor sit amet '.repeat(6)}_nghiêng_ ~~gạch~~ cuối dòng`;
    await page.goto(URL_);
    await ta(page).fill(`# Tiêu đề **đậm** dài\n\n${line}\n\n> trích ${line}\n\n- mục ${line}`);
    await expect(page.locator('.pv-modetag')).toHaveText('READY');
    await select(page, focus === 'sentence' ? 'Hai câu' : 'Tiêu đề');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await enterZenWrite(page);
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const hl = document.querySelector('.ed-hl') as HTMLElement, t = document.querySelector('.ed-ta') as HTMLTextAreaElement;
      const cs = getComputedStyle(t), hs = getComputedStyle(hl);
      const props = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'fontKerning', 'fontVariantLigatures', 'fontFeatureSettings', 'whiteSpace', 'overflowWrap'] as const;
      const mism = props.filter((k) => cs[k] !== hs[k]);
      // gương: một text node duy nhất, cùng kiểu và bề rộng với textarea
      const m = document.createElement('div');
      m.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;box-sizing:border-box;width:${t.clientWidth}px;padding:${cs.padding};white-space:pre-wrap;overflow-wrap:break-word;font:${[cs.fontStyle, cs.fontWeight, cs.fontSize + '/' + cs.lineHeight, cs.fontFamily].join(' ')};font-kerning:${cs.fontKerning};font-variant-ligatures:${cs.fontVariantLigatures};font-feature-settings:${cs.fontFeatureSettings};letter-spacing:${cs.letterSpacing}`;
      m.textContent = t.value;
      hl.parentElement!.appendChild(m);
      const walk = (root: Node) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const a: { n: Text; s: number }[] = []; let s = 0, n: Node | null; while ((n = w.nextNode())) { a.push({ n: n as Text, s }); s += (n as Text).length; } return a; };
      const rect = (nodes: { n: Text; s: number }[], off: number) => { const e = nodes.find((x) => off >= x.s && off < x.s + x.n.length)!; const rg = document.createRange(); rg.setStart(e.n, off - e.s); rg.setEnd(e.n, off - e.s + 1); const b = rg.getBoundingClientRect(); return { x: b.left, y: b.top }; };
      const A = walk(hl), B = walk(m);
      const hb = hl.getBoundingClientRect(), mb = m.getBoundingClientRect();
      let dx = 0, dy = 0, n = 0; const len = t.value.length;
      for (let o = 0; o < len; o += 3) {
        if (t.value[o] === '\n') continue;
        const a = rect(A, o), b = rect(B, o);
        dx = Math.max(dx, Math.abs((a.x - hb.left) - (b.x - mb.left))); dy = Math.max(dy, Math.abs((a.y - hb.top) - (b.y - mb.top))); n++;
      }
      m.remove();
      return { mism, dx, dy, n, same: hl.textContent!.replace(/\n$/, '') === t.value };
    });
    expect(r.same).toBe(true); // lớp tô màu giữ đúng từng ký tự của văn bản
    expect(r.mism).toEqual([]);
    expect(r.n).toBeGreaterThan(100);
    // WebKit lệch tới ~0,9px ở cuối dòng dài (làm tròn vị trí chữ khác nhau), Chromium dưới 0,6px: dưới 1,2px là không nhìn thấy
    expect(r.dx).toBeLessThanOrEqual(1.2);
    expect(r.dy).toBeLessThanOrEqual(0.6);
  });

  const FIVE = ['# Title', 'alpha one two three', 'bravo one two three', 'charlie one two three', 'delta one two three', 'echo one two three', 'foxtrot one two three'].join('\n\n');
  const zenOn = async (page: Page, md: string, at: string, hinted = true) => {
    if (hinted) await page.addInitScript(() => { try { if (!localStorage.getItem('mdprev-md-zen')) localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true })); } catch { /* bỏ qua */ } });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(URL_);
    await ta(page).fill(md);
    await expect(page.locator('.pv-modetag')).toHaveText('READY');
    await select(page, at);
    await ta(page).dispatchEvent('click'); // báo con trỏ mới cho studio ngay (WebKit gửi selectionchange chậm)
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await enterZenWrite(page);
    await expect(page.locator('.pv[data-zen] .ed-hl .l').first()).toBeAttached(); // lớp tô màu zen đã dựng xong
    await page.waitForTimeout(250); // WebKit dưới tải: chờ bố cục zen ổn định
  };

  const zMenu = async (page: Page) => { await page.locator('.zc-more').click(); await expect(page.locator('.zc-menu')).toBeVisible(); };
  const zSeg = (page: Page, group: string, name: string) => page.locator(`.zc-menu [role=group][aria-label="${group}"]`).getByRole('button', { name, exact: true });
  const zCopyCaret = (page: Page) => page.getByRole('button', { name: 'Copy format' });

  test('zen: các đoạn mờ dần theo khoảng cách tới đoạn đang gõ', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha');
    const op = (needle: string) => page.evaluate((n) => { const el = [...document.querySelectorAll('.ed-hl .l')].find((e) => (e.textContent ?? '').startsWith(n))!; return { cls: el.className, o: +getComputedStyle(el).opacity }; }, needle);
    const cur = await op('alpha'), near = await op('bravo'), mid = await op('charlie'), far = await op('echo');
    expect(cur.cls).not.toContain('dz');
    expect(cur.o).toBe(1);
    expect(near.cls).toContain('dz'); expect(far.cls).toContain('d3');
    expect(near.o).toBeGreaterThan(mid.o); expect(mid.o).toBeGreaterThan(far.o); expect(far.o).toBeGreaterThan(0.1);
    await zMenu(page);
    await zSeg(page, 'Fade', 'Strong').click(); // soft -> strong
    expect((await op('bravo')).o).toBeLessThan(near.o);
    await zSeg(page, 'Fade', 'Off').click(); // strong -> off
    expect((await op('echo')).o).toBe(1);
  });

  test('zen: Alt+V đổi giữa VIẾT và ĐỌC, v trần trong mặt đọc, Esc thoát; lệnh Palette mở thẳng mặt đọc', async ({ page }) => {
    await zenOn(page, '# Tiêu đề lớn\n\nMột đoạn **đậm** và `code`.\n\n## Mục hai\n\nĐoạn cuối.', 'Một đoạn');
    await page.keyboard.press('Alt+v');
    await expect(page.locator('.pv')).toHaveAttribute('data-zread', '1');
    await expect(page.locator('.pv-view .md-doc h1')).toBeVisible();
    await expect(page.locator('.pv-view .md-doc h1')).toHaveCSS('font-size', '40px');
    await expect(ta(page)).toBeHidden();
    await expect(page.locator('.pv-out')).toBeFocused();
    await page.keyboard.press('v');
    await expect(page.locator('.pv')).not.toHaveAttribute('data-zread', '1');
    await expect(ta(page)).toBeFocused();
    await page.keyboard.press('Alt+v');
    await page.keyboard.press('Escape'); // trong mặt đọc, Esc thoát hẳn zen
    await expect(page.locator('html')).not.toHaveAttribute('data-focus', '1');
    await expect(page.locator('.pv-split')).toBeVisible();
    await page.keyboard.press('Control+/'); // thoát Zen trả focus về ô soạn (không còn ở bản xem), nên mở Palette bằng phím tắt thay vì '/' trần, chạy lệnh zen-read
    const box = page.getByRole('dialog').getByRole('textbox').or(page.locator('[role=dialog] input')).first();
    await box.fill('>zen read');
    await expect(page.getByRole('dialog')).toContainText('Zen, read');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pv')).toHaveAttribute('data-zread', '1');
  });

  test('zen: card thống kê mờ đi khi gõ; bôi đen hiện card công cụ nổi; cài đặt (mục tiêu, font) được nhớ; không còn mèo', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha');
    const corner = page.locator('.zc-corner');
    await expect(page.locator('.zs-cat, .zs')).toHaveCount(0); // thanh trên cùng và mèo đã bỏ
    await expect(corner).toHaveClass(/\bon\b/);
    await expect(page.locator('.zc-stats')).toContainText('words');
    await expect(page.locator('.zc-stats')).toContainText(/\d+ min/);
    await page.keyboard.type('x');
    await expect(corner).not.toHaveClass(/\bon\b/);
    await expect(corner).toHaveClass(/\bon\b/, { timeout: 6000 }); // ngừng gõ ~3 giây thì hiện lại
    // bôi đen một từ: card công cụ nổi hiện phía trên, card thống kê chuyển sang "selected text"
    await ta(page).evaluate((t: HTMLTextAreaElement) => { const i = t.value.indexOf('bravo'); t.setSelectionRange(i, i + 5); document.dispatchEvent(new Event('selectionchange')); });
    const bar = page.getByRole('toolbar', { name: 'Format selection' });
    await expect(bar).toBeVisible();
    await expect(page.locator('.zc-stats')).toContainText('selected text');
    await expect(page.locator('.zc-stats')).toContainText('5 characters');
    const box = await bar.boundingBox(); const sel = await ta(page).evaluate((t: HTMLTextAreaElement) => t.getBoundingClientRect().left);
    expect(box!.y).toBeGreaterThan(0); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(1280); expect(sel).toBeGreaterThan(0);
    await bar.getByRole('button', { name: /Bold/ }).click(); // bấm nút không làm mất vùng bôi đen / focus
    await expect(ta(page)).toHaveValue(/\*\*bravo\*\*/);
    await expect(ta(page)).toBeFocused();
    await bar.getByRole('button', { name: /More formatting/ }).click();
    await expect(bar.getByRole('button', { name: /Table/ })).toBeVisible();
    // cài đặt trong popover ⋯
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.setSelectionRange(0, 0); document.dispatchEvent(new Event('selectionchange')); });
    await zMenu(page);
    await zSeg(page, 'Word goal', '300').click();
    await expect(zSeg(page, 'Word goal', '300')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.zc-bar')).toHaveCount(1);
    await zSeg(page, 'Font', 'Mono').click();
    await expect(page.locator('.pv')).toHaveAttribute('data-zface', 'mono');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mdprev-md-zen') ?? '{}'))).toMatchObject({ face: 'mono', goal: 300 });
    await page.reload(); // nhớ qua lần tải lại
    await expect(page.locator('.md-doc h1')).toBeVisible();
    await ta(page).focus();
    await page.keyboard.press('Escape'); await page.keyboard.press('f');
    await zMenu(page);
    await expect(zSeg(page, 'Word goal', '300')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.pv')).toHaveAttribute('data-zface', 'mono');
    await page.mouse.click(40, 200); // bấm ra ngoài (lề trái) thì popover đóng
    await expect(page.locator('.zc-menu')).toBeHidden();
  });

  test('zen: card báo trạng thái lưu; cỡ chữ và độ rộng cột đổi được, giữ khớp hai lớp, được nhớ', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha');
    await page.keyboard.type('x');
    await expect(page.locator('.zc-cap')).toContainText(/Saved \d/, { timeout: 8000 });
    await zMenu(page);
    const geo = () => page.evaluate(() => { const t = document.querySelector('.ed-ta') as HTMLTextAreaElement, h = document.querySelector('.ed-hl') as HTMLElement; return { fs: parseFloat(getComputedStyle(t).fontSize), w: document.querySelector('.ed')!.getBoundingClientRect().width, hlH: h.getBoundingClientRect().height, taH: t.scrollHeight, ch: t.clientHeight }; });
    const m = await geo();
    await zSeg(page, 'Size', 'L').click(); // M -> L
    await zSeg(page, 'Width', 'Wide').click(); // normal -> wide
    const l = await geo();
    expect(l.fs).toBeGreaterThan(m.fs); expect(l.w).toBeGreaterThan(m.w);
    expect(Math.abs(l.hlH - l.taH)).toBeLessThanOrEqual(1); // đổi cỡ chữ không làm hai lớp lệch nhau
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mdprev-md-zen') ?? '{}'))).toMatchObject({ size: 'l', col: 'wide' });
  });

  test('zen: nút Copy tách đôi, mặc định Markdown, đổi sang Rich/Plain thì nút chính chép theo đó và được nhớ; đổi sáng/tối trong menu', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await zenOn(page, '# Tiêu đề\n\nMột đoạn **đậm**.', 'Một đoạn');
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.setSelectionRange(0, 0); document.dispatchEvent(new Event('selectionchange')); }); // zenOn bôi đen từ khoá: bỏ để nút chính là Copy cả tài liệu
    const main = page.locator('.zc-copy');
    await expect(main).toHaveAccessibleName('Copy Markdown');
    await main.click();
    await expect(page.locator('.zc-flash')).toHaveText('Copied Markdown');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()).catch(() => '# Tiêu đề\n\nMột đoạn **đậm**.')).toBe('# Tiêu đề\n\nMột đoạn **đậm**.');
    await zCopyCaret(page).click();
    await expect(page.getByRole('menuitemradio', { name: /Markdown/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('menuitemradio', { name: /Plain text/ }).click(); // chọn là chép luôn và đặt làm mặc định
    await expect(page.locator('.zc-flash')).toHaveText('Copied plain text');
    await expect(main).toHaveAccessibleName('Copy plain text');
    const plain = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (plain !== null) expect(plain).toBe('Tiêu đề\n\nMột đoạn đậm.\n');
    await zCopyCaret(page).click();
    await page.getByRole('menuitemradio', { name: /Rich text/ }).click();
    await expect(main).toHaveAccessibleName('Copy rich text');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mdprev-md-zen') ?? '{}').copy)).toBe('rich');
    await page.keyboard.press('Alt+c'); // phím tắt chép bằng định dạng đang chọn
    await expect(page.locator('.zc-flash')).toHaveText('Copied rich text');
    await page.reload(); // nhớ qua lần tải lại
    await expect(page.locator('.md-doc h1')).toBeVisible();
    await ta(page).focus();
    await page.keyboard.press('Escape'); await page.keyboard.press('f');
    await expect(page.locator('.zc-copy')).toHaveAccessibleName('Copy rich text');
    await zMenu(page);
    const before = await page.evaluate(() => document.documentElement.dataset['theme']);
    await zSeg(page, 'Theme', before === 'dark' ? 'Light' : 'Dark').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset['theme']), { timeout: 4000 }).not.toBe(before);
  });

  test('zen: có vùng bôi đen thì nút chính thành "Copy selection" và chép đúng đoạn Markdown đó', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await zenOn(page, FIVE, 'alpha');
    await ta(page).evaluate((t: HTMLTextAreaElement) => { const i = t.value.indexOf('bravo'); t.setSelectionRange(i, i + 5); document.dispatchEvent(new Event('selectionchange')); });
    await expect(page.locator('.zc-copy')).toHaveAccessibleName('Copy selection');
    await page.locator('.zc-copy').click();
    await expect(page.locator('.zc-flash')).toHaveText('Copied selection');
    const got = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (got !== null) expect(got).toBe('bravo');
  });

  test('zen mặt Read: nút COPY của khối code chỉ hiện khi rê khối, bấm thì chép đúng đoạn code', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await zenOn(page, '# T\n\nmột đoạn\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n', 'một đoạn');
    await page.keyboard.press('Alt+v');
    const btn = page.locator('.pv-view .cb-copy').first();
    await expect(btn).toBeAttached();
    await page.mouse.move(5, 400);
    await expect(btn).toHaveCSS('opacity', '0');
    await page.locator('.pv-view .cb').first().hover();
    await expect(btn).toHaveCSS('opacity', '1');
    await btn.click();
    const got = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (got !== null) expect(got.trim()).toBe('const a = 1;\nconsole.log(a);');
  });

  test('zen: dock phải và rail trái nằm trong lề, không đè lên cột chữ ở cả hai mặt; giảm chuyển động vẫn giữ vị trí', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await zenOn(page, '# A\n\ntext alpha\n\n## B\n\ntext', 'text alpha');
    await page.setViewportSize({ width: 1600, height: 800 });
    await ta(page).evaluate((t: HTMLTextAreaElement) => { t.setSelectionRange(0, 0); document.dispatchEvent(new Event('selectionchange')); }); // bỏ vùng bôi đen: lúc đó thanh dài hơn (thêm 'selected text')
    const edge = (sel: string) => page.locator(sel).evaluate((e: HTMLElement) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; });
    for (const face of ['write', 'read']) {
      if (face === 'read') await page.keyboard.press('Alt+v');
      const col = await edge(face === 'read' ? '.pv-page' : '.ed');
      for (const sel of ['.zc-stats', '.zc-split']) {
        const b = (await page.locator(sel).boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(col.r); // bên phải cột chữ: không che chữ khi cuộn
        expect(b.x + b.width).toBeLessThanOrEqual(1600);
      }
      const rail = (await page.locator('.zc-ticks').boundingBox())!;
      expect(rail.x + rail.width).toBeLessThanOrEqual(col.l);
      expect(rail.x).toBeGreaterThanOrEqual(0);
    }
    const rail = (await page.locator('.zc-ticks').boundingBox())!;
    expect(Math.abs(rail.y + rail.height / 2 - 800 / 2)).toBeLessThan(4);
    const st = (await page.locator('.zc-stats').boundingBox())!;
    expect(st.y + st.height).toBeLessThanOrEqual(800);
  });

  test('zen: Chrome Auto/Always/Hidden, Alt+H đổi vòng, Hidden vẫn hiện NOT SAVED và có thể thoát bằng Alt+H', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha');
    await zMenu(page);
    await zSeg(page, 'Controls', 'Hidden').click();
    await expect(page.locator('.zc-note')).toContainText('Controls hidden');
    await page.mouse.click(40, 200); // đóng menu
    await expect(page.locator('.zc-top.zc-ghost')).toHaveCount(1);
    await expect(page.locator('.zc-top')).toHaveCSS('opacity', '0');
    await page.mouse.move(1180, 40); // rê vào chỗ cũ của Copy: Hidden không hiện lại
    await expect(page.locator('.zc-top')).toHaveCSS('opacity', '0');
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k: string, v: string) { if (k === 'mdprev-md') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await ta(page).focus();
    await page.keyboard.type('x');
    await expect(page.locator('.zc-corner')).toHaveCSS('opacity', '1', { timeout: 8000 }); // cảnh báo mất dữ liệu không bị giấu
    await expect(page.locator('.zc-cap.warn')).toContainText('Not saved · storage is blocked, use Export');
    await page.keyboard.press('Alt+h'); // hidden -> auto
    await expect(page.locator('.zc-ghost')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mdprev-md-zen') ?? '{}').chrome)).toBe('auto');
    await page.keyboard.press('Alt+h'); // auto -> always
    await ta(page).focus();
    await page.keyboard.type('y');
    await expect(page.locator('.zc-top')).toHaveCSS('opacity', '1'); // Always: gõ cũng không ẩn
  });

  test('zen: Copy selection không tràn khỏi màn hình; thanh Write/Read nằm ngang, dài vừa đủ', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha'); // zenOn bôi đen từ khoá: nút chính là "Copy selection"
    await expect(page.locator('.zc-copy')).toHaveAccessibleName('Copy selection');
    const top = (await page.locator('.zc-split').boundingBox())!;
    expect(top.x).toBeGreaterThanOrEqual(0);
    expect(top.x + top.width).toBeLessThanOrEqual(1280);
    const label = (await page.locator('.zc-copy-t').boundingBox())!;
    expect(label.height).toBeLessThan(24); // không xuống hai dòng
    const st = (await page.locator('.zc-stats').boundingBox())!;
    expect(st.height).toBeLessThan(60); // thanh ngang, không phải khối vuông xếp dọc
    expect(st.width).toBeGreaterThan(st.height * 3);
    expect(st.x + st.width).toBeLessThanOrEqual(1280);
  });

  test('zen: dưới 1500px thanh dưới thu gọn (số từ + Write/Read) và không lấn vào cột chữ, kể cả khi rê hay bôi đen', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha'); // đang bôi đen: caption và số ký tự phải bị giấu ở màn hẹp
    const textRight = await page.locator('.ed').evaluate((e: HTMLElement) => e.getBoundingClientRect().right - 24); // đệm ngang 24px của cột chữ
    await page.locator('.zc-stats').hover();
    const b = (await page.locator('.zc-stats').boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(textRight);
    await expect(page.locator('.zc-stats .zc-cap')).toBeHidden();
    await expect(page.locator('.zc-vals .x').first()).toBeHidden();
    await expect(page.locator('.zc-vals').getByText('words')).toBeVisible();
  });

  test('zen: ghim outline giữ danh sách mở khi không rê, bỏ ghim thì ẩn lại; nhớ qua lần tải lại', async ({ page }) => {
    const md = ['# Mở đầu', ...Array.from({ length: 6 }, (_, i) => `## Mục ${i}\n\nNội dung ${i}.`)].join('\n\n');
    await zenOn(page, md, 'Nội dung 0');
    await page.setViewportSize({ width: 1500, height: 800 });
    const list = page.locator('.zc-rail-list');
    await page.mouse.move(700, 700);
    await expect(list).toHaveCSS('opacity', '0');
    await page.locator('.zc-rail').hover();
    await page.getByRole('button', { name: 'Pin outline' }).click();
    await page.mouse.move(700, 700); // rời rail: danh sách vẫn mở vì đã ghim
    await expect(list).toHaveCSS('opacity', '1');
    await expect(page.locator('.zc-rail')).toHaveClass(/pinned/);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mdprev-md-zen') ?? '{}').pin)).toBe(true);
    await page.reload();
    await expect(page.locator('.md-doc h1')).toBeVisible();
    await ta(page).focus();
    await page.keyboard.press('Escape'); await page.keyboard.press('f');
    await expect(page.locator('.zc-rail')).toHaveClass(/pinned/);
    await page.getByRole('button', { name: 'Unpin outline' }).click();
    await page.mouse.move(700, 700);
    await expect(list).toHaveCSS('opacity', '0');
  });

  test('zen: Copy menu có Save as .md tải đúng file Markdown', async ({ page }) => {
    await zenOn(page, '# Tiêu đề\n\nMột đoạn.', 'Một đoạn');
    await zCopyCaret(page).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Save as \.md/ }).click();
    const d = await dl;
    expect(d.suggestedFilename()).toMatch(/\.md$/);
    const fs = await import('node:fs/promises');
    expect(await fs.readFile((await d.path())!, 'utf8')).toContain('# Tiêu đề');
  });

  test('zen mặt Read: vạch tiến độ và "min left" theo vị trí cuộn', async ({ page }) => {
    const md = ['# Mở đầu', ...Array.from({ length: 40 }, (_, i) => `Đoạn ${i} ` + 'chữ '.repeat(80))].join('\n\n');
    await zenOn(page, md, 'Đoạn 0');
    await expect(page.locator('.zc-prog')).toHaveCount(0); // mặt Write: không có vạch đọc
    await page.keyboard.press('Alt+v');
    await page.locator('.pv-out').evaluate((o: HTMLElement) => { o.scrollTop = 0; });
    await expect(page.locator('.zc-prog')).toHaveAttribute('style', /width:\s*0%/);
    // cùng màu và độ dày với vạch tiến độ của Present (.sl-bar i): --accent, 3px, không mờ
    const bar = await page.locator('.zc-prog').evaluate((e) => { const cs = getComputedStyle(e); const probe = document.createElement('i'); probe.style.background = 'var(--accent)'; document.body.appendChild(probe); const accent = getComputedStyle(probe).backgroundColor; probe.remove(); return { bg: cs.backgroundColor, accent, h: cs.height, o: cs.opacity }; });
    expect(bar.bg).toBe(bar.accent);
    expect(bar.h).toBe('3px');
    expect(bar.o).toBe('1');
    await expect(page.locator('.zc-stats')).toContainText('min left');
    await page.locator('.pv-out').evaluate((o: HTMLElement) => { o.scrollTop = o.scrollHeight; });
    await expect(page.locator('.zc-prog')).toHaveAttribute('style', /width:\s*100%/);
    await expect(page.locator('.zc-stats')).toContainText('100%');
    await expect(page.locator('.zc-stats')).toContainText('0 min left');
  });

  test('zen: Typewriter Third đặt dòng đang viết ở ~1/3 trên; Free không tự cuộn khi con trỏ còn trong khung', async ({ page }) => {
    const para = (i: number) => `P${i} ` + 'word '.repeat(40);
    const md = ['# Title', ...Array.from({ length: 40 }, (_, i) => para(i))].join('\n\n');
    const frac = () => page.evaluate(() => { const t = document.querySelector('.ed-ta') as HTMLElement; const l = document.querySelector('.ed-hl .l:not(.dz)') as HTMLElement; return (l.getBoundingClientRect().top - t.getBoundingClientRect().top) / t.clientHeight; });
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true, tw: 'third' })); } catch { /* bỏ qua */ } });
    await zenOn(page, md, 'P20 ', false);
    await page.waitForTimeout(500);
    const f = await frac();
    expect(f).toBeGreaterThan(0.26); expect(f).toBeLessThan(0.46);
    await zMenu(page);
    await zSeg(page, 'Typewriter', 'Free').click();
    await page.mouse.click(40, 200);
    await ta(page).focus();
    const top0 = await ta(page).evaluate((t: HTMLTextAreaElement) => t.scrollTop);
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    expect(Math.abs((await ta(page).evaluate((t: HTMLTextAreaElement) => t.scrollTop)) - top0)).toBeLessThan(2);
  });

  test('zen: Focus Sentence chỉ giữ sáng câu đang viết trong đoạn, Fade Off tắt luôn hiệu ứng', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true, focus: 'sentence' })); } catch { /* bỏ qua */ } });
    await zenOn(page, '# T\n\nFirst one here. Second one here. Third one here.\n\nOther paragraph.', 'Second', false);
    const parts = () => page.evaluate(() => { const l = [...document.querySelectorAll('.ed-hl .l')].find((e) => (e.textContent ?? '').startsWith('First'))!; const lit = [...l.childNodes].filter((n) => !(n as HTMLElement).classList?.contains('sd')).map((n) => n.textContent).join(''); const dim = [...l.querySelectorAll('.sd')].map((n) => n.textContent).join('|'); return { lit, dim }; });
    await expect.poll(async () => (await parts()).lit.trim()).toBe('Second one here.');
    expect((await parts()).dim).toContain('First one here.');
    expect((await parts()).dim).toContain('Third one here.');
    await zMenu(page);
    await zSeg(page, 'Fade', 'Off').click();
    await expect(page.locator('.ed-hl .sd')).toHaveCount(0);
  });

  test('zen: Ctrl+K mở Palette sẵn lệnh zen, chạy được cài đặt; Esc trong Palette không thoát zen; focus về ô soạn', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha');
    await page.keyboard.press('Control+k');
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('textbox')).toHaveValue('>zen ');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-focus', '1'); // vẫn ở trong zen
    await expect(ta(page)).toBeFocused();
    await page.keyboard.press('Control+k');
    await dlg.getByRole('textbox').fill('>zen typewriter free');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mdprev-md-zen') ?? '{}').tw)).toBe('free');
    await expect(page.locator('html')).toHaveAttribute('data-focus', '1');
  });

  test('zen: NOT SAVED luôn hiện thành chữ trong pill, kể cả khi pill ở trạng thái nghỉ (không chỉ chấm màu)', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha');
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k: string, v: string) { if (k === 'mdprev-md') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await page.keyboard.type('x');
    const cap = page.locator('.zc-cap.warn');
    await expect(cap).toContainText('Not saved · storage is blocked, use Export', { timeout: 8000 });
    await page.mouse.move(5, 5); // rê ra xa pill: trạng thái nghỉ
    await expect(cap).toBeVisible();
  });

  test('zen: NOT SAVED hiện ngay cả khi đang gõ ở chế độ Auto (chrome tự ẩn khi gõ nhưng cảnh báo thì không)', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha');
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k: string, v: string) { if (k === 'mdprev-md') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await page.keyboard.type('xyz'); // gõ làm chrome ẩn
    await expect(page.locator('.zc-top')).toHaveCSS('opacity', '0');
    await expect(page.locator('.zc-cap.warn')).toContainText('Not saved · storage is blocked, use Export', { timeout: 8000 });
    await expect(page.locator('.zc-corner')).toHaveCSS('opacity', '1');
  });

  test('zen: mở zen khi đang ở chế độ Hidden thì có ghi chú cách thoát', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-zen', JSON.stringify({ hinted: true, chrome: 'hidden' })); } catch { /* bỏ qua */ } });
    await zenOn(page, FIVE, 'alpha', false);
    await expect(page.locator('.zc-note')).toContainText('Controls hidden');
    await expect(page.locator('.zc-note')).toContainText('Alt+H');
  });

  test('zen: rail outline bên trái, rê thì mở danh sách; mục không bị co chồng lên nhau; bấm tiêu đề cuộn tới đó ở cả hai mặt', async ({ page }) => {
    const md = ['# Mở đầu', ...Array.from({ length: 12 }, (_, i) => `Đoạn ${i} ` + 'chữ '.repeat(80)), ...Array.from({ length: 30 }, (_, i) => `## Mục ${i}\n\nNội dung ${i}.`), '## Phần cuối', 'Kết thúc.'].join('\n\n');
    await zenOn(page, md, 'Đoạn 0');
    const rail = page.locator('.zc-rail');
    await expect(rail).toBeVisible();
    await rail.hover();
    const list = page.getByRole('group', { name: 'Outline' }).first();
    await expect(list).toBeVisible();
    const hs = await list.getByRole('button').evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) })));
    expect(hs.length).toBeGreaterThan(30);
    for (const x of hs) expect(x.h).toBeGreaterThanOrEqual(x.lh); // lỗi cũ: item co về 0 và chữ chồng nhau
    const lb = (await page.locator('.zc-rail-list').boundingBox())!, tb = (await page.locator('.zc-ticks').boundingBox())!;
    const colL = await page.locator('.ed').evaluate((e: HTMLElement) => e.getBoundingClientRect().left);
    expect(lb.x).toBeGreaterThanOrEqual(0);
    expect(lb.x + lb.width).toBeLessThanOrEqual(tb.x); // danh sách nằm bên trái dải vạch, không đè lên rail
    expect(lb.x + lb.width).toBeLessThanOrEqual(colL); // cũng không đè lên chữ
    await list.getByRole('button', { name: 'Mục 3', exact: true }).click(); // mặt Write: đưa con trỏ tới dòng tiêu đề
    await expect.poll(() => ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(t.selectionStart, t.selectionStart + 8))).toBe('## Mục 3');
    await page.keyboard.press('Alt+v'); // mặt Read: cuộn bản đã dựng
    const top0 = await page.locator('.pv-out').evaluate((o: HTMLElement) => o.scrollTop);
    await rail.hover();
    await page.getByRole('group', { name: 'Outline' }).first().getByRole('button', { name: 'Phần cuối' }).click();
    await expect.poll(() => page.locator('.pv-out').evaluate((o: HTMLElement) => o.scrollTop), { timeout: 4000 }).toBeGreaterThan(top0 + 400);
  });

  test.describe('màn hẹp', () => {
    test('zen: dưới 1180px rail ẩn, outline nằm trong menu ⋯', async ({ page }) => {
      await zenOn(page, '# A\n\ntext alpha\n\n## B\n\ntext', 'text alpha');
      await page.setViewportSize({ width: 900, height: 700 }); // zenOn đặt 1280: thu hẹp sau khi vào zen
      await expect(page.locator('.zc-rail')).toBeHidden();
      await zMenu(page);
      await page.locator('.zc-menu .zc-adv', { hasText: /^Outline/ }).click();
      await expect(page.locator('.zc-menu').getByRole('button', { name: 'B', exact: true })).toBeVisible();
    });
  });

  test('zen: gợi ý phím chỉ hiện ở lần vào đầu tiên', async ({ page }) => {
    await zenOn(page, FIVE, 'alpha', false);
    await expect(page.locator('.zc-hint')).toContainText('Alt+V');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mdprev-md-zen') ?? '{}').hinted)).toBe(true);
    await page.keyboard.press('Escape'); // thoát zen rồi vào lại
    await page.keyboard.press('f');
    await enterZenWrite(page);
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator('.md-doc h1')).toBeVisible();
    await ta(page).focus();
    await page.keyboard.press('Escape'); await page.keyboard.press('f');
    await expect(page.locator('.zc-corner')).toBeVisible();
    await expect(page.locator('.zc-hint')).toHaveCount(0);
  });

  test.describe('cảm ứng', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 760 } });
    test('zen: chạm vào nút trong card (Safari/iOS không focus nút khi chạm) vẫn đổi được và card không tắt', async ({ page }) => {
      await page.goto(URL_);
      await ta(page).fill(FIVE);
      await expect(page.locator('.pv-modetag')).toHaveText('READY');
      await select(page, 'alpha');
      await page.keyboard.press('Escape');
      await page.keyboard.press('f');
      await enterZenWrite(page); // Zen mở ở Read; 'Word goal' chỉ dùng được ở Write (ở Read hàng đó bị tắt)
      await expect(page.locator('.zc-corner')).toHaveClass(/\bon\b/);
      await page.locator('.zc-more').tap();
      await zSeg(page, 'Word goal', '300').tap();
      await expect(zSeg(page, 'Word goal', '300')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.zc-menu')).toBeVisible(); // chạm vào card không làm card tắt
      await page.getByRole('button', { name: 'Read', exact: true }).tap();
      await expect(page.locator('.pv')).toHaveAttribute('data-zread', '1');
    });
  });

  test('zen: gõ trong dải giữa không làm khung giật; xuống dòng đủ xa thì cuộn lại về giữa; thoát zen báo tóm tắt phiên', async ({ page }) => {
    test.slow(); // WebKit trên máy này chậm gấp vài lần khi chạy song song
    const para = (i: number) => `P${i} ` + 'word '.repeat(60);
    await zenOn(page, ['# Title', ...Array.from({ length: 30 }, (_, i) => para(i))].join('\n\n'), 'P15 ');
    await page.waitForTimeout(400);
    const top0 = await ta(page).evaluate((t: HTMLTextAreaElement) => t.scrollTop);
    expect(top0).toBeGreaterThan(500);
    await page.keyboard.type('hello world');
    await page.waitForTimeout(500);
    await expect(ta(page)).toHaveValue(/\nhello worldword word/); // chữ vừa gõ không bị ghi đè lại bởi lần render cũ
    expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(0, t.selectionStart).endsWith('hello world'))).toBe(true);
    expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.scrollTop)).toBe(top0); // con trỏ vẫn trong dải giữa
    await page.keyboard.press('Control+End'); // nhảy xa: phải cuộn theo
    await page.waitForTimeout(900);
    expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.scrollTop)).toBeGreaterThan(top0 + 300);
    await page.keyboard.type(' zebra yak ant fox ');
    await page.waitForTimeout(1500); // chờ bản đếm chữ (debounce)
    await page.keyboard.press('Escape');
    await expect(page.locator('.pv-flash')).toContainText(/Zen session: \+\d+ words/);
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const face of ['write', 'read'] as const) {
      test(`axe sạch trong zen (${theme}, mặt ${face})`, async ({ page }) => {
        await page.addInitScript((t) => { try { localStorage.setItem('mdprev-theme', t); } catch { /* bỏ qua */ } }, theme);
        await zenOn(page, FIVE, 'alpha');
        if (face === 'read') await page.keyboard.press('Alt+v');
        await page.waitForTimeout(300);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations).toEqual([]);
      });
    }
  }

  test('zen với tài liệu 3000 dòng: không có tác vụ dài kéo lê khi gõ', async ({ page }) => {
    test.slow(); // WebKit trên máy này chậm gấp vài lần khi chạy song song
    await open(page, Array.from({ length: 3000 }, (_, i) => `line ${i} lorem ipsum dolor sit amet`).join('\n'));
    await select(page, 'line 1500');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await enterZenWrite(page);
    await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(e.duration); }).observe({ entryTypes: ['longtask'] }); });
    for (let i = 0; i < 10; i++) await page.keyboard.type('x');
    await page.waitForTimeout(300);
    const worst = await page.evaluate(() => Math.max(0, ...(window as unknown as { __lt: number[] }).__lt));
    console.log('zen 3000 dòng, tác vụ dài nhất (ms):', worst);
    expect(worst).toBeLessThan(250);
  });

  test('IME: Esc khi đang soạn dở (isComposing) không rời ô soạn và không thoát zen', async ({ page }) => {
    await open(page, 'xin chao');
    await ta(page).focus();
    await ta(page).evaluate((t: HTMLTextAreaElement) => t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, keyCode: 229, bubbles: true })));
    await expect(ta(page)).toBeFocused();
  });

  test('xuất .html đứng riêng: đúng nội dung, đủ biến màu, mở được độc lập', async ({ page, browser }) => {
    await open(page);
    await exportMenu(page).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTML (.html)' }).click()]);
    expect(dl.suggestedFilename()).toBe('project-notes.html');
    const path = test.info().outputPath('export.html'); // đuôi .html để file:// phục vụ đúng kiểu nội dung
    await dl.saveAs(path);
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/<main class="md-doc"( data-doc="paper")?>/); // mặc định giờ là kiểu paper (serif)
    expect(text).toMatch(/--bg:\s*[^;]+;/);
    expect(text).not.toMatch(/<[^>]+\sdata-line=/);
    expect(text).not.toMatch(/<button[^>]*cb-copy/);
    const p2 = await (await browser.newContext()).newPage();
    await p2.goto('file://' + path);
    await expect(p2.locator('.md-doc h1')).toBeVisible();
    expect(await p2.evaluate(() => getComputedStyle(document.body.parentElement!).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('menu EXPORT: chép rich text hoạt động cả khi không có Clipboard API', async ({ page }) => {
    await open(page);
    await exportMenu(page).click();
    await page.getByRole('button', { name: 'Copy rich text' }).click();
    await expect(page.locator('.pv-flash')).toHaveText('Copied rich text');
    await exportMenu(page).click();
    await page.locator('.pv-title').click();
    await expect(page.locator('.pv-menu')).toHaveCount(0);
  });

  test('bản in chỉ còn tài liệu', async ({ page }) => {
    await open(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.pv-src')).toBeHidden();
    await expect(page.locator('.pv-tools')).toBeHidden();
    await expect(page.locator('.md-doc')).toBeVisible();
  });

  test('chuyển Split / Edit / Read', async ({ page }) => {
    await open(page);
    await expect(page.locator('.pv-src')).toBeVisible();
    await expect(page.locator('.pv-view')).toBeVisible();
    await expect(viewTab(page, 'Split')).toHaveAttribute('aria-pressed', 'true');
    await viewTab(page, 'Edit').click();
    await expect(page.locator('.pv-view')).toBeHidden();
    await viewTab(page, 'Read').click();
    await expect(page.locator('.pv-src')).toBeHidden();
    await expect(page.getByRole('button', { name: /Bold/ })).toBeHidden(); // thanh định dạng nằm trong pane Editor nên ẩn ở Read
  });

  test('ZEN trong khối chế độ xem bật và tắt zen', async ({ page }) => {
    await open(page);
    await viewTab(page, 'Zen').click();
    await expect(page.locator('html')).toHaveAttribute('data-focus', '1');
    await expect(viewTab(page, 'Zen')).toBeHidden(); // thanh ẩn trong zen
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-focus', '1');
    await expect(viewTab(page, 'Zen')).toHaveAttribute('aria-pressed', 'false');
  });

  test('menu FILE: New xoá, Sample nạp lại', async ({ page }) => {
    await open(page, 'something else');
    page.on('dialog', (d) => d.accept());
    await newDocument(page);
    await expect(ta(page)).toHaveValue('');
    await fileMenu(page).click();
    await page.getByRole('button', { name: 'Sample' }).click();
    await expect(page.locator('.md-doc h1').first()).toHaveText('Better meetings');
  });

  test('đổi tên file: dùng cho file tải về và được nhớ', async ({ page }) => {
    await open(page);
    const name = page.getByRole('textbox', { name: 'File name' });
    await expect(name).toHaveValue('project-notes.md');
    await name.fill('draft/my:notes');
    await name.press('Enter');
    await expect(name).toHaveValue('draft-my-notes.md');
    await exportMenu(page).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTML (.html)' }).click()]);
    expect(dl.suggestedFilename()).toBe('draft-my-notes.html');
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue('draft-my-notes.md');
    await name.fill(''); await name.press('Enter'); // trống: về tên suy ra từ heading
    await expect(name).toHaveValue('project-notes.md');
  });

  test('rộng bằng cửa sổ và cao vừa cửa sổ, không bị khung blog 1280px giới hạn', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await open(page);
    const m = await page.evaluate(() => { const r = document.querySelector('.pv')!.getBoundingClientRect(); const b = document.querySelector('.pv-mode')!.getBoundingClientRect(); return { w: r.width, bottom: b.bottom }; });
    expect(m.w).toBeGreaterThan(1800);
    expect(m.bottom).toBeLessThanOrEqual(1000);
    expect(m.bottom).toBeGreaterThan(900);
    await page.setViewportSize({ width: 1200, height: 700 });
    await expect.poll(() => page.evaluate(() => document.querySelector('.pv-mode')!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(700);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe sạch (${theme}) với Inspector Outline, nút Checks báo lỗi, đủ loại token`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('mdprev-theme', t); } catch { /* bỏ qua */ } }, theme);
      await open(page, '---\ntitle: x\n---\n\n# A\n\n## B **bold** *it* ~~st~~ `code` [l](https://x.dev) <https://y.dev> <b>tag</b> note[^1] \\* esc\n\n> quote\n\n- [x] done\n- [ ] open\n1. n\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n---\n\n```ts\nconst a = "s" + 1; // c\n```\n\n```json\n{ "k": "v", "n": 2 }\n```\n\n```sh\nls --all # c\n```\n\n```markdown\n# nested **b**\n```\n\n[^1]: footnote\n\ntrailing   \n');
      await openInspector(page, 'Outline');
      await ta(page).focus();
      await expect(page.locator('.pv-chk .pv-warn')).toBeVisible();
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations).toEqual([]);
    });
  }
});

// ---- đợt nâng cấp: hiệu năng, soạn thông minh, find, lưu file, chia sẻ, dấu thay đổi... ----
const long = (n: number) => { let md = '# Long\n\n'; let i = 0; while (md.split('\n').length < n) md += `## Section ${++i}\n\n### Considerations\n\n- item a with \`code\` and **bold**\n- item b [link](https://x.dev)\n\n| Issue | Check |\n|-------|-------|\n| a | b |\n\nParagraph text for section ${i}, long enough to look like real prose in a document.\n\n`; return md; };

test.describe('studio nâng cấp', () => {
  test('tài liệu 3000 dòng: chỉ dựng phần đang thấy, gõ vẫn mượt', async ({ page }) => {
    await open(page);
    await ta(page).fill(long(3000));
    await expect(page.locator('.pv-modetag')).toHaveText('READY', { timeout: 15000 });
    expect(await page.locator('.ed-hl .l').count()).toBeLessThan(300);
    expect(await page.locator('.ed-gutwin div').count()).toBeLessThan(300);
    const t = await page.evaluate(async () => { const e = document.querySelector('.ed-ta') as HTMLTextAreaElement; e.focus(); e.setSelectionRange(e.value.length, e.value.length); const ts: number[] = []; for (let i = 0; i < 20; i++) { const t0 = performance.now(); document.execCommand('insertText', false, 'x'); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b); return ts[10]!; });
    expect(t).toBeLessThan(110); // trước khi cửa sổ hoá: ~173ms
    // cuộn tới cuối: lề số dòng và lớp tô vẫn theo kịp
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.scrollTop = e.scrollHeight; });
    await expect(page.locator('.ed-hl .l').last()).toContainText('x');
    await expect.poll(async () => Number(await page.locator('.ed-gutwin div').last().innerText()), { timeout: 5000 }).toBeGreaterThan(2900); // cửa sổ dựng bám theo cuộn sau một khung hình
  });

  test('Enter tiếp tục danh sách, Tab thụt mục, Enter ở mục trống thoát, Ctrl+Z lùi từng bước', async ({ page }) => {
    await open(page, '- one');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(5, 5); });
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('nested');
    await expect(ta(page)).toHaveValue('- one\n- two\n  - nested');
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await expect(ta(page)).toHaveValue('- one\n- two\n  - nested\n- ');
    await page.keyboard.press('Enter');
    await expect(ta(page)).toHaveValue('- one\n- two\n  - nested\n');
    await page.keyboard.press('Control+z');
    await expect(ta(page)).toHaveValue('- one\n- two\n  - nested\n- ');
  });

  test('gõ * lên vùng chọn thì bọc; không tự đóng ngoặc khi không chọn (Telex)', async ({ page }) => {
    await open(page, 'one two');
    await select(page, 'two');
    await page.keyboard.type('*');
    await expect(ta(page)).toHaveValue('one *two*');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
    await page.keyboard.type('[');
    await expect(ta(page)).toHaveValue('one *two*[');
  });

  test('find: đếm, đánh dấu, Enter sang kết quả kế, thay thế, regex sai, Esc đóng', async ({ page, browserName }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch {} });
    await open(page, 'foo bar foo\nbaz foo\n');
    await page.getByRole('button', { name: /^find/ }).click();
    const q = page.getByRole('textbox', { name: 'Find', exact: true });
    await q.fill('foo');
    await expect(page.locator('.pv-fcount')).toHaveText('1/3');
    await expect(page.locator('.ed-find')).toHaveCount(3);
    await expect(page.locator('.ed-find.on')).toHaveCount(1);
    // hộp đánh dấu trùng khít với chữ trong lớp tô màu
    const [bx, tx] = await page.evaluate(() => { const b = document.querySelector('.ed-find')!.getBoundingClientRect(); const l = document.querySelector('.ed-hl .l')!; const r = document.createRange(); r.setStart(l.firstChild!, 0); r.setEnd(l.firstChild!, 3); const t = r.getBoundingClientRect(); return [[b.left, b.width], [t.left, t.width]]; });
    expect(Math.abs(bx![0]! - tx![0]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(bx![1]! - tx![1]!)).toBeLessThanOrEqual(1);
    await q.press('Enter');
    await expect(page.locator('.pv-fcount')).toHaveText('2/3');
    await page.getByRole('textbox', { name: 'Replace with' }).fill('X');
    await page.getByRole('button', { name: 'replace all' }).click();
    await expect(ta(page)).toHaveValue('X bar X\nbaz X\n');
    await page.getByRole('button', { name: '.*' }).click();
    await q.fill('(');
    await expect(page.locator('.pv-fcount')).toHaveText('invalid regex');
    await q.press('Escape');
    await expect(page.locator('.pv-find')).toHaveCount(0);
    await page.keyboard.press('Control+z'); // thay tất cả là một bước undo
    if (browserName === 'webkit') await page.keyboard.press('Control+z'); // WebKit dùng chung ngăn xếp undo cho cả ô Find: bước đầu hoàn tác chữ '(' vừa gõ ở ô Find
    await expect(ta(page)).toHaveValue('foo bar foo\nbaz foo\n');
  });

  test('find regex với $1 và Ctrl+F trong ô soạn', async ({ page }) => {
    await open(page, 'a1 b2\n');
    await ta(page).focus();
    await page.keyboard.press('Control+f');
    await expect(page.getByRole('textbox', { name: 'Find', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '.*' }).click();
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('([a-z])(\\d)');
    await page.getByRole('textbox', { name: 'Replace with' }).fill('$2$1');
    await expect(page.locator('.pv-fcount')).toHaveText('1/2'); // regex chạy trong worker: đợi có kết quả
    await page.getByRole('button', { name: 'replace all' }).click();
    await expect(ta(page)).toHaveValue('1a 2b\n');
  });

  test('New mở tab mới; Alt+1 / Alt+2 đi lại giữa hai tài liệu', async ({ page }) => {
    await open(page, '# Keep me\n');
    await newDocument(page);
    await expect(ta(page)).toHaveValue('');
    await page.keyboard.press('Alt+1');
    await expect(ta(page)).toHaveValue('# Keep me\n');
    await page.keyboard.press('Alt+2');
    await expect(ta(page)).toHaveValue('');
  });

  test('mở và lưu đè file trên máy (File System Access): chấm chưa lưu, ⌘S ghi đúng file', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __disk: string; showOpenFilePicker: () => Promise<unknown[]> };
      w.__disk = '# On disk\n\nhello\n';
      const handle = { name: 'on-disk.md', getFile: async () => new File([w.__disk], 'on-disk.md'), createWritable: async () => { let buf = ''; return { write: async (d: string) => { buf += d; }, close: async () => { w.__disk = buf; } }; } };
      w.showOpenFilePicker = async () => [handle];
    });
    await open(page);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Open…' }).click();
    await expect(docName(page)).toContainText('on-disk');
    await expect(ta(page)).toHaveValue('# On disk\n\nhello\n');
    await expect(page.getByRole('img', { name: 'Unsaved changes' })).toHaveCount(0);
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
    await page.keyboard.type('more');
    await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect(page.locator('.pv-flash')).toHaveText('Saved on-disk.md');
    await expect(page.getByRole('img', { name: 'Unsaved changes' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __disk: string }).__disk)).toBe('# On disk\n\nhello\nmore');
  });

  test('link chia sẻ: mở #d=… nạp tài liệu và cất bản cũ; link hỏng báo lỗi; nút Copy share link chạy', async ({ page }) => {
    const { Buffer } = await import('node:buffer');
    const { deflateRawSync } = await import('node:zlib');
    const payload = Buffer.from(deflateRawSync(Buffer.from('# Shared doc\n\nbody\n'))).toString('base64url');
    await open(page, '# Mine\n\nwork in progress\n');
    await page.goto(`${URL_}#d=${payload}`); // chỉ đổi #hash trong cùng trang: vẫn phải nạp
    await page.getByRole('alertdialog', { name: 'Open shared document' }).getByRole('button', { name: 'OPEN' }).click(); // hỏi trước khi thay bản đang soạn
    await expect(page.locator('.md-doc h1')).toHaveText('Shared doc');
    await expect(page).toHaveURL(/\/app\/$/); // hash đã được xoá
    await page.locator('.pv-tabgo').first().click(); // bản đang soạn trước đó vẫn ở tab của nó
    await expect(page.locator('.md-doc h1')).toHaveText('Mine');
    await page.goto(`${URL_}#d=!!!bad`);
    await page.goto(`${URL_}#d=AAAA`);
    await expect(page.locator('.pv-flash')).toHaveText('Invalid share link');
    await exportMenu(page).click();
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.locator('.pv-flash')).toHaveText('Copied share link');
  });

  test('link chia sẻ: CANCEL giữ nguyên bản đang soạn; ảnh ngoài bị chặn tới khi bấm LOAD IMAGES, kể cả sau khi tải lại', async ({ page }) => {
    const { Buffer } = await import('node:buffer');
    const { deflateRawSync } = await import('node:zlib');
    const enc = (t: string) => Buffer.from(deflateRawSync(Buffer.from(t))).toString('base64url');
    const ext: string[] = [];
    await page.route('https://img.example/**', (r) => { ext.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') }); });
    await open(page, '# Mine\n\nwork\n');
    await page.goto(`${URL_}#d=${enc('# Other\n')}`);
    await page.getByRole('alertdialog', { name: 'Open shared document' }).getByRole('button', { name: 'CANCEL' }).click();
    await expect(page.locator('.md-doc h1')).toHaveText('Mine');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.goto(`${URL_}#d=${enc('# Pics\n\n![logo](https://img.example/a.gif) ![local](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)\n')}`);
    await page.getByRole('alertdialog', { name: 'Open shared document' }).getByRole('button', { name: 'OPEN' }).click();
    await expect(page.locator('.md-doc h1')).toHaveText('Pics');
    await expect(page.locator('.md-doc .md-img-blocked')).toHaveText('Image blocked: logo');
    await expect(page.locator('.md-doc img[alt="local"]')).toHaveCount(1); // ảnh data: không bị chặn
    await page.reload();
    await expect(page.locator('.md-doc .md-img-blocked')).toHaveCount(1); // vẫn chặn sau khi tải lại
    expect(ext).toEqual([]);
    await page.getByRole('button', { name: 'LOAD IMAGES' }).click();
    await expect(page.locator('.md-doc img[alt="logo"]')).toHaveCount(1);
    await expect.poll(() => ext.length).toBeGreaterThan(0);
  });

  test('cuộn hai chiều: kéo bản xem thì editor đi theo, và không kéo nhau vòng tròn', async ({ page }) => {
    await open(page);
    await ta(page).fill(long(600));
    await expect(page.locator('.pv-modetag')).toHaveText('READY');
    await page.locator('.pv-out').hover();
    await page.mouse.wheel(0, 2500);
    await expect.poll(() => ta(page).evaluate((e: HTMLTextAreaElement) => e.scrollTop)).toBeGreaterThan(500);
    const a = await ta(page).evaluate((e: HTMLTextAreaElement) => e.scrollTop);
    await page.waitForTimeout(600);
    expect(Math.abs((await ta(page).evaluate((e: HTMLTextAreaElement) => e.scrollTop)) - a)).toBeLessThan(2); // đứng yên, không trôi
    // chiều ngược lại vẫn chạy
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.scrollTop = 0; });
    await expect.poll(() => page.locator('.pv-out').evaluate((e) => e.scrollTop)).toBeLessThan(40);
  });

  test('dấu thay đổi ở lề số dòng: sửa và thêm so với bản đã nạp', async ({ page }) => {
    await open(page); // bản mẫu vừa nạp: chưa có thay đổi
    await expect(page.locator('.ed-gutwin .ga, .ed-gutwin .gm, .ed-gutwin .gd')).toHaveCount(0);
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(0, 0); });
    await page.keyboard.type('NEW ');
    await expect(page.locator('.ed-gutwin .gm')).toHaveCount(1);
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
    await page.keyboard.type('\nextra line');
    await expect(page.locator('.ed-gutwin .ga')).toHaveCount(1);
  });

  test('spell: off → en, lưu lại; width: narrow ↔ wide', async ({ page }) => {
    await open(page);
    await expect(ta(page)).toHaveAttribute('spellcheck', 'false');
    const view = (item: string) => viewOptions(page).click().then(() => page.getByRole('button', { name: new RegExp('^' + item) }).click());
    await view('English');
    await expect(ta(page)).toHaveAttribute('spellcheck', 'true');
    await page.reload();
    await expect(ta(page)).toHaveAttribute('spellcheck', 'true');
    await viewOptions(page).click();
    await expect(page.getByRole('button', { name: /^English/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^Vietnamese/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Wide/ }).click();
    await expect(page.locator('.pv')).toHaveClass(/pv-wide/);
    await page.reload();
    await expect(page.locator('.pv')).toHaveClass(/pv-wide/);
  });

  test('phím ? hiện thêm bảng phím riêng của studio', async ({ page }) => {
    await page.goto(URL_);
    await ready(page);
    await page.locator('.pv-mode').click(); // bỏ focus khỏi mọi ô nhập
    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('jump to heading');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('command palette'); // phím chung của app vẫn có
  });

  test('Jump to: lọc heading theo chữ không dấu, mũi tên và Enter nhảy tới, Inspector liệt kê mọi cấp', async ({ page }) => {
    await open(page, '# Top\n\n## Phần Một\n\n' + 'x\n\n'.repeat(40) + '## Phần Hai\n\n#### Deep one\n\n' + 'y\n\n'.repeat(40));
    await page.locator('.pv-mode').click();
    await page.keyboard.press('o'); // mở Inspector ở tab Outline và focus ô lọc
    const box = page.getByRole('textbox', { name: 'Filter headings' });
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    await expect(box).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Outline' }).getByRole('button')).toHaveText(['Top', '└ Phần Một', '└ Phần Hai', '└ Deep one']); // Inspector liệt kê mọi cấp
    await box.fill('phan hai');
    await expect(page.getByRole('navigation', { name: 'Outline' }).getByRole('button')).toHaveText(['└ Phần Hai']);
    await box.fill('deep');
    await expect(page.getByRole('navigation', { name: 'Outline' }).getByRole('button')).toHaveText(['└ Deep one']); // lọc thì thấy cả h4
    await box.press('Enter');
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible(); // panel cố định, không đóng
    await expect.poll(() => ta(page).evaluate((e: HTMLTextAreaElement) => e.value.slice(0, e.selectionStart).split('\n').length)).toBe(2 + 2 + 40 * 2 + 2 + 1);
  });

  test('outline (dưới 900px): phím o mở Inspector Outline, Esc trong ô lọc trả focus về ô soạn', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto(URL_);
    await ta(page).click();
    await page.keyboard.press('Control+Shift+o');
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();
    await expect(page.locator('.pv-outline .pv-railq')).toBeFocused(); // ô lọc nhận focus (Inspector nạp lười) rồi mới nhấn Esc
    await page.keyboard.press('Escape');
    await expect(ta(page)).toBeFocused();
  });

  test('lint: nút sửa khoảng trắng cuối dòng, một bước undo', async ({ page }) => {
    await open(page, 'a  \nb \nc   \n');
    const insp = await openInspector(page, 'Checks');
    await expect(insp.locator('.pv-insp-issue').first()).toContainText('Trailing whitespace');
    await insp.getByRole('button', { name: /^Fix 2 trailing/ }).click();
    await expect(ta(page)).toHaveValue('a  \nb\nc\n');
    await expect(page.locator('.pv-chk')).toContainText('No issues');
    await page.keyboard.press('Control+z');
    await expect(ta(page)).toHaveValue('a  \nb \nc   \n');
  });

  test('rời khỏi bảng chưa căn thì tự căn lại (một bước undo riêng)', async ({ page }) => {
    await open(page, '| a | bb |\n|-|-|\n| 1 | 2 |\n\ntext\n');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(2, 2); });
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await expect(ta(page)).toHaveValue('| a   | bb  |\n| --- | --- |\n| 1   | 2   |\n\ntext\n');
  });

  test('tên file vừa phải không bị cắt', async ({ page }) => {
    await open(page);
    const name = page.getByRole('textbox', { name: 'File name' });
    await name.fill('a-fairly-long-name-here.md'); // tên rất dài (hơn ~35 ký tự) được rút gọn bằng dấu ba chấm vì header còn cụm New/Open/Inspect; tên thường thì hiện đủ
    await name.press('Enter');
    const [sw, cwid] = await name.evaluate((e: HTMLInputElement) => [e.scrollWidth, e.clientWidth]);
    expect(sw!).toBeLessThanOrEqual(cwid! + 1);
  });

  test('màu cú pháp: mỗi loại thành phần có màu riêng, gồm cả code trong khối fence', async ({ page }) => {
    await open(page, '# H\n\n> q\n\n- [x] done\n- [ ] open\n\n`c` [l](https://x.dev) **b**\n\n```ts\nconst a = "s"; // c\n```\n');
    const color = (sel: string) => page.locator(`.ed-hl ${sel}`).first().evaluate((e) => getComputedStyle(e).color);
    const set = new Set([await color('.h:not(.mk)'), await color('.qm'), await color('.task-done'), await color('.task-open'), await color('.code'), await color('.link'), await color('.ck'), await color('.cs'), await color('.cc')]);
    expect(set.size).toBeGreaterThanOrEqual(6); // ít nhất 6 màu khác nhau
  });

  test('mở file bằng ô chọn file giữ đúng tên: hiện trong ô tên và dùng cho file xuất ra', async ({ page }) => {
    await open(page);
    await page.locator('input[type=file]').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Something else\n\nbody\n') });
    await expect(page.locator('.md-doc h1')).toHaveText('Something else');
    await expect(docName(page)).toContainText('notes');
    await exportMenu(page).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTML (.html)' }).click()]);
    expect(dl.suggestedFilename()).toBe('notes.html');
    await page.reload();
    await expect(docName(page)).toContainText('notes');
  });

  test('màn ≥1700px: cỡ dòng 25px từ CSS, lớp tô và lề số vẫn thẳng hàng', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch {} });
    await page.setViewportSize({ width: 1920, height: 1000 });
    await open(page, ('line with `code` and **bold**\n\n').repeat(30));
    expect(await ta(page).evaluate((e) => getComputedStyle(e).lineHeight)).toBe('25px');
    const r = await page.evaluate(() => { const nums = [...document.querySelectorAll('.ed-gutwin div')]; const pre = document.querySelector('.ed-hl') as HTMLElement; const lh = parseFloat(getComputedStyle(pre).lineHeight); const top = pre.getBoundingClientRect().top + parseFloat(getComputedStyle(pre).paddingTop); return { lh, rows: [0, 10, 25].map((i) => [nums[i]!.getBoundingClientRect().top, top + i * lh]) }; });
    expect(r.lh).toBe(25);
    for (const [n, l] of r.rows) expect(Math.abs(n! - l!)).toBeLessThanOrEqual(1);
    // vạch dòng hiện tại cũng theo cỡ dòng mới
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(e.value.indexOf('\n\n') + 2, e.value.indexOf('\n\n') + 2); });
    const cur = await page.evaluate(() => { const c = document.querySelector('.ed-cur') as HTMLElement; return [c.getBoundingClientRect().height, c.style.top]; });
    expect(cur[0]).toBe(25);
    expect(cur[1]).toBe('66px'); // dòng thứ 3: 16 + 2 * 25
  });

  test('find: hộp đánh dấu khớp chữ khi dòng có tab', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch {} });
    await open(page, 'a\tfoo\n\t\tbar foo\n');
    await page.getByRole('button', { name: /^find/ }).click();
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('foo');
    const d = await page.evaluate(() => { const boxes = [...document.querySelectorAll('.ed-find')].map((b) => b.getBoundingClientRect()); const ls = [...document.querySelectorAll('.ed-hl .l')]; return [0, 1].map((i) => { const l = ls[i]!; const t = l.firstChild as Text; const at = t.data.indexOf('foo'); const r = document.createRange(); r.setStart(t, at); r.setEnd(t, at + 3); const g = r.getBoundingClientRect(); return [Math.abs(boxes[i]!.left - g.left), Math.abs(boxes[i]!.width - g.width)]; }); });
    for (const [dl, dw] of d) { expect(dl!).toBeLessThanOrEqual(1); expect(dw!).toBeLessThanOrEqual(1); }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe sạch (${theme}) với thanh find, Inspector Properties, jump đang lọc, chấm chưa lưu`, async ({ page }) => {
      await page.addInitScript((t) => {
        try { localStorage.setItem('mdprev-theme', t); } catch { /* bỏ qua */ }
        const w = window as unknown as { showOpenFilePicker: () => Promise<unknown[]> };
        const h = { name: 'a.md', getFile: async () => new File(['---\nname: a\ndescription: d\n---\n\n# Title\n\n## Alpha\n\ntext foo\n'], 'a.md'), createWritable: async () => ({ write: async () => undefined, close: async () => undefined }) };
        w.showOpenFilePicker = async () => [h];
      }, theme);
      await open(page);
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('button', { name: 'Open…' }).click();
      await expect(page.locator('.md-doc h1')).toHaveText('Title');
      await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); });
      await page.keyboard.type(' edited');
      await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
      await page.getByRole('button', { name: /^find/ }).click();
      await page.getByRole('textbox', { name: 'Find', exact: true }).fill('foo');
      await expect(page.locator('.ed-find.on')).toHaveCount(1);
      await openInspector(page, 'Properties'); // thay cho front-matter mở trong preview
      await expect(page.locator('table.pv-insp-props')).toBeVisible();
      const r0 = await new AxeBuilder({ page }).analyze();
      expect(r0.violations).toEqual([]);
      await openInspector(page, 'Outline');
      await page.getByRole('textbox', { name: 'Filter headings' }).fill('a');
      await expect(page.locator('.pv-ol.sel')).toHaveCount(1);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations).toEqual([]);
    });
  }
});

// ---- đợt 3: transform, lint liên kết, nhớ trạng thái, báo lưu, lệnh Palette, pop-out ----
test.describe('studio: transform, trạng thái, palette, pop-out', () => {
  const menu = (page: Page, name: string) => page.getByRole('button', { name }).first();

  /** Chạy một lệnh Palette (vd '>transform sort lines'); vùng chọn trong ô soạn được giữ. */
  const runCmd = async (page: Page, q: string) => {
    await page.locator('.pv-mode').click();
    await page.keyboard.press('/');
    const box = page.getByRole('dialog').getByRole('textbox');
    await box.fill(q);
    await box.press('Enter');
  };
  // thanh nổi là aria-hidden (chỉ cho chuột/cảm ứng) nên không tìm bằng role; đường bàn phím là Palette
  const selbarMore = (page: Page) => page.locator('.pv-selbar [aria-label="More transforms"]');
  const selItem = (page: Page, name: string) => page.locator('.pv-selmenu [role="menuitem"]', { hasText: name });

  test('Transform: sắp xếp dòng (thanh nổi), Title Case và báo khi chưa chọn dòng (Palette), một bước undo', async ({ page }) => {
    await open(page, 'banana\napple\ncherry\n');
    await select(page, 'banana\napple\ncherry');
    await selbarMore(page).click();
    await selItem(page, 'Sort lines A→Z').click();
    await expect(ta(page)).toHaveValue('apple\nbanana\ncherry\n');
    await page.keyboard.press('Control+z');
    await expect(ta(page)).toHaveValue('banana\napple\ncherry\n');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(2, 2); });
    await runCmd(page, '>transform sort lines a');
    await expect(page.locator('.pv-flash')).toHaveText('Select the lines first');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(2, 2); });
    await runCmd(page, '>transform title case');
    await expect(ta(page)).toHaveValue('Banana\napple\ncherry\n'); // không chọn: dòng hiện tại
  });

  test('Transform: wrap 80 cột rồi unwrap trả về nguyên văn (Palette)', async ({ page }) => {
    const para = 'The quick brown fox jumps over the lazy dog and keeps running through the forest until night falls.';
    await open(page, para + '\n');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(3, 3); });
    await runCmd(page, '>transform wrap at 80');
    expect((await ta(page).inputValue()).split('\n').filter(Boolean).length).toBe(2);
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(3, 3); });
    await runCmd(page, '>transform unwrap');
    await expect(ta(page)).toHaveValue(para + '\n');
  });

  test('thanh nổi: ⋯ có đủ 5 mục Transform và "All transforms…" mở Palette', async ({ page }) => {
    await open(page, 'banana\napple\ncherry\n');
    await select(page, 'banana\napple\ncherry');
    await expect(page.getByRole('button', { name: /TRANSFORM/ })).toHaveCount(0); // menu cũ trên thanh tài liệu đã bỏ
    await selbarMore(page).click();
    const items = page.locator('.pv-selmenu [role="menuitem"]');
    await expect(items).toHaveText(['Sort lines A→Z', 'Remove duplicate lines', 'Title Case', 'Wrap at 80 columns', 'Curly quotes', 'All transforms…']);
    await selItem(page, 'All transforms…').click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue('>transform');
  });

  test('lint liên kết: anchor không có, tham chiếu thiếu, chú thích thiếu', async ({ page }) => {
    await open(page, '# Title\n\n[ok](#title) [bad](#nope)\n\nsee [x][missing] and a note[^1]\n');
    await expect(page.locator('.pv-chk')).toContainText('3 issues');
    const insp = await openInspector(page, 'Checks');
    const items = insp.locator('.pv-insp-issue');
    await expect(items).toHaveCount(3);
    const all = (await items.allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
    expect(all).toContain('Anchor "#nope" not found');
    expect(all).toContain('Reference [missing] has no definition');
    expect(all).toContain('Footnote [^1] has no definition');
  });

  test('nhớ trạng thái: con trỏ, cuộn, chế độ xem, front-matter mở; tài liệu đã đổi thì không khôi phục con trỏ', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('mdprev-md-wrap', '0'); } catch {} });
    await open(page);
    await ta(page).fill(long(400));
    await expect(page.locator('.pv-modetag')).toHaveText('READY');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); const i = e.value.indexOf('Section 20'); e.setSelectionRange(i, i); e.scrollTop = 3000; });
    await viewTab(page, 'Edit').click();
    await page.waitForTimeout(900); // chờ ghi trạng thái (debounce 500ms)
    const before = await ta(page).evaluate((e: HTMLTextAreaElement) => [e.selectionStart, Math.round(e.scrollTop)]);
    await page.reload();
    await expect(page.locator('.ed-ta')).toBeVisible();
    await expect(viewTab(page, 'Edit')).toHaveAttribute('aria-pressed', 'true');
    const after = await ta(page).evaluate((e: HTMLTextAreaElement) => [e.selectionStart, Math.round(e.scrollTop)]);
    expect(after[0]).toBe(before[0]);
    expect(Math.abs(after[1]! - before[1]!)).toBeLessThan(30);
    await expect(page.locator('.pv-mode')).toContainText(`Ln ${await ta(page).evaluate((e: HTMLTextAreaElement) => e.value.slice(0, e.selectionStart).split('\n').length)}`);
    // trạng thái cũ nhưng tài liệu khác độ dài thì chỉ giữ chế độ xem, không đặt con trỏ bậy
    await page.waitForTimeout(900); // để lần ghi trạng thái đang chờ xong, tránh ghi đè bản sửa tay bên dưới
    await page.evaluate(() => { const u = JSON.parse(localStorage.getItem('mdprev-md-ui')!); u.n = 1; localStorage.setItem('mdprev-md-ui', JSON.stringify(u)); });
    await page.reload();
    await expect(page.locator('.ed-ta')).toBeVisible();
    expect(await ta(page).evaluate((e: HTMLTextAreaElement) => e.selectionStart)).toBe(0);
  });

  test('fence có tên ngôn ngữ trùng khoá của Object.prototype vẫn dựng được bản xem', async ({ page }) => {
    await open(page, '# T\n\n```constructor\nx\n```\n\n```__proto__\ny\n```\n\nsau khối code\n');
    await expect(page.locator('.md-doc pre')).toHaveCount(2);
    await expect(page.locator('.md-doc')).toContainText('sau khối code');
  });

  test('báo lưu: hiện giờ lưu; localStorage từ chối thì báo NOT SAVED', async ({ page }) => {
    await open(page);
    await ta(page).fill('# changed\n');
    await expect(page.locator('.pv-svt')).toHaveText(/^Saved \d\d:\d\d$/);
    await page.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k: string, v: string) { if (k === 'mdprev-md') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await ta(page).fill('# changed again\n');
    await expect(page.getByText(/Not saved/)).toBeVisible();
  });

  test('Palette: lệnh studio chỉ hiện ở trang này, chạy được (zen, transform)', async ({ page }) => {
    await open(page, 'hello world\n');
    await page.locator('.pv-mode').click();
    await page.keyboard.press('/');
    const box = page.getByRole('dialog').getByRole('textbox');
    await box.fill('>zen');
    await expect(page.getByRole('dialog')).toContainText('Zen mode');
    await box.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-focus', '1');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.focus(); e.setSelectionRange(0, 11); });
    await page.locator('.pv-mode').click();
    await page.keyboard.press('/');
    await page.getByRole('dialog').getByRole('textbox').fill('>transform uppercase');
    await page.getByRole('dialog').getByRole('textbox').press('Enter');
    await expect(ta(page)).toHaveValue('HELLO WORLD\n');
  });

  test('pop-out: cửa sổ xem cập nhật theo editor, theo kịp cuộn, và nhận nội dung dù mở trước', async ({ page, context }) => {
    await open(page);
    const [pop] = await Promise.all([context.waitForEvent('page'), viewOptions(page).click().then(() => page.getByRole('button', { name: /^Pop out preview/ }).click())]);
    await expect(pop).toHaveURL(/\/app\/preview\/$/);
    await expect(pop.locator('.md-doc h1')).toHaveText('Project notes');
    await ta(page).fill('# Live title\n\nbody\n');
    await expect(pop.locator('.md-doc h1')).toHaveText('Live title');
    await ta(page).fill(long(500));
    await expect(pop.locator('.md-doc h2').first()).toBeVisible();
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.scrollTop = 6000; });
    await expect.poll(() => pop.locator('.pop-out').evaluate((e) => e.scrollTop)).toBeGreaterThan(500);
    const p2 = await context.newPage();
    await p2.goto('/app/preview/');
    await expect(p2.locator('.md-doc h2').first()).toBeVisible(); // yêu cầu "hello" nhận lại nội dung hiện tại
  });

  test('pop-out mở trước khi có studio: hiện hướng dẫn rồi nhận nội dung khi studio mở', async ({ context }) => {
    const pop = await context.newPage();
    await pop.goto('/app/preview/');
    await expect(pop.getByText('Waiting for the editor')).toBeVisible();
    const main = await context.newPage();
    await main.goto(URL_);
    await expect(pop.locator('.md-doc h1')).toHaveText('Project notes');
    await expect(pop.getByText('Waiting for the editor')).toHaveCount(0);
  });

  test('pop-out không nhận phím điều hướng của blog (m, r, h…)', async ({ page, context }) => {
    await open(page);
    const [pop] = await Promise.all([context.waitForEvent('page'), viewOptions(page).click().then(() => page.getByRole('button', { name: /^Pop out preview/ }).click())]);
    await expect(pop.locator('.md-doc h1')).toBeVisible();
    await pop.locator('.pop-out').click();
    for (const k of ['m', 'r', 'h', 'a']) await pop.keyboard.press(k);
    await pop.waitForTimeout(800);
    await expect(pop).toHaveURL(/\/app\/preview\/$/);
  });

  test('axe sạch cho cửa sổ pop-out', async ({ page, context }) => {
    await open(page);
    const [pop] = await Promise.all([context.waitForEvent('page'), viewOptions(page).click().then(() => page.getByRole('button', { name: /^Pop out preview/ }).click())]);
    await expect(pop.locator('.md-doc h1')).toBeVisible();
    const r = await new AxeBuilder({ page: pop }).analyze();
    expect(r.violations).toEqual([]);
  });

  test('Find regex chạy trong worker: mẫu backtracking thảm hoạ báo timed out và tab vẫn gõ được', async ({ page }) => {
    await open(page, 'a'.repeat(45) + 'b\n');
    await page.getByRole('button', { name: /^find/ }).click();
    await page.getByRole('button', { name: '.*' }).click();
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('(a+)+$');
    await expect(page.locator('.pv-fcount')).toHaveText('timed out', { timeout: 6000 });
    await ta(page).focus();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('End');
    await page.keyboard.type('Z');
    await expect(ta(page)).toHaveValue('a'.repeat(45) + 'bZ\n'.replace('\n', '') + '\n');
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('a+');
    await expect(page.locator('.pv-fcount')).toHaveText('1/1', { timeout: 6000 });
  });

  test('id heading kiểu GitHub: mục lục viết cho GitHub trỏ được, và lint không báo nhầm', async ({ page }) => {
    await open(page, "# T\n\n- [new](#whats-new)\n- [vn](#tiếng-việt)\n- [api](#api-v20)\n\n## What's new?\n\ntext\n\n## Tiếng Việt\n\ntext\n\n## API v2.0\n\ntext\n");
    await expect(page.locator('.md-doc h2#whats-new')).toHaveCount(1);
    await expect(page.locator('.md-doc h2[id="tiếng-việt"]')).toHaveCount(1);
    await expect(page.locator('.md-doc h2#api-v20')).toHaveCount(1);
    await expect(page.locator('.pv-chk')).toContainText('No issues');
  });
});



test.describe('studio: callout, math, mermaid, splitter, bài mặc định', () => {
  test('bài mặc định: bài kỹ thuật dùng đủ thành phần, không nguồn gắn kèm, lint sạch', { tag: '@default' }, async ({ page }) => {
    await open(page);
    await expect(page.locator('.md-doc h1').first()).toHaveText('Better meetings');
    await expect(page.locator('.pv-from')).toHaveCount(0);
    await expect(page.locator('.md-doc .callout')).toHaveCount(1);
    await expect(page.locator('.md-doc table')).toHaveCount(1);
    await expect(page.locator('.md-doc .cb:not([data-mermaid])')).toHaveCount(1); // một khối code (mẫu Markdown); sơ đồ chưa cuộn tới vẫn là .cb[data-mermaid]
    await expect(page.locator('.md-doc input[type=checkbox]')).toHaveCount(4);
    await expect(page.locator('.md-doc .footnotes')).toHaveCount(1);
    await expect(page.locator('.md-doc .katex-display')).toHaveCount(1);
    await expect(page.locator('.md-doc .katex').first()).toBeVisible();
    await page.locator('.md-doc .cb[data-mermaid]').scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined); // sơ đồ chỉ dựng khi cuộn tới; nếu đã dựng xong trước đó thì khối chờ không còn (trước đây test này lỗi 3/4 lần khi chạy song song, cả trên bản đã deploy)
    await expect(page.locator('.md-doc figure.mermaid svg')).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('.pv-chk')).toContainText('No issues');
    await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue('better-meetings.md');
  });

  // Tài liệu có nguồn: seed `mdprev-md` + `mdprev-md-base` như khi người dùng đã mở nó từ URL.
  const seedRemote = (context: BrowserContext) => context.addInitScript(() => {
    try {
      // chỉ gieo MỘT lần mỗi phiên (cờ ở sessionStorage) và ghi đè bài mẫu mà beforeEach đã gieo trước nó; reload sau đó giữ nguyên chỉnh sửa
      if (sessionStorage.getItem('seeded-remote')) return;
      sessionStorage.setItem('seeded-remote', '1');
      localStorage.setItem('mdprev-md', '# Index\n\n[Python](./reference/python.md#setup)\n');
      localStorage.setItem('mdprev-md-base', 'https://raw.githubusercontent.com/example/docs/main/guide/index.md');
    } catch { /* bỏ qua */ }
  });
  const mockRaw = (page: Page) => page.route('https://raw.githubusercontent.com/**', (r) => {
    const u = r.request().url();
    r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: u.endsWith('python.md') ? '# Python Guide\n\n## Setup\n\ntext\n\n[back](../index.md)\n' : '# Index\n\n[Python](./reference/python.md#setup)\n' });
  });

  test('tài liệu có nguồn giữ nhãn nguồn và link tương đối sau khi tải lại, kể cả khi đã sửa một ký tự', { tag: '@default' }, async ({ page, context }) => {
    await seedRemote(context);
    const check = async () => {
      await expect(page.locator('.md-doc h1').first()).toBeVisible();
      await expect(page.locator('.pv-from')).toHaveText('example/docs · guide/index.md');
      await expect(page.locator('.md-doc a[data-md]').first()).toHaveAttribute('href', 'https://github.com/example/docs/blob/main/guide/reference/python.md#setup');
    };
    await open(page);
    await check();
    await page.reload();
    await check();
    await ta(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('x');
    await expect(page.locator('.pv-modetag')).toHaveText('READY');
    await page.reload();
    await check();
  });

  test('bấm link .md tương đối: tải tài liệu đó, giữ nguồn, back/forward quay lại', { tag: '@default' }, async ({ page, context }) => {
    await seedRemote(context);
    await mockRaw(page);
    await open(page);
    await page.locator('.md-doc a[data-md*="reference/python.md"]').first().click();
    await expect(page.locator('.md-doc h1').first()).toHaveText('Python Guide');
    await expect(page.locator('.pv-from')).toHaveText('example/docs · guide/reference/python.md');
    await expect(page.getByRole('button', { name: 'Back' })).toBeEnabled();
    await page.locator('.md-doc a[data-md]').first().click();
    await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue('index.md');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.md-doc h1').first()).toHaveText('Python Guide');
    await page.getByRole('button', { name: 'Forward' }).click();
    await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue('index.md');
  });

  test('File, Open URL: nhận link blob GitHub, từ chối URL lạ', { tag: '@default' }, async ({ page }) => {
    await page.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: '# From URL\n' }));
    await open(page);
    let native = 0;
    page.on('dialog', (d) => { native++; void d.dismiss(); }); // không còn prompt() gốc
    await page.getByRole('button', { name: 'Open menu', exact: true }).click(); await page.getByRole('button', { name: 'Open URL…' }).click();
    const dlg = page.getByRole('dialog', { name: 'Open from URL' });
    await dlg.getByRole('textbox').fill('https://example.com/page.html');
    await dlg.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(dlg.getByRole('alert')).toContainText('not a link to a Markdown file'); // lỗi ngay tại chỗ, thẻ vẫn mở
    await dlg.getByRole('textbox').fill('https://github.com/o/r/blob/main/docs/a.md');
    await page.keyboard.press('Enter');
    await expect(dlg).toHaveCount(0);
    expect(native).toBe(0);
    await expect(page.locator('.md-doc h1').first()).toHaveText('From URL');
    await expect(page.locator('.pv-from')).toHaveText('o/r · docs/a.md');
  });

  test('bài mặc định trên mobile: trang không tràn ngang, menu VIEW nằm gọn trong màn hình', { tag: '@default' }, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(URL_);
    await expect(viewTab(page, 'Edit')).toHaveAttribute('aria-pressed', 'true'); // điện thoại mở ở Edit (đổi 2026-11-18: không còn mở ở Read để đọc bài mẫu mặc định)
    await viewTab(page, 'Edit').click();
    await expect(ta(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await openView(page);
    const r = await page.locator('.pv-menu-view').evaluate((m) => { const b = m.getBoundingClientRect(); return [b.left, b.right]; });
    expect(r[0]).toBeGreaterThanOrEqual(0);
    expect(r[1]).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('callout kiểu GitHub dựng thành khối có nhãn', async ({ page }) => {
    await open(page, '> [!WARNING]\n> Careful here.\n\n> plain quote\n');
    await expect(page.locator('.md-doc .callout-warning .callout-t')).toHaveText('Warning');
    await expect(page.locator('.md-doc .callout-warning')).toContainText('Careful here.');
    await expect(page.locator('.md-doc blockquote')).toHaveCount(1);
  });

  test('công thức KaTeX: dựng inline và display, nạp CSS khi cần, công thức lỗi không vỡ trang', async ({ page }) => {
    await open(page, 'Inline $a^2+b^2=c^2$ and\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nBad $\\frac{$ ok\n');
    await expect(page.locator('.md-doc .katex').first()).toBeVisible();
    await expect(page.locator('.md-doc .katex-display')).toHaveCount(1);
    await expect(page.locator('#katex-css')).toHaveCount(1);
    await expect(page.locator('.md-doc')).toContainText('ok');
  });

  test('Mermaid: dựng SVG, giữ nút copy ở bản xuất, lỗi cú pháp giữ khối code', async ({ page }) => {
    await open(page, '```mermaid\ngraph TD; A[Start]-->B[End]\n```\n\n```mermaid\nnot a diagram ((\n```\n');
    await expect(page.locator('.md-doc figure.mermaid svg')).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('.md-doc figure.mermaid')).toContainText('Start');
    await expect(page.locator('.md-doc .cb[data-mermaid]')).toHaveCount(1);
  });

  test('bản xem hiện ngay, không chờ thư viện Mermaid tải xong; sơ đồ lên sau', { tag: '@default' }, async ({ page }) => {
    await page.route(/mermaid/, async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });
    await open(page);
    await expect(page.locator('.pv-modetag')).toHaveText('READY', { timeout: 3000 });
    await expect(page.locator('.md-doc .cb[data-mermaid]')).toHaveCount(1); // sơ đồ nằm dưới nếp gấp: chờ cuộn tới
    await page.locator('.md-doc .cb[data-mermaid]').scrollIntoViewIfNeeded();
    await expect(page.locator('.md-doc figure.mermaid svg')).toHaveCount(1, { timeout: 30000 });
    await expect(page.locator('.md-doc .cb[data-mermaid]')).toHaveCount(0);
  });

  test('mở tài liệu khác khi sơ đồ đang dựng: bản xem theo tài liệu mới, không bị kết quả cũ ghi đè', { tag: '@default' }, async ({ page }) => {
    await page.route(/mermaid/, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
    await open(page);
    page.on('dialog', (d) => d.accept());
    await ta(page).fill('# Other doc\n\ntext\n');
    await expect(page.locator('.md-doc h1').first()).toHaveText('Other doc');
    await page.waitForTimeout(4000);
    await expect(page.locator('.md-doc h1').first()).toHaveText('Other doc');
    await expect(page.locator('.md-doc figure.mermaid')).toHaveCount(0);
  });

  test('lệnh shell có $ trong code không bật công thức', async ({ page }) => {
    await open(page, '# Shell\n\n```bash\nkill $PID\nV=$!\n```\n\nPrice is $5.\n');
    await expect(page.locator('.md-doc .katex')).toHaveCount(0);
    await expect(page.locator('#katex-css')).toHaveCount(0);
    await expect(page.locator('.md-doc .cb')).toContainText('kill $PID');
  });

  test('template mới: Technical note có công thức và sơ đồ, Postmortem có bảng timeline', async ({ page }) => {
    await open(page, 'x');
    page.on('dialog', (d) => d.accept());
    await fileMenu(page).click();
    await page.getByRole('button', { name: 'New from template' }).click(); // mục mở rộng tại chỗ
    for (const n of ['Design doc', 'Incident postmortem', 'Runbook', 'Bug report', 'Pull request', 'Weekly update', 'API reference', 'Technical note']) await expect(page.getByRole('button', { name: new RegExp('^' + n) })).toBeVisible();
    await page.getByRole('button', { name: /^Technical note/ }).click();
    await expect(page.locator('.md-doc h1').first()).toHaveText('Technical note');
    await expect(page.locator('.md-doc .katex-display')).toHaveCount(1);
    await expect(page.locator('.md-doc figure.mermaid svg')).toHaveCount(1, { timeout: 20000 });
    await fileMenu(page).click();
    await page.getByRole('button', { name: 'New from template' }).click();
    await page.getByRole('button', { name: /^Incident postmortem/ }).click();
    await expect(page.locator('.md-doc table')).toHaveCount(2);
    await expect(page.locator('.pv-chk')).toBeVisible();
  });

  test('thanh chia: kéo đổi tỉ lệ, phím mũi tên, nhấp đúp về 50, nhớ sau khi tải lại', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(page);
    const sep = page.getByRole('separator', { name: /Resize/ });
    await expect(sep).toHaveAttribute('aria-valuenow', '50');
    const box = (await sep.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x - 250, box.y + 200, { steps: 5 });
    await page.mouse.up();
    const v = Number(await sep.getAttribute('aria-valuenow'));
    expect(v).toBeLessThan(45);
    await sep.focus();
    await page.keyboard.press('ArrowRight');
    expect(Number(await sep.getAttribute('aria-valuenow'))).toBe(v + 2);
    await page.reload();
    await expect(page.getByRole('separator', { name: /Resize/ })).toHaveAttribute('aria-valuenow', String(v + 2));
    await page.getByRole('separator', { name: /Resize/ }).dblclick();
    await expect(page.getByRole('separator', { name: /Resize/ })).toHaveAttribute('aria-valuenow', '50');
  });
});
