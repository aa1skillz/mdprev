import { devices, expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ready, newDocument, seedSample } from './helpers';

/** Đợt sửa theo feedback của hai agent độc lập (2026-11-15): mỗi test canh một lỗi đã tái hiện được. */
const phone = devices['iPhone 13'];
const ta = (p: Page) => p.locator('.ed-ta');
// Phần lớn test dưới đây được viết khi bài mặc định của /app/ còn là bài mẫu: gieo lại bài mẫu để chúng bắt đầu đúng như trước (seedSample).
// Test gắn tag @firstvisit kiểm chính lần ghé đầu tiên (tờ giấy trống + thẻ chào) nên KHÔNG gieo gì.
test.beforeEach(async ({ context }, info) => { if (!info.tags.includes('@firstvisit')) await seedSample(context); });

test('Inspector trên điện thoại (isMobile) không tràn ngang ở 390 và 320px', async ({ browser }) => {
  for (const [w, h] of [[390, 844], [320, 640]] as const) {
    const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('/app/inspect/');
    await page.getByRole('button', { name: 'try an example' }).click();
    await expect(page.locator('.ix-report')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `scrollWidth ở ${w}px`).toBeLessThanOrEqual(w);
    await ctx.close();
  }
});

// Đổi hợp đồng (2026-11-18): khung tĩnh không còn dựng sẵn bài mẫu cắt ngắn và dải `.sf-cta` ("A quiet Markdown editor…"), nên không còn gì để
// trơ [^1]; thay vào đó là thẻ chào trên tờ giấy trống. Test này giữ ý cũ: khung có lời mời viết và bấm là nạp editor.
test('trang chủ: khung tĩnh là tờ giấy trống có thẻ chào (không bài mẫu dựng sẵn), bấm Start writing là nạp editor', { tag: '@firstvisit' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const pv = page.locator('.sf-pv');
  await expect(pv).toBeVisible();
  expect(await pv.evaluate((e) => e.textContent ?? '')).not.toContain('[^');
  await expect(page.locator('.studio-facade .welcome')).toContainText(/Write\. Preview\.\s*Inspect\./);
  await expect(page.locator('.studio-facade')).not.toContainText('Better meetings');
  await page.getByRole('button', { name: /Start writing/ }).click();
  await expect(page.locator('.pv[data-studio=ready], html[data-studio=ready]').first()).toBeAttached();
  await expect(ta(page)).toBeVisible();
});

test('New mở tab mới không hỏi, chữ cũ ở lại tab của nó', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; void d.dismiss(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# my work\n\nimportant text');
  await newDocument(page);
  await expect(ta(page)).toHaveValue('');
  await expect(page.locator('.pv-tabgo')).toHaveCount(2);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(dialogs).toBe(0);
  await page.locator('.pv-tabgo').first().click();
  await expect(ta(page)).toHaveValue('# my work\n\nimportant text');
});

test('palette tìm được publish vault, xoá writing log, authorship start over', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# keep me');
  for (const [q, name] of [['publish', /Open folder as vault/], ['writing log', /Clear writing log/], ['start over', /Start over authorship marks/]] as const) {
    await page.keyboard.press('Control+/');
    await page.getByRole('textbox', { name: 'Command palette' }).fill(q);
    await expect(page.locator('.pal-row, [role=option]').filter({ hasText: name }).first()).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('⌘/Ctrl+/ mở Palette trong ô soạn, ngoài ô soạn và trong Zen; nhãn nói đúng phím đó', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const dlg = page.locator('[role=dialog]');
  await ta(page).click();
  await page.keyboard.press('Control+/');
  await expect(dlg).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await page.locator('.appbar').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Control+/');
  await expect(dlg).toHaveCount(1);
  await page.keyboard.press('Escape');
  // ba nơi hiển thị cùng một phím
  await expect(page.getByRole('button', { name: 'Search or run a command' })).toHaveAttribute('title', /Ctrl\+\//);
  await page.locator('.appbar').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toContainText('command palette, anywhere');
  await page.keyboard.press('Escape');
  await ta(page).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await expect(page.locator('.pv')).toHaveAttribute('data-zen', '1');
  await expect(page.locator('.zc-hint')).toContainText('/ commands');
  await page.keyboard.press('Control+/');
  await expect(dlg).toHaveCount(1);
});

// Đổi hợp đồng (2026-11-18): bài mặc định không còn là bài mẫu nên khách mới trên điện thoại không còn cần mở ở Read để đọc nó; họ vào Edit
// và thấy thẻ chào. Người đã có tài liệu vẫn ở Edit và không thấy thẻ.
test('điện thoại: khách mới vào Edit và thấy thẻ chào, người đã có tài liệu ở Edit và không thấy thẻ', async ({ browser }) => {
  const a = await browser.newContext(phone);
  const p1 = await a.newPage();
  await p1.goto('/app/');
  await ready(p1);
  await expect(p1.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(p1.locator('.pv .welcome')).toBeVisible();
  await a.close();
  const b = await browser.newContext(phone);
  await b.addInitScript(() => { try { localStorage.setItem('mdprev-md', '# mine\n'); } catch { /* bỏ qua */ } });
  const p2 = await b.newPage();
  await p2.goto('/app/');
  await ready(p2);
  await expect(p2.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(p2.locator('.pv .welcome')).toHaveCount(0);
  await b.close();
});

test('điện thoại: nút thanh trạng thái cao ≥44px, chạm vào mép đúng nút', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  for (const name of ['changes', /No issues/]) {
    const b = page.locator('.pv-mode').getByRole('button', { name });
    const r = (await b.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44);
    for (const [x, y] of [[r.x + 2, r.y + 2], [r.x + r.width - 2, r.y + r.height - 2]] as const) {
      expect(await page.evaluate(([px, py]) => { const el = document.elementFromPoint(px!, py!); return !!el?.closest('.pv-modebtn'); }, [x, y])).toBe(true);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await ctx.close();
});

test('sơ đồ và công thức lỗi báo ngay trong bản xem, kèm lý do', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('mdprev-md', '# t\n\n```mermaid\ngraph TD\n  A -->> ???[\n```\n\n$$ \\frac{ $$\n'); } catch { /* bỏ qua */ } });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.locator('.md-doc .mm-err')).toContainText('Diagram error:', { timeout: 15000 });
  const f = page.locator('.md-doc .katex-error').first();
  await expect(f).toBeVisible();
  expect(await f.getAttribute('title')).toMatch(/^Formula error: .+/);
});

test('skip link đưa focus vào ô soạn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.keyboard.press('Tab');
  const link = page.getByRole('link', { name: 'Skip to editor' });
  await expect(link).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(ta(page)).toBeFocused();
});

