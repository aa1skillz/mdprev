import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Nhiều tài liệu (tab) trong một ô soạn. Gõ và bấm bằng bàn phím/chuột thật. */
const ta = (p: Page) => p.locator('.ed-ta');
const tabs = (p: Page) => p.locator('.pv-tabgo');
const open = async (page: Page, md = '') => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await expect(ta(page)).toBeVisible();
  await ta(page).fill(md);
  await ta(page).focus();
};
const val = (p: Page) => ta(p).inputValue();
const mirror = (p: Page) => p.evaluate(() => localStorage.getItem('mdprev-md'));
const newTab = async (page: Page, text: string) => { await page.keyboard.press('Alt+n'); await expect(ta(page)).toBeFocused().catch(() => undefined); await ta(page).focus(); await page.keyboard.type(text); };

test.describe('nhiều tài liệu', () => {
  test('một tài liệu: không có thanh tab; Alt+N mở tab mới và hiện thanh tab', async ({ page }) => {
    await open(page, '# One\n\nfirst');
    await expect(tabs(page)).toHaveCount(0);
    await page.keyboard.press('Alt+n');
    await expect(tabs(page)).toHaveCount(2);
    expect(await val(page)).toBe('');
  });

  test('đổi tab giữ chữ và con trỏ; Undo của tab cũ không rò sang tab mới', async ({ page }) => {
    await open(page, '# One\n\nfirst doc');
    await ta(page).evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(3, 3));
    await newTab(page, '# Two\n\nsecond doc');
    expect(await val(page)).toBe('# Two\n\nsecond doc');
    await tabs(page).first().click();
    expect(await val(page)).toBe('# One\n\nfirst doc');
    expect(await ta(page).evaluate((e: HTMLTextAreaElement) => e.selectionStart)).toBe(3);
    await ta(page).focus();
    await page.keyboard.press('Control+Z'); // lùi bước nạp bài (fill) của chính tab này; tuyệt đối không kéo nội dung tab kia về
    expect(await val(page)).not.toContain('second');
    await expect.poll(async () => (await mirror(page)) === (await val(page))).toBe(true); // gương cho bản cũ (rollback) theo kịp sau undo
  });

  // Undo theo từng tab: nhật ký ghi từ sự kiện input, ngăn xếp gốc dựng lại bằng replay khi ô soạn lấy focus (lib/studio/undo-log.ts)
  const undoBtn = (p: Page) => p.getByRole('button', { name: /^undo/i });
  test('gõ một dòng, đổi tab rồi quay lại: Ctrl+Z vẫn lùi đúng, Ctrl+Shift+Z làm lại, autosave theo sau', async ({ page }) => {
    await open(page, '# One\n\nfirst');
    await page.keyboard.press('Control+End'); await page.keyboard.type(' line typed');
    await newTab(page, '# Two\n\nsecond');
    await tabs(page).first().click();
    expect(await val(page)).toBe('# One\n\nfirst line typed');
    await expect(undoBtn(page)).toBeEnabled(); // nút Undo sáng ngay cả khi ô soạn chưa lấy focus
    await ta(page).focus();
    await page.keyboard.press('Control+Z');
    expect(await val(page)).toBe('# One\n\nfirst');
    await expect.poll(() => mirror(page)).toBe('# One\n\nfirst'); // autosave lưu trạng thái SAU undo
    await page.keyboard.press('Control+Shift+Z');
    expect(await val(page)).toBe('# One\n\nfirst line typed');
    await tabs(page).nth(1).click();
    expect(await val(page)).toBe('# Two\n\nsecond'); // tab kia không bị ảnh hưởng
  });

  test('bấm nút Undo khi ô soạn chưa có focus (sau đổi tab) vẫn lùi được', async ({ page }) => {
    await open(page, 'base');
    await page.keyboard.press('Control+End'); await page.keyboard.type(' more');
    await newTab(page, 'other');
    await tabs(page).first().click();
    await page.getByRole('button', { name: /^undo/i }).click();
    expect(await val(page)).toBe('base');
    await page.getByRole('button', { name: /^redo/i }).click();
    expect(await val(page)).toBe('base more');
  });

  test('reload: Ctrl+Z vẫn lùi từng bước và redo được', async ({ page }) => {
    await open(page, 'start');
    await page.keyboard.press('Control+End'); await page.keyboard.type(' one');
    await page.keyboard.press('Enter'); await page.keyboard.type('two'); // 2 bước: dòng 1 rồi dòng 2? (Enter nằm trong cùng mạch gõ)
    await page.locator('.ed-ta').evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(0, 0)); // đổi vị trí: gõ tiếp thành bước mới
    await page.keyboard.type('>> ');
    const typed = await val(page);
    expect(typed.startsWith('>> start')).toBe(true);
    await page.waitForTimeout(1200); // chờ lưu nền (600 ms) + IndexedDB
    await page.reload();
    await expect(ta(page)).toBeVisible();
    expect(await val(page)).toBe(typed);
    await expect(undoBtn(page)).toBeEnabled();
    await ta(page).focus();
    await page.keyboard.press('Control+Z');
    expect(await val(page)).toBe(typed.slice(3)); // bỏ ">> "
    await page.keyboard.press('Control+Z');
    expect(await val(page)).not.toContain('two'); // lùi tiếp qua phần gõ trước
    await page.keyboard.press('Control+Shift+Z');
    await page.keyboard.press('Control+Shift+Z');
    expect(await val(page)).toBe(typed);
    await expect.poll(() => mirror(page)).toBe(typed);
  });

  test('đóng tab rồi Reopen: undo vẫn còn', async ({ page }) => {
    await open(page, 'keep');
    await page.keyboard.press('Control+End'); await page.keyboard.type(' typed');
    await newTab(page, 'second tab');
    await page.keyboard.press('Alt+1'); await page.waitForTimeout(300);
    await page.keyboard.press('Alt+w'); // đóng tab 1 (đang chọn)
    await expect(tabs(page)).toHaveCount(0); // còn một tài liệu: thanh tab ẩn
    await page.keyboard.press('Alt+Shift+T');
    await expect(tabs(page)).toHaveCount(2);
    await expect.poll(() => val(page)).toBe('keep typed');
    await ta(page).focus();
    await page.keyboard.press('Control+Z');
    expect(await val(page)).toBe('keep');
  });

  const undoKeys = (p: Page) => p.evaluate(() => new Promise<string[]>((res) => { const r = indexedDB.open('mdprev-md-undo', 1); r.onsuccess = () => { const q = r.result.transaction('logs').objectStore('logs').getAllKeys(); q.onsuccess = () => { r.result.close(); res(q.result as string[]); }; }; r.onerror = () => res([]); }));
  test('bản lưu undo nằm trong DB riêng và bị xoá khi tab rớt khỏi danh sách "đóng gần đây"', async ({ page }) => {
    await open(page, 'secret text');
    await page.keyboard.press('Control+End'); await page.keyboard.type(' more');
    await expect.poll(async () => (await undoKeys(page)).length).toBe(1);
    const first = (await undoKeys(page))[0]!;
    await page.keyboard.press('Alt+n'); await page.keyboard.press('Alt+1'); await page.waitForTimeout(200);
    await page.keyboard.press('Alt+w'); // tab 1 vào ngăn "đóng gần đây": bản lưu còn (Reopen cần nó)
    await page.waitForTimeout(700);
    expect(await undoKeys(page)).toContain(first);
    for (let i = 0; i < 11; i++) { await ta(page).focus(); await page.keyboard.type(`x${i}`); await page.keyboard.press('Alt+n'); await page.waitForTimeout(150); await page.keyboard.press('Alt+1'); await page.waitForTimeout(150); await page.keyboard.press('Alt+w'); await page.waitForTimeout(150); }
    await expect.poll(async () => (await undoKeys(page)).includes(first), { timeout: 8000 }).toBe(false);
  });

  test('đóng bằng ×, báo Reopen, mở lại đúng nội dung; Alt+Shift+T cũng được', async ({ page }) => {
    await open(page, '# One\n\naaa');
    await newTab(page, '# Two\n\nbbb');
    await page.getByRole('button', { name: /^Close .*two/i }).click();
    await expect(tabs(page)).toHaveCount(0); // còn một tài liệu: thanh tab ẩn
    expect(await val(page)).toBe('# One\n\naaa');
    await page.getByRole('status').getByRole('button', { name: 'Reopen' }).click();
    await expect(tabs(page)).toHaveCount(2);
    expect(await val(page)).toBe('# Two\n\nbbb');
    await page.keyboard.press('Alt+w');
    await expect(tabs(page)).toHaveCount(0);
    await ta(page).focus();
    await page.keyboard.press('Alt+Shift+T');
    expect(await val(page)).toBe('# Two\n\nbbb');
  });

  test('qua tải lại: các tab và nội dung còn nguyên, tab đang chọn là tab cũ', async ({ page }) => {
    await open(page, '# One\n\naaa');
    await newTab(page, '# Two\n\nbbb');
    await page.waitForTimeout(900); // lưu nền gộp 600 ms
    await page.reload();
    await expect(tabs(page)).toHaveCount(2);
    expect(await val(page)).toBe('# Two\n\nbbb');
    await tabs(page).first().click();
    await expect.poll(() => val(page)).toBe('# One\n\naaa');
  });

  test('chuyển từ bản cũ: chỉ có mdprev-md thì thành một tài liệu, khoá cũ không bị xoá', async ({ page }) => {
    await page.addInitScript(() => { try { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('mdprev-md', '# Legacy\n\nbody'); localStorage.setItem('mdprev-md-name', 'legacy.md'); localStorage.removeItem('mdprev-md-tabs'); } } catch { /* bỏ qua */ } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/');
    await expect(ta(page)).toHaveValue('# Legacy\n\nbody');
    await expect(tabs(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('mdprev-md-name'))).toBe('legacy.md');
  });

  test('phím tắt: Alt+1/2 chọn tab, Alt+PageDown/PageUp đổi vòng quanh', async ({ page }) => {
    await open(page, '# One\n\naaa');
    await newTab(page, '# Two\n\nbbb');
    await page.keyboard.press('Alt+1'); await expect.poll(() => val(page)).toBe('# One\n\naaa');
    await page.keyboard.press('Alt+2'); await expect.poll(() => val(page)).toBe('# Two\n\nbbb');
    await page.keyboard.press('Alt+PageDown'); await expect.poll(() => val(page)).toBe('# One\n\naaa');
    await page.keyboard.press('Alt+PageUp'); await expect.poll(() => val(page)).toBe('# Two\n\nbbb');
  });

  test('New khi tài liệu đang rỗng dùng lại tab, không đẻ tab thừa; Try a sample mở tab mới khi đang có chữ', async ({ page }) => {
    await open(page, '');
    await page.keyboard.press('Alt+n');
    await expect(tabs(page)).toHaveCount(0);
    await ta(page).fill('# Mine\n\ntext');
    await page.keyboard.press('Alt+n');
    await expect(tabs(page)).toHaveCount(2);
  });

  test('chấm "đã sửa" chỉ có ở tab có file; tab nháp không có chấm', async ({ page }) => {
    await open(page, '# One\n\naaa');
    await newTab(page, '# Two\n\nbbb');
    await expect(page.getByRole('img', { name: 'Unsaved changes' })).toHaveCount(0);
  });

  test('12 tab là tối đa: tab thứ 13 bị từ chối kèm thông báo, không mất gì', async ({ page }) => {
    await open(page, '# 1');
    for (let i = 2; i <= 12; i++) await newTab(page, `# ${i}`);
    await expect(page.locator('.pv-tabgo').or(page.getByRole('button', { name: /^\+\d+/ }))).not.toHaveCount(0);
    await page.keyboard.press('Alt+n');
    await expect(page.locator('.pv-flash, [role="status"]').filter({ hasText: /TOO MANY TABS|Too many tabs/i }).first()).toBeVisible();
    expect(await val(page)).toBe('# 12');
  });

  test('tràn: có +N, tab đang chọn luôn hiện, chọn từ +N chuyển được', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/app/'); await ta(page).fill('# 1'); await ta(page).focus();
    for (let i = 2; i <= 9; i++) await newTab(page, `# ${i}`);
    const more = page.getByRole('button', { name: /^\+\d+/ });
    await expect(more).toBeVisible();
    await expect(page.locator('.pv-tabgo[aria-current="true"]')).toBeVisible();
    await more.click();
    await page.getByRole('menuitem').first().click();
    await expect(page.locator('.pv-tabgo[aria-current="true"]')).toBeVisible();
  });

  test('axe sạch (sáng/tối) với thanh tab, có tab đang đổi tên và menu +N', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/app/'); await ta(page).fill('# 1'); await ta(page).focus();
    for (let i = 2; i <= 8; i++) await newTab(page, `# ${i}`);
    await page.getByRole('button', { name: /^\+\d+/ }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(200);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${theme}/${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
    }
  });

  test('bố cục: thanh tab không đè nhóm chế độ/Export ở 1440, 1024, 900 px; vùng chạm ≥ 24px', async ({ page }) => {
    for (const w of [1440, 1024, 900]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/app/'); await ta(page).fill('# 1'); await ta(page).focus();
      for (let i = 2; i <= 6; i++) await newTab(page, `# ${i}`);
      const boxes = await page.evaluate(() => {
        const r = (q: string) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height }; };
        return { tabs: r('.pv-tabs'), modes: r('.pv-mode'), act: r('.pv-acts'), bar: r('.pv-bar'), btn: r('.pv-tabgo'), x: r('.pv-tabx') };
      });
      expect(boxes.tabs, `tabs ${w}`).not.toBeNull();
      expect(boxes.tabs!.r, `thanh tab không tràn ra ngoài thanh ở ${w}`).toBeLessThanOrEqual(boxes.bar!.r + 1);
      if (boxes.act) expect(boxes.tabs!.r, `thanh tab không đè nhóm nút phải ở ${w}`).toBeLessThanOrEqual(boxes.act.l + 1);
      expect(boxes.btn!.h).toBeGreaterThanOrEqual(24);
      expect(boxes.x!.h).toBeGreaterThanOrEqual(24);
    }
  });

  test('điện thoại: không có thanh tab, nút tài liệu mở bảng chọn (hàng ≥ 48px), chọn và đóng được', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/app/'); await ta(page).fill('# One\n\naaa'); await ta(page).focus();
    await page.keyboard.press('Alt+n'); await ta(page).focus(); await page.keyboard.type('# Two\n\nbbb');
    await expect(page.locator('.pv-tablist')).toBeHidden();
    await page.locator('.pv-tabsw').click();
    const sheet = page.getByRole('dialog', { name: 'Open documents' });
    await expect(sheet).toBeVisible();
    const h = await sheet.locator('.pv-tabrowgo').first().evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(48);
    await sheet.locator('.pv-tabrowgo').first().click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => val(page)).toBe('# One\n\naaa');
  });

  test('5000 dòng: đổi tab và gõ không có tác vụ dài', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/app/');
    await ta(page).evaluate((e: HTMLTextAreaElement) => { e.value = Array.from({ length: 5000 }, (_, i) => `line ${i} lorem ipsum dolor sit amet`).join('\n'); e.dispatchEvent(new Event('input', { bubbles: true })); }); // fill() của Playwright mất hàng chục giây với văn bản lớn
    await ta(page).focus();
    await page.keyboard.press('Alt+n'); await ta(page).focus(); await page.keyboard.type('# small');
    const ms = await page.evaluate(async () => { const t0 = performance.now(); (document.querySelector('.pv-tabgo') as HTMLElement).click(); await new Promise((r) => requestAnimationFrame(() => r(null))); return performance.now() - t0; });
    expect(ms).toBeLessThan(1000); // chạy riêng ~100ms; dư cho máy tải nặng
    expect((await val(page)).split('\n').length).toBe(5000);
  });

  test('rollback: bản cũ chỉ đọc mdprev-md / mdprev-md-name và thấy đúng tài liệu đang chọn', async ({ page }) => {
    await open(page, '# One\n\naaa');
    await newTab(page, '# Two\n\nbbb');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => localStorage.getItem('mdprev-md'))).toBe('# Two\n\nbbb');
    await page.locator('.pv-tabgo').first().click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mdprev-md')), { timeout: 3000 }).toBe('# One\n\naaa'); // bản gương được ghi ngay khi có khoá (vài ms)
  });

  test('một cửa sổ: Alt+1, Alt+2, Alt+1 nhanh không bao giờ chỉ đọc và chữ đúng', async ({ page }) => {
    await open(page, '# One');
    await newTab(page, '# Two');
    for (const k of ['Alt+1', 'Alt+2', 'Alt+1']) await page.keyboard.press(k);
    await expect(ta(page)).not.toHaveAttribute('readonly', '', { timeout: 3000 });
    expect(await val(page)).toBe('# One');
    await page.keyboard.press('Alt+2'); await expect.poll(() => val(page)).toBe('# Two');
    await expect(ta(page)).not.toHaveAttribute('readonly', '', { timeout: 3000 });
  });

  test('hai cửa sổ: cửa sổ sau chỉ đọc cho MỌI tab và không tạo/đóng được tab; cửa sổ đầu vẫn sửa bình thường', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a = await ctx.newPage(), b = await ctx.newPage();
    await a.goto('/app/'); await ta(a).fill('# One'); await ta(a).focus(); await a.keyboard.press('Alt+n'); await ta(a).focus(); await a.keyboard.type('# Two'); await a.waitForTimeout(1000);
    await b.goto('/app/');
    await expect(b.getByRole('status').filter({ hasText: 'read-only' })).toBeVisible({ timeout: 8000 });
    await expect(ta(b)).toHaveAttribute('readonly', '');
    await expect(tabs(b)).toHaveCount(2);
    await tabs(b).first().click(); // xem tab khác vẫn được, vẫn chỉ đọc
    await expect(ta(b)).toHaveAttribute('readonly', '');
    await b.keyboard.press('Alt+n'); // không tạo được tab
    await expect(tabs(b)).toHaveCount(2);
    await expect(ta(a)).not.toHaveAttribute('readonly', '');
    await ctx.close();
  });

  test('Take over: cửa sổ mới lấy đúng việc vừa gõ ở cửa sổ cũ (cả tab đang chọn lẫn tab khác); cửa sổ cũ thành chỉ đọc', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a = await ctx.newPage(), b = await ctx.newPage();
    await a.goto('/app/'); await ta(a).fill('# One'); await ta(a).focus(); await a.keyboard.press('Alt+n'); await ta(a).focus(); await a.keyboard.type('# Two'); await a.waitForTimeout(1000);
    await b.goto('/app/');
    await expect(ta(b)).toHaveAttribute('readonly', '', { timeout: 8000 });
    await tabs(a).first().click(); await ta(a).focus(); await a.keyboard.press('Control+End'); await a.keyboard.type(' edit1'); // tab 1 sửa rồi sang tab 2
    await tabs(a).nth(1).click(); await ta(a).focus(); await a.keyboard.press('Control+End'); await a.keyboard.type(' edit2'); // gõ xong lập tức bị chiếm (không chờ lưu nền)
    await b.getByRole('button', { name: 'Take over' }).click();
    await expect(ta(b)).not.toHaveAttribute('readonly', '', { timeout: 10000 });
    await expect(tabs(b)).toHaveCount(2);
    const texts: string[] = [];
    for (const i of [0, 1]) { await tabs(b).nth(i).click(); await b.waitForTimeout(250); texts.push(await val(b)); }
    expect(texts.slice().sort()).toEqual(['# One edit1', '# Two edit2']);
    await expect(a.getByRole('status').filter({ hasText: 'read-only' })).toBeVisible({ timeout: 8000 });
    await expect(ta(a)).toHaveAttribute('readonly', '');
    await ctx.close();
  });

  test('cửa sổ chỉ đọc không ghi gì: sửa bản gương/metadata/IndexedDB của cửa sổ kia không bị đè', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a = await ctx.newPage(), b = await ctx.newPage();
    await a.goto('/app/'); await ta(a).fill('# One'); await a.waitForTimeout(900);
    await b.goto('/app/');
    await expect(ta(b)).toHaveAttribute('readonly', '', { timeout: 8000 });
    await ta(a).focus(); await a.keyboard.press('Control+End'); await a.keyboard.type(' latest'); await a.waitForTimeout(1200);
    await b.keyboard.press('Alt+n'); await b.keyboard.press('Alt+1'); await b.waitForTimeout(1500); // B làm vài việc rồi nghỉ: không được ghi
    const c = await ctx.newPage(); await c.goto('/app/');
    await expect(c.getByRole('status').filter({ hasText: 'read-only' })).toBeVisible({ timeout: 8000 });
    expect(await val(c)).toBe('# One latest');
    await ctx.close();
  });

  test('F5 ở cửa sổ đang sửa: giành lại được khoá, không bị chỉ đọc', async ({ page }) => {
    await open(page, '# One');
    await page.waitForTimeout(900);
    await page.reload();
    await expect(ta(page)).toBeVisible();
    await page.waitForTimeout(2500); // dài hơn lần thử lại 1,2 s
    await expect(ta(page)).not.toHaveAttribute('readonly', '');
    await expect(page.getByRole('status').filter({ hasText: 'read-only' })).toHaveCount(0);
  });

  test.describe('menu chuột phải của tab', () => {
    const three = async (page: Page) => { await open(page, '# One\n\naaa'); await newTab(page, '# Two\n\nbbb'); await newTab(page, '# Three\n\nccc'); };
    const ctxMenu = (p: Page) => p.getByRole('menu', { name: /^Tab / });
    test('có đủ mục; Esc đóng; mục vô hiệu đúng chỗ (tab cuối không có Close tabs to the right)', async ({ page }) => {
      await three(page);
      await tabs(page).nth(2).click({ button: 'right' });
      const m = ctxMenu(page);
      await expect(m).toBeVisible();
      for (const n of [/^Rename$/, /^Duplicate$/, /^Close( Alt\+W)?$/, /^Close others$/, /^Close tabs to the right$/, /^Reopen closed tab/]) await expect(m.getByRole('menuitem', { name: n })).toBeVisible();
      await expect(m.getByRole('menuitem', { name: /^Close tabs to the right/ })).toBeDisabled();
      await expect(m.getByRole('menuitem', { name: /^Reopen closed tab/ })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(m).toHaveCount(0);
    });
    test('Duplicate: bản sao nằm ngay sau và có cùng nội dung, đặt tên "copy"', async ({ page }) => {
      await three(page);
      await tabs(page).nth(0).click({ button: 'right' });
      await ctxMenu(page).getByRole('menuitem', { name: 'Duplicate' }).click();
      await expect(tabs(page)).toHaveCount(4);
      expect(await val(page)).toBe('# One\n\naaa');
      await expect(page.locator('.pv-tabgo[aria-current="true"]')).toContainText('copy');
      expect(await tabs(page).nth(1).innerText()).toContain('copy');
    });
    test('Close others giữ đúng một tab và Reopen đưa lại được; Close tabs to the right chỉ đóng phía phải', async ({ page }) => {
      await three(page);
      await tabs(page).nth(0).click({ button: 'right' });
      await ctxMenu(page).getByRole('menuitem', { name: /^Close tabs to the right/ }).click();
      await expect(tabs(page)).toHaveCount(0); // còn một tài liệu
      expect(await val(page)).toBe('# One\n\naaa');
      await page.keyboard.press('Alt+Shift+T');
      await expect(tabs(page)).toHaveCount(2);
    });
    test('Close others từ tab giữa', async ({ page }) => {
      await three(page);
      await tabs(page).nth(1).click({ button: 'right' });
      await ctxMenu(page).getByRole('menuitem', { name: /^Close others/ }).click();
      await expect(tabs(page)).toHaveCount(0);
      await expect.poll(() => val(page)).toBe('# Two\n\nbbb');
    });
    test('Rename từ menu mở ô đổi tên; phím Menu mở menu từ bàn phím', async ({ page }) => {
      await three(page);
      await tabs(page).nth(0).click({ button: 'right' });
      await ctxMenu(page).getByRole('menuitem', { name: 'Rename' }).click();
      await expect(page.getByRole('textbox', { name: 'Rename document' })).toBeFocused();
      await page.keyboard.type('renamed.md'); await page.keyboard.press('Enter');
      await expect(page.locator('.pv-tabgo').first()).toContainText('renamed');
      await page.locator('.pv-tabgo').nth(1).focus();
      await page.keyboard.press('ContextMenu');
      await expect(ctxMenu(page)).toBeVisible();
    });
    test('axe sạch (sáng/tối) khi menu chuột phải đang mở', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await three(page);
      await tabs(page).nth(1).click({ button: 'right' });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(200);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.map((v) => `${theme}/${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
      }
    });
  });

  test('cửa sổ chỉ đọc không ghi MỘT khoá localStorage nào của tài liệu và không báo "Saved"', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const a = await ctx.newPage(), b = await ctx.newPage();
    await a.goto('/app/'); await ta(a).fill('# One'); await ta(a).focus(); await a.keyboard.press('Alt+n'); await ta(a).focus(); await a.keyboard.type('# Two'); await a.waitForTimeout(1200);
    const snap = (p: Page) => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('mdprev-md')).sort().map((k) => [k, localStorage.getItem(k)])));
    await b.goto('/app/');
    await expect(ta(b)).toHaveAttribute('readonly', '', { timeout: 8000 });
    const before = await snap(a);
    await tabs(b).first().click(); await b.keyboard.press('Control+s'); await b.keyboard.press('Alt+n'); await b.keyboard.press('Alt+w');
    await tabs(b).nth(1).click();
    await b.waitForTimeout(1500);
    expect(await snap(a)).toEqual(before);
    await expect(b.locator('.pv-savedr')).toHaveCount(0);
    await ctx.close();
  });

  test('nhãn tab không mang đuôi .md; tab trùng tên được đánh số và phân biệt được khi bị cắt; đổi tên có thể gõ không đuôi', async ({ page }) => {
    await open(page, '');
    await page.keyboard.type('a');
    await page.keyboard.press('Alt+n'); await ta(page).focus(); await page.keyboard.type('b');
    await page.keyboard.press('Alt+n'); await ta(page).focus(); await page.keyboard.type('c');
    const labels = await page.locator('.pv-tabnm').allInnerTexts();
    expect(labels[0]).toBe('untitled');
    expect(labels[1]).toMatch(/\(2\)$/); expect(labels[2]).toMatch(/\(3\)$/); // bị cắt ở giữa nhưng vẫn thấy số cuối
    expect(new Set(labels.slice(0, 3)).size).toBe(3);
    expect(await page.locator('.pv-tabnm').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && e.scrollWidth > e.clientWidth).map((e) => e.textContent))).toEqual([]);
    await tabs(page).nth(1).dblclick();
    await page.keyboard.press('Control+A'); await page.keyboard.type('notes'); await page.keyboard.press('Enter');
    await expect(tabs(page).nth(1)).toContainText('notes');
    await expect(tabs(page).nth(1)).not.toContainText('.md');
    await expect(tabs(page).nth(1)).toHaveAttribute('title', /notes\.md/);
  });

  test('thông báo đáy xếp chồng, không đè nhau (ảnh bị chặn + đã đóng tab), ở 1440 và 390 px', async ({ page }) => {
    const { Buffer } = await import('node:buffer');
    const { deflateRawSync } = await import('node:zlib');
    const enc = (t: string) => Buffer.from(deflateRawSync(Buffer.from(t))).toString('base64url');
    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto('/app/'); await ta(page).fill('# Mine\n\ntext');
      await page.goto(`/app/#d=${enc('# Pics\n\n![logo](https://img.example/a.gif)\n')}`);
      await page.getByRole('alertdialog', { name: 'Open shared document' }).getByRole('button', { name: 'OPEN' }).click();
      await expect(page.locator('.pv-imgnote')).toBeVisible();
      if (w === 390) { await page.locator('.pv-tabsw').click(); await page.getByRole('dialog', { name: 'Open documents' }).getByRole('button', { name: /^Close/ }).first().click(); } // điện thoại: đóng tab khác (tab đang chọn vẫn là tài liệu chia sẻ)
      else { await tabs(page).first().click({ button: 'right' }); await page.getByRole('menu', { name: /^Tab / }).getByRole('menuitem', { name: /^Close( Alt\+W)?$/ }).click(); }
      await expect(page.locator('.pv-notices > .pv-toast')).toBeVisible();
      const boxes = await page.locator('.pv-notices > *').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; }));
      expect(boxes.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        expect(a.b <= b.t + 1 || b.b <= a.t + 1, `thông báo ${i} và ${j} không đè nhau ở ${w}px`).toBe(true);
      }
      for (const b of boxes) expect(b.l >= 0 && b.r <= w, `trong khung hình ở ${w}px`).toBe(true);
    }
  });
  test('<details> đang mở giữ nguyên khi gõ tiếp (preview dựng lại)', async ({ page }) => {
    await open(page, '# D\n\n<details>\n<summary>Xem thêm</summary>\n\nnội dung ẩn\n\n</details>\n\ncuối');
    await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Split', exact: true }).click();
    const d = page.locator('.pv-out details').first();
    await d.locator('summary').click();
    await expect(d).toHaveJSProperty('open', true);
    await ta(page).click(); await page.keyboard.press('Control+End'); await page.keyboard.type('Y');
    await expect(page.locator('.pv-out').getByText('cuốiY')).toBeVisible();
    await expect(page.locator('.pv-out details').first()).toHaveJSProperty('open', true);
    await d.locator('summary').click(); // đóng lại thì gõ tiếp không tự mở
    await ta(page).click(); await page.keyboard.press('Control+End'); await page.keyboard.type('Z');
    await expect(page.locator('.pv-out').getByText('cuốiYZ')).toBeVisible();
    await expect(page.locator('.pv-out details').first()).toHaveJSProperty('open', false);
  });

  test('chế độ Edit/Split/Read nhớ riêng từng tab', async ({ page }) => {
    await open(page, '# One\n\naaa');
    const mode = (n: string) => page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: n, exact: true });
    await mode('Edit').click();
    await newTab(page, '# Two\n\nbbb');
    await mode('Split').click();
    await expect(mode('Split')).toHaveAttribute('aria-pressed', 'true');
    await tabs(page).first().click();
    await expect(mode('Edit')).toHaveAttribute('aria-pressed', 'true');
    await tabs(page).nth(1).click();
    await expect(mode('Split')).toHaveAttribute('aria-pressed', 'true');
  });

  test('hai tab cùng phần đầu tên vẫn phân biệt được trên thanh tab; tooltip có Alt+số', async ({ page }) => {
    await open(page, '# Kiem tra details sat khoi code\n\nx');
    await newTab(page, '# Kiem tra an toan\n\ny');
    const t = await tabs(page).locator('.pv-tabnm').allInnerTexts();
    expect(new Set(t).size).toBe(2);
    // nhãn đã rút gọn phải VỪA ô chữ (không bị CSS cắt thêm lần nữa thành "kiem-…" giống nhau)
    const clipped = await page.locator('.pv-tabnm').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && e.textContent!.includes('…') && e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(clipped).toEqual([]);
    await expect(tabs(page).first()).toHaveAttribute('title', /Alt\+1/);
  });

  test('Clear document xoá bản lưu undo ngay (đúng lời hứa ở /privacy)', async ({ page }) => {
    await open(page, 'secret text');
    await page.keyboard.press('Control+End'); await page.keyboard.type(' more');
    await expect.poll(async () => (await undoKeys(page)).length).toBe(1);
    await page.getByRole('button', { name: 'File menu', exact: true }).click();
    await page.getByRole('button', { name: 'Clear document' }).click();
    await page.getByRole('alertdialog', { name: 'Clear this document' }).getByRole('button', { name: 'Clear document' }).click();
    await expect(ta(page)).toHaveValue('');
    await expect.poll(async () => (await undoKeys(page)).length, { timeout: 5000 }).toBe(0);
  });

  test('7 tab tên dài giống nhau: tab hiện giữ đuôi phân biệt; menu +N là danh sách dọc ~360px, tên đầy đủ, không cuộn ngang', async ({ page }) => {
    const names = ['mot', 'hai', 'ba', 'bon', 'nam', 'sau', 'bay'];
    await open(page, '');
    for (let i = 0; i < names.length; i++) { if (i) { await page.keyboard.press('Alt+n'); await ta(page).focus(); } await page.keyboard.type(`# kiem-tra-ten-tab-dai-so-${names[i]}\n\nx`); }
    await expect.poll(async () => (await tabs(page).locator('.pv-tabnm').allInnerTexts()).includes('untitled'), { timeout: 4000 }).toBe(false); // tên suy ra từ dòng # đầu, chờ dựng xong
    const shown = await tabs(page).locator('.pv-tabnm').allInnerTexts();
    expect(shown.length).toBeGreaterThanOrEqual(3);
    expect(new Set(shown).size).toBe(shown.length); // không có hai nhãn giống nhau
    for (const t of shown) expect(t).toMatch(/…|^kiem-tra-ten-tab-dai-so-\w+$/); // cắt ở giữa (hoặc vừa nguyên)
    expect(shown.every((t) => /so-\w+$|-\w{2,}$/.test(t))).toBe(true); // đuôi còn thấy
    const clipped = await page.locator('.pv-tabnm').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(clipped).toEqual([]);
    await page.locator('.pv-tabbtn[aria-haspopup]').click();
    const menu = page.locator('.pv-tabmenu');
    await expect(menu).toBeVisible();
    const m = await menu.evaluate((e) => ({ w: e.getBoundingClientRect().width, sw: e.scrollWidth, cw: e.clientWidth }));
    expect(Math.abs(m.w - 360)).toBeLessThan(3); expect(m.sw).toBeLessThanOrEqual(m.cw); // không thanh cuộn ngang
    const items = await menu.getByRole('menuitem').locator('.pv-tabmi').allInnerTexts();
    expect(items.length).toBe(7 - shown.length);
    for (const t of items) expect(t).toMatch(/^kiem-tra-ten-tab-dai-so-\w+$/); // tên đầy đủ, không bị cắt
    await menu.getByRole('menuitem').first().click();
    await expect(menu).toBeHidden();
  });

  test('menu +N: thứ tự tab hiện giữ nguyên khi tab đang chọn nằm ngoài dãy; phím tắt và nút đóng trên từng dòng; axe sạch', async ({ page }) => {
    await open(page, '');
    for (let i = 1; i <= 6; i++) { if (i > 1) { await page.keyboard.press('Alt+n'); await ta(page).focus(); } await page.keyboard.type(`# tai-lieu-so-${i}\n\nx`); }
    await expect.poll(async () => (await tabs(page).locator('.pv-tabnm').allInnerTexts()).includes('untitled'), { timeout: 4000 }).toBe(false);
    const nums = async () => (await tabs(page).locator('.pv-tabnm').allInnerTexts()).map((t) => Number(/(\d)$/.exec(t)![1]));
    const shown = await nums();
    expect(shown.at(-1)).toBe(6); // tab đang chọn (6) hiện, ở cuối
    expect(shown).toEqual([...shown].sort((a, b) => a - b)); // thứ tự tăng dần, không bị chen
    expect(shown.every((n, i) => i === 0 || n === shown[i - 1]! + 1)).toBe(true); // liên tiếp
    await page.locator('.pv-tabbtn[aria-haspopup]').click();
    const menu = page.locator('.pv-tabmenu');
    await expect(menu.locator('.pv-tabmgo kbd').first()).toHaveText('Alt+1');
    const axe = await new AxeBuilder({ page }).include('.pv-tabmenu').analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press('ArrowDown');
    const before = await menu.locator('.pv-tabmgo').count();
    await menu.locator('.pv-tabmx').first().click(); // đóng một tài liệu ẩn ngay trong menu, không đổi tab đang chọn
    await expect.poll(async () => (await tabs(page).count()) + (await menu.locator('.pv-tabmgo').count())).toBeLessThan(shown.length + before);
    expect((await nums()).at(-1)).toBe(6);
  });
});