test('menu File: Reopen closed tab đưa lại tài liệu vừa đóng (Alt+W rồi mở lại)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# First doc\n\nalpha');
  await newDocument(page);
  await ta(page).fill('# Second doc\n\nbeta');
  await page.keyboard.press('Alt+w');
  await expect(ta(page)).toHaveValue('# First doc\n\nalpha');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const item = page.locator('.pv-menu').getByRole('button', { name: /Reopen closed tab/ });
  await expect(item).toContainText('Second doc');
  await item.click();
  await expect(ta(page)).toHaveValue('# Second doc\n\nbeta');
});

test('điện thoại, trang chủ: "Start writing" vào Edit và focus ô soạn (không rơi vào Read)', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: /Start writing/ }).click();
  await expect(ta(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(ta(page)).toBeFocused();
  await ctx.close();
});

test('Recent không liệt kê bản cũ của chính tài liệu đang mở (kể cả bản đã lưu bằng ⌘S) và không trùng tài liệu khác', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# First doc\n\nalpha');
  await page.keyboard.press('Control+s'); // bản chụp 'saved' mang tên tệp suy ra từ tiêu đề
  await newDocument(page);
  await ta(page).fill('# Second doc\n\nbeta');
  await page.keyboard.press('Control+s');
  await ta(page).fill('# Second doc\n\nbeta, edited');
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const recent = page.locator('.pv-menu .pv-menu-sub').filter({ has: page.locator('span', { hasText: /ago|just now/ }) });
  await expect(recent.filter({ hasText: /first/i })).toHaveCount(1); // một mục duy nhất cho First doc, dù có bản 'saved' và 'replaced'
  await expect(recent.filter({ hasText: /second/i })).toHaveCount(0); // bản cũ của tài liệu đang mở không hiện
});

test('Zen mở ở mặt Read, giữ đúng chỗ đang soạn, Alt+V quay lại Write với con trỏ cũ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const doc = Array.from({ length: 40 }, (_, i) => `## Section ${i + 1}\n\nParagraph of section ${i + 1} with some words to fill the line.\n`).join('\n');
  await page.addInitScript((d) => { try { localStorage.setItem('mdprev-md', d); } catch { /* bỏ qua */ } }, doc);
  await page.goto('/app/');
  await ready(page);
  const at = doc.indexOf('Paragraph of section 30') + 5;
  await ta(page).evaluate((t: HTMLTextAreaElement, p) => { t.focus(); t.setSelectionRange(p, p); }, at);
  await page.getByRole('button', { name: 'Zen', exact: true }).click();
  await expect(page.locator('.zc-mode button[aria-pressed=true]')).toHaveText('Read');
  const h = page.locator('.pv-out .md-doc [data-line]', { hasText: 'section 30' }).first();
  await expect(h).toBeInViewport({ timeout: 5000 });
  await page.keyboard.press('Alt+v');
  await expect(page.locator('.zc-mode button[aria-pressed=true]')).toHaveText('Write');
  await expect(ta(page)).toBeFocused();
  expect(await ta(page).evaluate((t: HTMLTextAreaElement) => t.selectionStart)).toBe(at);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe sạch trong Zen với bảng cài đặt mở, mặt Read (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    await page.getByRole('button', { name: 'Zen', exact: true }).click();
    await page.mouse.move(900, 300);
    await page.getByRole('button', { name: 'Zen settings' }).click();
    await expect(page.getByRole('group', { name: 'Zen settings' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await ctx.close();
  });
}

test('điện thoại 390 và 320px: bảng cài đặt Zen nằm trọn trong màn hình, không tràn ngang', async ({ browser }) => {
  for (const [w, h] of [[390, 844], [320, 640]] as const) {
    const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    await page.getByRole('button', { name: 'Zen', exact: true }).tap();
    await page.locator('.zc-more').tap();
    await expect(page.locator('.zc-menu')).toBeVisible();
    const m = await page.locator('.zc-menu').boundingBox();
    expect(m!.x, `menu lọt mép trái ở ${w}px`).toBeGreaterThanOrEqual(0);
    expect(m!.x + m!.width, `menu lọt mép phải ở ${w}px`).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await ctx.close();
  }
});

test('Palette: "Zen, write" mở thẳng mặt Write, "Zen mode" mở mặt Read', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const pal = page.locator('[role=dialog][aria-label="Command palette"]');
  const run = async (q: string, expectText: string) => {
    await page.keyboard.press('Control+/');
    await expect(pal.locator('input')).toBeFocused();
    await page.keyboard.type(q);
    await expect(pal).toContainText(expectText);
    await page.keyboard.press('Enter');
    await expect(pal).toHaveCount(0);
  };
  await run('zen write', 'Zen, write');
  await expect(page.locator('.pv')).toHaveAttribute('data-zen', '1');
  await expect(page.locator('.zc-mode button[aria-pressed=true]')).toHaveText('Write');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pv')).not.toHaveAttribute('data-zen', '1');
  await run('zen mode', 'Zen mode');
  await expect(page.locator('.zc-mode button[aria-pressed=true]')).toHaveText('Read');
});

// ---- đợt sửa sau lượt kiểm toán thứ hai ----
test('Inspector (điện thoại): nhãn dài nhất trong dòng script không làm trang tràn ngang', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/app/inspect/');
  await page.getByRole('button', { name: 'try an example' }).click();
  await expect(page.locator('.ix-report')).toBeVisible();
  await page.evaluate(() => document.querySelectorAll('.ix-script .ix-tag').forEach((e) => { e.textContent = 'NOTHING TO REVIEW'; }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await ctx.close();
});

test('bấm vào bản xem không lấy focus của ô soạn: phím đơn (?) vẫn mở trợ giúp, văn bản không bị gõ vào', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // cần một bài có đoạn văn để bấm vào bản xem: bài mặc định hiện là tờ giấy trống nên gieo bài nhỏ (không đổi điều test canh)
  await page.addInitScript(() => { try { localStorage.setItem('mdprev-md', '# T\n\nsome paragraph'); localStorage.setItem('mdprev-welcomed', '1'); } catch { /* bỏ qua */ } });
  await page.goto('/app/');
  await ready(page);
  const before = await ta(page).inputValue();
  await page.locator('.pv-out p').first().click();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('TEXTAREA');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await ta(page).inputValue()).toBe(before);
});

test('điện thoại: không còn nút Split, nút ? và ký hiệu ⌘; nút tìm kiếm là kính lúp; không tràn ngang ở 320px', async ({ browser }) => {
  for (const [w, h] of [[390, 844], [320, 640]] as const) {
    const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    await expect(page.getByRole('button', { name: 'Split', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
    await expect(page.locator('.appbar-search .ic-cmd')).toBeHidden();
    await expect(page.locator('.appbar-search .ic-find')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `scrollWidth ở ${w}px`).toBeLessThanOrEqual(w);
    await ctx.close();
  }
});

test('Zen trên điện thoại: không hiện gợi ý phím Alt/Ctrl', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Zen', exact: true }).tap();
  await page.locator('.zc-more').tap();
  await expect(page.locator('.zc-menu')).toBeVisible();
  await expect(page.locator('.zc-hint')).toBeHidden();
  await expect(page.locator('.zc-menu kbd').first()).toBeHidden();
  await ctx.close();
});

test('Reopen closed tab ghi tiêu đề thật (không phải dòng title: của front matter)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('---\ntitle: My Real Title\n---\n\nbody');
  await newDocument(page);
  await ta(page).fill('second');
  await page.locator('.pv-tab').first().getByRole('button', { name: /^Close/ }).click();
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const rp = page.locator('.pv-menu').getByRole('button', { name: /Reopen closed tab/ });
  await expect(rp).toContainText('My Real Title');
  await expect(rp).not.toContainText('title:');
});

test('palette tìm được Sample, New from template và Open from a link; mở lại palette thì ô nhập trống', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# Alpha doc\n\ntext');
  const pal = page.locator('[role=dialog][aria-label="Command palette"]');
  const input = pal.locator('input');
  await page.keyboard.press('Control+/');
  await expect(input).toBeFocused();
  await page.keyboard.type('sample');
  await expect(pal).toContainText('Load the sample document');
  await page.keyboard.press('Escape');
  await expect(pal).toHaveCount(0);
  await page.keyboard.press('Control+/');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await page.keyboard.type('template');
  await expect(pal).toContainText('New from template');
  await page.keyboard.press('Enter');
  await expect(page.locator('.pv-menu').getByRole('button', { name: 'README' })).toBeVisible();
});

test('Zen: Esc đóng bảng cài đặt trước, lần Esc thứ hai mới thoát Zen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Zen', exact: true }).click();
  await page.mouse.move(900, 300);
  await page.locator('.zc-more').click();
  await expect(page.locator('.zc-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.zc-menu')).toHaveCount(0);
  await expect(page.locator('.pv')).toHaveAttribute('data-zen', '1');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pv')).not.toHaveAttribute('data-zen', '1');
});

// Đổi hợp đồng (2026-11-18): không còn dải lời mời `.sf-cta` có chữ; hàng đó chỉ giữ chỗ cho thanh tài liệu. Test giữ ý cũ "lời mời không đè
// lên phần dưới": thẻ chào nằm trọn giữa hàng giữ chỗ và đáy khung, căn giữa màn hình.
test('trang chủ: thẻ chào nằm giữa thanh tài liệu và đáy khung, căn giữa, không đè lên thanh', { tag: '@firstvisit' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const bar = (await page.locator('.sf-cta').boundingBox())!, fa = (await page.locator('.studio-facade').boundingBox())!, st = (await page.locator('.studio-facade .wc-stack').boundingBox())!;
  expect(st.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(st.y + st.height).toBeLessThanOrEqual(fa.y + fa.height);
  expect(Math.abs(st.x + st.width / 2 - 720)).toBeLessThan(2);
});

test('Ctrl+Z hoàn tác cả đoạn vừa gõ liền một mạch (không còn lùi từng ký tự)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  const before = await ta(page).inputValue();
  await page.keyboard.type('hello brave new world', { delay: 60 });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await ta(page).inputValue()).length).toBeLessThanOrEqual(before.length + 2);
});

test('điện thoại: vùng chạm của nút chính nới theo chiều dọc (kiểm bằng elementFromPoint ở mép), nút chọn chế độ rộng ≥36px', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  const probe = async (loc: ReturnType<Page['locator']>, label: string, below = 3) => {
    const r = (await loc.boundingBox())!;
    const cx = r.x + r.width / 2;
    for (const dy of [-3, r.height + below]) { // ngoài hình thấy được 3px nhưng trong vùng nới (mỗi hàng chrome chỉ dư ~4px mỗi phía)
      const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x!, y!); return el?.closest('button, a, summary')?.getAttribute('aria-label') ?? el?.closest('button, a, summary')?.textContent?.trim() ?? ''; }, [cx, r.y + dy]);
      expect(hit, `${label} nhận chạm ở lệch ${dy}`).not.toBe('');
    }
  };
  await probe(page.getByRole('button', { name: 'New document' }), 'New');
  expect((await page.getByRole('button', { name: 'Switch theme' }).boundingBox())!.height, 'theme cao ≥40px').toBeGreaterThanOrEqual(40);
  await probe(page.getByRole('button', { name: 'Edit', exact: true }), 'Edit', 1);
  for (const n of ['Edit', 'Read', 'Zen']) expect((await page.getByRole('button', { name: n, exact: true }).boundingBox())!.width, n).toBeGreaterThanOrEqual(36);
  await ctx.close();
});

test('trang chủ, khách mới: "Skip to editor" (Tab rồi Enter) nạp editor và đưa focus vào ô soạn', { tag: '@firstvisit' }, async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari mặc định không cho Tab dừng ở liên kết (cần Option+Tab)');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to editor' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(ta(page)).toBeVisible({ timeout: 15000 });
  await expect(ta(page)).toBeFocused();
});

test('Split: nhấp đơn vào bản xem không lấy focus, nhấp đúp chuyển focus sang ô soạn tại dòng đó', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const h2 = page.locator('.pv-out .md-doc h2').nth(1);
  await h2.click();
  await expect(ta(page)).not.toBeFocused();
  await h2.dblclick();
  await expect(ta(page)).toBeFocused();
});

/* ---- đợt 3 (2026-11-15): các việc còn lại của danh sách kiểm toán ---- */
const setDoc = async (page: Page, md: string) => { await ta(page).fill(md); await page.waitForTimeout(400); };

test('slide 1 của bài mẫu vừa khung, không phải cuộn (1440x900 và 1280x720)', async ({ page }) => {
  for (const [w, h] of [[1440, 900], [1280, 720]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/app/');
    await ready(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('s');
    await expect(page.locator('.sv-canvas').first()).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.locator('.sv-canvas').first().getAttribute('data-overflow'), `${w}x${h}`).toBeFalsy();
    await page.keyboard.press('Escape');
  }
});

test('điện thoại: bảng rộng cuộn ngang trong chính nó, trang không tràn', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await setDoc(page, '| a | b | c | d | e | f | g | h |\n|---|---|---|---|---|---|---|---|\n' + '| ' + Array.from({ length: 8 }, (_, i) => 'cell-number-' + i + '-with-long-words').join(' | ') + ' |\n');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const t = page.locator('.pv-out .md-doc table').first();
  await expect(t).toBeVisible();
  expect(await t.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  expect(await t.evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await ctx.close();
});

test('Zen: gợi ý phím không chồng lên cụm Write/Read, cũng không chồng lên nút Copy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Zen', exact: true }).click();
  const hint = page.locator('.zc-hint');
  await expect(hint).toBeVisible();
  await page.mouse.move(600, 300); await page.mouse.move(640, 320);
  const box = async (s: string) => (await page.locator(s).first().boundingBox())!;
  const h = await box('.zc-hint');
  for (const s of ['.zc-corner', '.zc-top']) {
    const o = await box(s);
    const overlap = h.x < o.x + o.width && o.x < h.x + h.width && h.y < o.y + o.height && o.y < h.y + h.height;
    expect(overlap, `hint đè ${s}`).toBe(false);
  }
});

test('Zen Read: vuốt đọc ẩn chrome một lần và giữ ẩn, không nháy lại giữa lúc cuộn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Zen', exact: true }).click();
  await expect(page.locator('.zc-hint')).toBeHidden({ timeout: 9000 }); // lần vào đầu tiên gợi ý phím giữ chrome hiện 6 giây
  await page.mouse.move(700, 400); await page.mouse.move(720, 410);
  await expect(page.locator('.zc-top')).toHaveClass(/\bon\b/);
  // lấy mẫu liên tục trong lúc cuộn bằng bánh xe: sau khi đã ẩn thì không được hiện lại
  await page.evaluate(() => {
    const w = window as unknown as { __samples: boolean[] };
    w.__samples = [];
    const top = document.querySelector('.zc-top')!;
    const tick = () => { w.__samples.push(top.classList.contains('on')); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 140); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => (window as unknown as { __samples: boolean[] }).__samples);
  const firstOff = s.indexOf(false);
  expect(firstOff, 'chrome phải ẩn khi cuộn').toBeGreaterThanOrEqual(0);
  expect(s.slice(firstOff).includes(true), 'chrome nháy hiện lại khi đang cuộn').toBe(false);
});

test('Zen: Copy và ⋯ là thẻ phẳng, không đổ bóng', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Zen', exact: true }).click();
  for (const s of ['.zc-split', '.zc-stats']) expect(await page.locator(s).first().evaluate((e) => getComputedStyle(e).boxShadow), s).toBe('none');
});

test('thanh định dạng ở 800px: mọi nút hiện trọn trong thanh, phần thừa vào ⋯', async ({ page }) => {
  for (const w of [760, 800, 860, 899]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/app/');
    await ready(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.waitForTimeout(500);
    const out = await page.evaluate(() => {
      const el = document.querySelector('.pv-tools')!; const er = el.getBoundingClientRect(); const bad: string[] = [];
      for (const t of el.querySelectorAll('.pv-tool')) { const r = t.getBoundingClientRect(); if (r.width && (r.right > er.right + 0.5 || r.left < er.left - 0.5)) bad.push(t.getAttribute('aria-label') ?? '?'); }
      return { bad, over: el.scrollWidth - el.clientWidth };
    });
    expect(out.bad, `nút bị cắt ở ${w}px`).toEqual([]);
    expect(out.over, `thanh cuộn ngang ở ${w}px`).toBeLessThanOrEqual(1);
  }
});

test('"Saved" chỉ hiện một chỗ (thanh tài liệu), "Open" chỉ ở header: File ▾ không lặp lại', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).click(); await page.keyboard.type('x'); await page.waitForTimeout(900);
  const visibleSaved = await page.getByText(/^Saved \d\d:\d\d$/).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).clip !== 'rect(0px, 0px, 0px, 0px)' && (e as HTMLElement).getBoundingClientRect().width > 2).length);
  expect(visibleSaved).toBe(1);
  await page.getByRole('button', { name: 'File menu', exact: true }).click();
  const dd = page.locator('.pv-menu-file');
  for (const n of ['Open…', 'Open URL…', 'New']) await expect(dd.getByRole('button', { name: n, exact: true })).toBeHidden();
  await expect(dd.getByRole('link', { name: 'Open a skill…' })).toHaveCount(0);
  await expect(dd.getByRole('button', { name: 'Save as…' })).toBeVisible();
});

test('Nhóm chế độ: Edit, Zen, Split, Read | Present, Split ở giữa, không còn nút lẻ ở mép phải; bấm là trình chiếu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const btn = page.locator('.pv-bar .pv-seg .pv-presentseg');
  await expect(btn).toBeVisible();
  await expect(page.locator('.pv-acts .pv-presentseg')).toHaveCount(0);
  const names = await page.locator('.pv-seg button').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetWidth > 0).map((e) => e.getAttribute('aria-label')));
  expect(names).toEqual(['Edit', 'Zen', 'Split', 'Read', 'Present']); // Split ở giữa nhóm
  const sp = (await page.locator('.pv-seg .pv-desk').boundingBox())!, seg = (await page.locator('.pv-seg').boundingBox())!;
  expect(Math.abs(sp.x + sp.width / 2 - (seg.x + seg.width / 2))).toBeLessThan(40);
  await btn.click();
  await expect(page.locator('.sv-canvas').first()).toBeVisible();
});

test('ảnh ngoài 404 hiện dòng báo thay vì ô trống', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://img.example.test/**', (r) => r.fulfill({ status: 404, body: 'no' }));
  await page.goto('/app/');
  await ready(page);
  await setDoc(page, '# T\n\n![Architecture diagram](https://img.example.test/missing.png)\n');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const note = page.locator('.pv-out .md-doc .img-broken');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Architecture diagram');
  await expect(note).toContainText('img.example.test');
});

test('ô tên file có vòng focus rõ (outline 2px)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('textbox', { name: 'File name' }).focus();
  const o = await page.getByRole('textbox', { name: 'File name' }).evaluate((e) => { const c = getComputedStyle(e); return { w: c.outlineWidth, s: c.outlineStyle }; });
  expect(o).toEqual({ w: '2px', s: 'solid' });
});

test('hộp ? nằm gọn trong màn hình cao 900 và 600, phần thừa cuộn trong thân hộp', async ({ page }) => {
  for (const h of [900, 600]) {
    await page.setViewportSize({ width: 1440, height: h });
    await page.goto('/app/');
    await ready(page);
    await page.getByRole('button', { name: /Keyboard shortcuts|Help/i }).first().click();
    const hp = page.locator('.hp');
    await expect(hp).toBeVisible();
    const r = (await hp.boundingBox())!;
    expect(r.y, `đầu hộp ở cao ${h}`).toBeGreaterThanOrEqual(0);
    expect(r.y + r.height, `đáy hộp ở cao ${h}`).toBeLessThanOrEqual(h);
    await page.keyboard.press('Escape');
  }
});

test('hàng tài liệu: nhóm chế độ, Present và tên file không chồng nhau ở mọi bề rộng, kể cả khi Inspector mở', async ({ page }) => {
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const check = async (label: string) => {
    const seg = await page.locator('.pv-bar .pv-seg').boundingBox();
    const nm = await page.locator('.pv-bar .pv-title').boundingBox();
    if (nm && seg) expect(overlap(nm, seg), `${label}: tên file đè nhóm chế độ`).toBe(false);
    expect(await page.locator('.pv-bar').evaluate((e) => e.scrollWidth - e.clientWidth), `${label}: hàng tài liệu tràn`).toBeLessThanOrEqual(1);
  };
  for (const w of [700, 800, 899, 1100, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/app/');
    await ready(page);
    await check(`${w}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: /Inspector/ }).first().click();
  await page.waitForTimeout(500);
  await check('1440 + Inspector');
  const pr = (await page.locator('.pv-bar .pv-presentseg').boundingBox())!;
  const pv = await page.locator('.pv-out').boundingBox();
  const insp = await page.locator('.pv-insp').first().boundingBox();
  if (insp) expect(pr.x + pr.width, 'Present nằm bên trái Inspector').toBeLessThanOrEqual(insp.x + 1);
  if (pv) expect(pr.x, 'Present nằm trên cột đọc').toBeGreaterThanOrEqual(pv.x - 1);
});

test('điện thoại: vuốt đọc trong Zen không làm chrome nháy', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'dùng CDP Input.dispatchTouchEvent, chỉ có ở Chromium');
  const ctx = await browser.newContext({ ...phone });
  await seedSample(ctx); // bài mặc định giờ là tờ giấy trống: gieo bài mẫu như trước (xem seedSample)
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  // điện thoại giờ mở ở Edit (trước đây khách mới mở ở Read); bài test này vuốt ĐỌC nên vào Read rồi mới vào Zen
  await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Read', exact: true }).click();
  await page.getByRole('group', { name: 'View mode' }).getByRole('button', { name: 'Zen', exact: true }).click();
  await expect(page.locator('.zc-hint')).toBeHidden({ timeout: 9000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const w = window as unknown as { __s: boolean[] };
    w.__s = [];
    const top = document.querySelector('.zc-top')!;
    const tick = () => { w.__s.push(top.classList.contains('on')); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type: string, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });
  await touch('touchStart', 600);
  for (let i = 1; i <= 14; i++) { await touch('touchMove', 600 - i * 30); await page.waitForTimeout(30); }
  await touch('touchEnd', 180);
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => (window as unknown as { __s: boolean[] }).__s);
  const firstOff = s.indexOf(false);
  if (firstOff >= 0) expect(s.slice(firstOff).includes(true), 'chrome nháy hiện lại khi đang vuốt').toBe(false);
  expect(await page.locator('.pv-out').evaluate((e) => e.scrollTop), 'phép vuốt phải cuộn được').toBeGreaterThan(50);
  await ctx.close();
});

const m0 = (b: { y: number; height: number } | null) => b!.y + b!.height;
test('điện thoại: Zen có nút × thoát một chạm, bảng ⋯ tới được "Exit Zen" ở mọi cỡ và không bị dải thống kê đè', async ({ browser }) => {
  for (const [w, h] of [[390, 664], [320, 568], [375, 300]] as const) {
    const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    await page.getByRole('button', { name: 'Zen', exact: true }).tap();
    await page.locator('.zc-more').tap();
    await expect(page.locator('.zc-menu')).toBeVisible();
    const mb = (await page.locator('.zc-menu').boundingBox())!;
    const sb = (await page.locator('.zc-stats').boundingBox())!;
    expect(mb.y + mb.height, `thẻ Zen nằm trên dải Write/Read ở ${w}×${h}`).toBeLessThanOrEqual(sb.y + 1);
    expect(mb.x, `thẻ Zen trong khung ở ${w}`).toBeGreaterThanOrEqual(-0.5);
    expect(mb.x + mb.width, `thẻ Zen trong khung bên phải ở ${w}`).toBeLessThanOrEqual(w + 0.5);
    const hit = await page.evaluate(() => {
      const e = document.querySelector('.zc-menu .zc-exit')!.getBoundingClientRect();
      return document.elementFromPoint(e.x + e.width / 2, e.y + e.height / 2)?.closest('.zc-exit') !== null;
    });
    expect(hit, `Exit Zen bị đè ở ${w}×${h}`).toBe(true);
    const m = await page.locator('.zc-menu').boundingBox();
    expect(m!.y + m!.height, `bảng vượt đáy ở ${w}×${h}`).toBeLessThanOrEqual(h);
    await page.keyboard.press('Escape');
    await page.locator('.zc-x').tap();
    await expect(page.locator('.pv')).not.toHaveAttribute('data-zen', '1');
    await ctx.close();
  }
});

test('điện thoại 320px: menu Open ▾ nằm trọn trong màn hình, ô nhập 16px không bị iOS phóng to', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 320, height: 568 } });
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: /^Open/ }).first().tap();
  const r = await page.locator('.pv-menu-open').boundingBox();
  expect(r!.x).toBeGreaterThanOrEqual(0);
  expect(r!.x + r!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.pv-name, .ed-ta')!).fontSize))).toBeGreaterThanOrEqual(16);
  await ctx.close();
});

/** Đợt 4 (feedback độc lập của Muse + thanh trạng thái lệch). */
test('trang chủ: thanh trạng thái dính liền thanh "What is mdprev?", không còn dải 12px hở giữa', { tag: '@firstvisit' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /Start writing/ }).click();
  await expect(ta(page)).toBeVisible();
  const [mode, about] = await Promise.all([page.locator('.pv-mode').boundingBox(), page.locator('.about-bar').boundingBox()]);
  expect(Math.abs(about!.y - (mode!.y + mode!.height))).toBeLessThanOrEqual(1);
  expect(about!.y + about!.height).toBeLessThanOrEqual(900.5);
});

// Đổi hợp đồng (2026-11-18): nút "Blank document" không còn (bài mặc định đã là tờ giấy trống); "Start writing" của thẻ chào mở đúng tài liệu trống đó.
test('"Start writing" ở khung tĩnh nạp editor với tài liệu trống', { tag: '@firstvisit' }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start writing' }).click();
  await expect(ta(page)).toBeVisible({ timeout: 15000 });
  await expect(ta(page)).toHaveValue('');
  await expect(page.locator('.pv-empty')).toContainText('Nothing to preview yet');
});

test('New document: bản xem của tài liệu cũ không còn lộ ra, không có toast Undo (tài liệu cũ vẫn ở tab của nó)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# Old heading\n\nold text');
  await expect(page.locator('.md-doc h1')).toHaveText('Old heading');
  await newDocument(page);
  for (let i = 0; i < 8; i++) { await expect(page.locator('.md-doc')).not.toContainText('Old heading', { timeout: 1000 }); await page.waitForTimeout(80); }
  await expect(page.locator('.pv-toast')).toHaveCount(0);
  await page.locator('.pv-tabgo').first().click();
  await expect(page.locator('.md-doc h1')).toHaveText('Old heading');
});

test('task list trong bản xem: bấm checkbox đổi [ ] ↔ [x] trong nguồn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# T\n\n- [ ] one\n- [x] two\n');
  const cb = page.locator('.md-doc .task-list-item input');
  await expect(cb).toHaveCount(2);
  await cb.nth(0).click();
  await expect(ta(page)).toHaveValue('# T\n\n- [x] one\n- [x] two\n');
  await cb.nth(1).click();
  await expect(ta(page)).toHaveValue('# T\n\n- [x] one\n- [ ] two\n');
});

test('Zen mở đúng mặt đang dùng: Edit vào Write, Read vào Read', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Zen', exact: true }).click();
  await expect(page.locator('.pv')).not.toHaveAttribute('data-zread', '1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await page.getByRole('button', { name: 'Zen', exact: true }).click();
  await expect(page.locator('.pv')).toHaveAttribute('data-zread', '1');
});

test('palette có lệnh "Install mdprev as an app" và chạy được (báo hướng dẫn khi trình duyệt chưa cho cài)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.keyboard.press('Control+/');
  await page.keyboard.type('install');
  await expect(page.locator('[role=dialog][aria-label="Command palette"]')).toContainText('Install mdprev as an app');
  await page.keyboard.press('Enter');
  await expect(page.locator('.pv-flash, .pv-modetag').first()).toBeVisible();
});

test('sơ đồ Mermaid có tên truy cập và cuộn bằng bàn phím được', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# D\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Finish]\n```\n');
  const fig = page.locator('.md-doc figure.mermaid');
  await expect(fig).toHaveAttribute('role', 'img', { timeout: 20000 });
  await expect(fig).toHaveAttribute('aria-label', /flowchart diagram: .*Start/);
  await expect(fig).toHaveAttribute('tabindex', '0');
});

// Đổi hợp đồng (2026-11-18): "Blank document" không còn; các nút của thẻ chào là Start writing, Open file (nút) và Inspect a skill (liên kết).
test('trang chủ ở 320 và 390px: các nút của thẻ chào trong khung tĩnh nằm trọn trong màn hình, không tràn ngang', async ({ browser }) => {
  for (const w of [320, 390]) {
    const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: 700 } });
    const page = await ctx.newPage();
    await page.goto('/');
    for (const [role, n] of [['button', 'Start writing'], ['button', 'Open file'], ['link', 'Inspect a skill']] as const) {
      const b = await page.locator('.studio-facade .welcome').getByRole(role, { name: new RegExp(n) }).boundingBox();
      expect(b!.x, `${n} @${w}`).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width, `${n} @${w}`).toBeLessThanOrEqual(w);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await ctx.close();
  }
});

test('slide quá cao có mép mờ báo còn nội dung; task trong trích dẫn bấm được và đổi đúng nguồn', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).fill('# T\n\n> - [ ] quoted\n');
  await expect(page.locator('.md-doc .task-list-item input')).toHaveCount(1);
  await page.locator('.md-doc .task-list-item input').click();
  await expect(ta(page)).toHaveValue('# T\n\n> - [x] quoted\n');
  await ta(page).fill('# Long\n\n' + Array.from({ length: 60 }, (_, i) => `- item ${i}`).join('\n') + '\n\n---\n\n# End\n');
  await page.getByRole('button', { name: /^Present/ }).first().click();
  const cv = page.locator('.sl-slide .sv-canvas[data-overflow="1"]').first();
  await expect(cv).toHaveAttribute('data-end', '0');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => cv.evaluate((e) => e.scrollTop)).toBeGreaterThan(100); // ↓ cuộn trong slide, chưa sang slide sau
});

test('/skill-inspector/ ở 320px không tràn ngang', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await page.goto('/skill-inspector/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await ctx.close();
});

test('Sync scroll: nút icon trong thanh trạng thái, mặc định bật; tắt thì hai bên cuộn riêng và lựa chọn được nhớ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const btn = page.getByRole('button', { name: 'Sync scroll' });
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await ta(page).fill(Array.from({ length: 60 }, (_, i) => `## Heading ${i}\n\nParagraph ${i} text.\n`).join('\n'));
  await expect(page.locator('.pv-out h2')).toHaveCount(60);
  const scrollEd = () => ta(page).evaluate((e) => { (e as HTMLTextAreaElement).scrollTop = 600; });
  await scrollEd();
  await expect.poll(() => page.locator('.pv-out').evaluate((o) => o.scrollTop)).toBeGreaterThan(50);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.pv-out').evaluate((o) => { o.scrollTop = 0; });
  await page.waitForTimeout(300);
  await ta(page).evaluate((e) => { (e as HTMLTextAreaElement).scrollTop = 1400; });
  await page.waitForTimeout(400);
  expect(await page.locator('.pv-out').evaluate((o) => o.scrollTop)).toBeLessThan(5);
  await page.reload();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Sync scroll' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync scroll' })).toHaveCount(0);
});

test('trang chủ: phần giới thiệu có bốn hình SVG trang trí, đánh số 01–05, chip, và không tràn ngang ở 320/390/1440', async ({ browser }) => {
  for (const [w, h] of [[1440, 900], [390, 844], [320, 640]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    const figs = page.locator('.about svg.fig');
    await expect(figs).toHaveCount(4); // editor, free features, inspector, privacy
    for (let i = 0; i < 4; i++) await expect(figs.nth(i)).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.st-chips li')).toHaveText(['No upload', 'No account', 'No analytics', 'Works offline']);
    const nums = await page.locator('.about .st-sec .st-lbl').evaluateAll((els) => els.map((e) => getComputedStyle(e, '::before').content));
    expect(nums.length).toBe(5); // số mục là CSS counter (getComputedStyle không trả giá trị đã đếm): chỉ kiểm có dùng counter ở cả năm mục
    for (const n of nums) expect(n).toContain('counter(sec');
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `scrollWidth ở ${w}px`).toBeLessThanOrEqual(w);
    await ctx.close();
  }
});

test('Sync scroll: nút không dịch chỗ khi toast hiện, lệnh palette đổi được; mục #about hiện dần (animation-timeline chạy)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const btn = page.getByRole('button', { name: 'Sync scroll' });
  const x0 = (await btn.boundingBox())!.x;
  await btn.click();
  await expect(page.locator('.pv-flash')).toBeVisible();
  expect(Math.abs((await btn.boundingBox())!.x - x0)).toBeLessThan(1);
  await page.keyboard.press('Control+/');
  await page.getByRole('dialog', { name: 'Command palette' }).locator('input').fill('sync scroll');
  await page.keyboard.press('Enter');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/');
  const supported = await page.evaluate(() => CSS.supports('animation-timeline', 'view()'));
  if (supported) expect(await page.locator('.about .st-sec').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('secin');
});

test('vạch dòng hiện tại (xuống dòng bật, mặc định) nằm đúng dòng đang gõ: dòng đầu, dòng sau, sau khi cuộn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const off = () => page.evaluate(() => {
    const cur = document.querySelector('.ed-cur')!.getBoundingClientRect();
    const t = document.querySelector('.ed-ta') as HTMLTextAreaElement;
    const ln = t.value.slice(0, t.selectionStart).split('\n').length;
    const l = document.querySelectorAll('.ed-hl .l')[ln - 1]!.getBoundingClientRect();
    return Math.abs(cur.top - l.top);
  });
  await ta(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('s');
  await expect.poll(off).toBeLessThan(1.5);
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await expect.poll(off).toBeLessThan(1.5);
  await ta(page).fill(Array.from({ length: 150 }, (_, i) => `line ${i}`).join('\n'));
  await page.keyboard.press('Control+End');
  await expect.poll(off).toBeLessThan(1.5);
});

// Đổi hợp đồng (2026-11-18): hero cũ (dải `.sf-cta` với `.sf-h`, `.sf-gos`, `svg.sf-art`) được thay bằng thẻ chào. Giữ ý cũ: các nút nằm ngay dưới
// câu mở đầu, cả khối căn giữa màn hình, khung không lộ tên file hay chữ của bài mẫu; nửa sau (nhãn chữ của menu File) không đổi.
test('trang chủ: thẻ chào ≥641px, nút nằm ngay dưới câu mở đầu và cùng căn giữa màn hình, không tên file; menu File có nhãn chữ', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  const h = (await page.locator('.studio-facade .wc-title').boundingBox())!, g = (await page.locator('.studio-facade .wc-btns').boundingBox())!, st = (await page.locator('.studio-facade .wc-stack').boundingBox())!;
  expect(g.y).toBeGreaterThanOrEqual(h.y + h.height - 1);
  expect(Math.abs(st.x + st.width / 2 - 720)).toBeLessThan(2);
  await expect(page.locator('.studio-facade')).not.toContainText('better-meetings.md');
  await expect(page.locator('.studio-facade')).not.toContainText('Checking an agent skill');
  await expect(page.locator('.studio-facade .wc-art')).toBeVisible();
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await c2.newPage();
  await p2.goto('/app/');
  await ready(p2);
  const b = p2.getByRole('button', { name: 'File menu', exact: true });
  await expect(b).toContainText('File');
  await p2.setViewportSize({ width: 1280, height: 800 });
  await expect(b.locator('.pv-fl')).toBeHidden();
  await c2.close();
});

test('Split: vạch con trỏ mặc định tắt; bật trong View options thì bản xem đánh dấu khối ứng với dòng con trỏ và đi theo; Read không có', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await expect(page.locator('.pv-out .pv-cur')).toBeHidden();
  await page.getByRole('button', { name: 'View options' }).click();
  await page.getByRole('button', { name: /Cursor marker/ }).click();
  await page.reload();
  await ready(page);
  await ta(page).fill('# Title\n\nFirst para\n\nSecond para line one\nline two\n\n- a\n- b\n');
  await ta(page).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const bar = page.locator('.pv-out .pv-cur');
  const under = (txt: string) => page.evaluate((t) => {
    const b = document.querySelector('.pv-out .pv-cur') as HTMLElement | null;
    if (!b || b.hidden) return false;
    const r = b.getBoundingClientRect();
    const el = [...document.querySelectorAll('.pv-out .md-doc p, .pv-out .md-doc li, .pv-out .md-doc h1')].find((e) => (e.textContent ?? '').includes(t));
    if (!el) return false;
    const e = el.getBoundingClientRect();
    return Math.abs(r.top - e.top) < 2 && Math.abs(r.height - e.height) < 2;
  }, txt);
  await expect(bar).toBeVisible();
  await expect.poll(() => under('First para')).toBe(true);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => under('Second para line one')).toBe(true);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(bar).toBeHidden();
});

test('thoát Zen bằng Esc không để lại vòng focus ở bản xem; Present nằm trong nhóm chế độ; lề trái/phải của header, hàng tài liệu, thanh công cụ và trạng thái thẳng nhau (16px)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await page.getByRole('button', { name: 'Zen', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pv')).not.toHaveAttribute('data-zen', '1');
  expect(await page.evaluate(() => document.activeElement === document.querySelector('.pv-out'))).toBe(false);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.pv-seg').getByRole('button', { name: 'Present' })).toBeVisible();
  await expect(page.locator('.pv-acts').getByRole('button', { name: 'Present' })).toHaveCount(0);
  await page.waitForTimeout(400); // bố cục (nhóm chế độ, nút Sync) cần ổn định trước khi đo
  const x = await page.evaluate(() => {
    const L = (e: Element | null) => e!.getBoundingClientRect().left, R = (e: Element | null) => e!.getBoundingClientRect().right;
    const vis = (s: string) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0);
    const ex = vis('.appbar button, .appbar a').pop()!;
    return { logo: L(document.querySelector('.appbar svg')), name: L(document.querySelector('.pv-name')) + 9, tb: L(document.querySelector('.pv-tools svg')), st: L(document.querySelector('.pv-modetag')), ex: innerWidth - R(ex), sync: innerWidth - R(vis('.pv-mode svg').pop()!) };
  });
  for (const k of ['logo', 'name', 'tb', 'st']) expect(Math.abs((x as Record<string, number>)[k]! - 16), k).toBeLessThanOrEqual(1);
  expect(Math.abs(x.ex - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(x.sync - 16)).toBeLessThanOrEqual(1);
});

test('thanh công cụ: các nhóm có tên và vạch chia mảnh; bản xem không còn viền focus khi đổi chế độ rồi quay lại; vạch con trỏ chỉ là một vạch mảnh', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/app/');
  await ready(page);
  const names = await page.locator('.pv-tools [role="group"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names).toEqual(['History', 'Text style', 'Headings', 'Lists', 'Blocks', 'Insert']);
  const hasDivider = await page.locator('.pv-tools .pv-grp').nth(1).evaluate((e) => { const c = getComputedStyle(e, '::after'); return c.content !== 'none' && c.display !== 'none' && c.width === '1px'; });
  expect(hasDivider).toBe(true);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await page.locator('.pv-out').focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  const ring = await page.locator('.pv-out').evaluate((e) => { const c = getComputedStyle(e); return { o: c.outlineStyle, s: c.boxShadow }; });
  expect(ring.s).toBe('none');
  expect(ring.o === 'none' || ring.o === '').toBe(true);
  await page.getByRole('button', { name: 'View options' }).click();
  await page.getByRole('button', { name: /Cursor marker/ }).click();
  await ta(page).click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pv-out .pv-cur')).toBeVisible();
  const w = await page.locator('.pv-out .pv-cur').evaluate((e) => (e as HTMLElement).getBoundingClientRect().width);
  expect(w).toBeLessThanOrEqual(4);
});

// Đổi hợp đồng (2026-11-18): "Blank document" không còn; Tab tới "Start writing" của thẻ chào vẫn chưa nạp gì (nút còn đó), Enter mở tài liệu trống.
test('trang chủ: Tab tới "Start writing" chưa nạp gì và Enter mở tài liệu trống; bật lại Sync scroll căn lại bản xem', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Start writing' }).focus();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: 'Start writing' })).toBeVisible(); // Tab tới nút chưa nạp gì và nút còn đó
  await page.keyboard.press('Enter');
  await expect(ta(page)).toBeVisible({ timeout: 15000 });
  await expect(ta(page)).toHaveValue(''); // Enter trên nút: tài liệu trống
  await ctx.close();
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.goto('/app/');
  await ready(p2);
  await ta(p2).fill(Array.from({ length: 60 }, (_, i) => `## Heading ${i}\n\nParagraph ${i} text.\n`).join('\n'));
  await expect(p2.locator('.pv-out h2')).toHaveCount(60);
  const btn = p2.getByRole('button', { name: 'Sync scroll' });
  await btn.click(); // tắt
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await p2.locator('.pv-out').evaluate((o) => { o.scrollTop = 0; });
  await p2.waitForTimeout(200);
  await ta(p2).evaluate((e) => { (e as HTMLTextAreaElement).scrollTop = 900; });
  await p2.waitForTimeout(300);
  expect(await p2.locator('.pv-out').evaluate((o) => o.scrollTop)).toBeLessThan(5);
  await btn.click(); // bật lại: căn ngay, không cần cuộn
  await expect.poll(() => p2.locator('.pv-out').evaluate((o) => o.scrollTop)).toBeGreaterThan(50);
  await p2.close();
});

test('điện thoại: menu File/Open/View/Export là bảng trượt từ đáy, trong khung nhìn ở 320/360/390, chạm lớp mờ thì đóng', async ({ browser }) => {
  for (const [w, h] of [[320, 640], [360, 740], [390, 844]] as const) {
    const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    const openers: [string, string][] = [['File menu', '.pv-menu-file'], ['Open menu', '.pv-menu-open'], ['View options', '.pv-menu-view']];
    for (const [name, sel] of openers) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(260); // chờ hiệu ứng trượt (180 ms)
      const r = (await page.locator(sel).boundingBox())!;
      expect(r.x, `${name} ${w}: mép trái`).toBeGreaterThanOrEqual(-0.5);
      expect(r.x + r.width, `${name} ${w}: mép phải`).toBeLessThanOrEqual(w + 0.5);
      expect(Math.abs(r.y + r.height - h), `${name} ${w}: sát đáy`).toBeLessThan(2);
      await expect(page.locator('.pv-scrim')).toBeVisible();
      await page.locator('.pv-scrim').click({ position: { x: 20, y: 40 } });
      await expect(page.locator(sel)).toHaveCount(0);
    }
    await ctx.close();
  }
});

test('điện thoại: chạm lớp mờ chỉ đóng menu, không kích hoạt nút bên dưới; sheet File full-width ở 360/412 và ≤560px căn giữa ở 768', async ({ browser }) => {
  for (const [w, h] of [[360, 740], [412, 839], [768, 1024]] as const) {
    const ctx = await browser.newContext({ ...phone, viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('/app/');
    await ready(page);
    const before = await page.evaluate(() => [document.querySelector('.pv-seg [aria-pressed="true"]')?.getAttribute('aria-label'), (document.querySelector('.ed-ta') as HTMLTextAreaElement).value.length]);
    await page.getByRole('button', { name: 'File menu', exact: true }).tap();
    await page.waitForTimeout(260);
    const r = (await page.locator('.pv-menu-file').boundingBox())!;
    if (w <= 640) { expect(r.x, `File ${w} trái`).toBeLessThanOrEqual(0.5); expect(r.x + r.width, `File ${w} phải`).toBeGreaterThanOrEqual(w - 0.5); }
    else { expect(r.width).toBeLessThanOrEqual(561); expect(Math.abs(r.x + r.width / 2 - w / 2)).toBeLessThan(2); }
    const edit = (await page.locator('.pv-seg').getByRole('button', { name: 'Edit', exact: true }).boundingBox())!;
    await page.touchscreen.tap(edit.x + edit.width / 2, edit.y + edit.height / 2); // đúng chỗ nút Edit nằm dưới lớp mờ
    await expect(page.locator('.pv-menu-file')).toHaveCount(0);
    const after = await page.evaluate(() => [document.querySelector('.pv-seg [aria-pressed="true"]')?.getAttribute('aria-label'), (document.querySelector('.ed-ta') as HTMLTextAreaElement).value.length]);
    expect(after, `${w}: không nút nào bị kích hoạt xuyên lớp mờ`).toEqual(before);
    await ctx.close();
  }
});

test('điện thoại xoay ngang: gõ thì hiện hàng phím Markdown, thanh công cụ ẩn nhường chỗ cho chữ', async ({ browser }) => {
  const ctx = await browser.newContext({ ...phone, viewport: { width: 844, height: 390 } });
  await seedSample(ctx); // bài mặc định giờ là tờ giấy trống: gieo bài mẫu như trước (xem seedSample)
  const page = await ctx.newPage();
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  await ta(page).tap();
  await expect(page.locator('.pv-keys')).toBeVisible();
  await expect(page.locator('.pv-tools')).toBeHidden();
  await ctx.close();
});

test('gõ "- " sau dấu Enter đã chèn không lồng thành "- - "', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await ready(page);
  await ta(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('- one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- two');
  await expect(ta(page)).toHaveValue('- one\n- two');
});

test('Find trên điện thoại: kết quả nằm dưới thanh Find, không bị che', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/app/');
  await ready(page);
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await ta(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(Array.from({ length: 120 }, (_, i) => (i === 80 ? 'needle' : `row ${i}`)).join('\n'));
  await page.keyboard.press('Control+f');
  await expect(page.locator('.pv-src > .pv-find input').first()).toBeFocused(); // ô Find nhận focus trễ một nhịp: gõ sớm thì "needle" rơi vào ô soạn (điều kiện đua có sẵn, cũng xảy ra trên bản trước)
  await page.keyboard.type('needle');
  await page.keyboard.press('Enter');
  const r = await page.evaluate(() => {
    const t = document.querySelector<HTMLTextAreaElement>('.ed-ta')!;
    const lh = parseFloat(getComputedStyle(t).lineHeight);
    const f = document.querySelector<HTMLElement>('.pv-src > .pv-find')!.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const y = tr.top + parseFloat(getComputedStyle(t).paddingTop) + 80 * lh - t.scrollTop; // đỉnh dòng 81
    return { y, findBottom: f.bottom, ok: t.selectionEnd > t.selectionStart };
  });
  expect(r.ok).toBe(true);
  expect(r.y).toBeGreaterThanOrEqual(r.findBottom - 1);
});
