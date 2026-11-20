import { zipSync, strToU8 } from 'fflate';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const URL_ = '/app/inspect/';
const SKILL = (n: string) => `---\nname: ${n}\ndescription: Does ${n}. Use when you need ${n}.\n---\n# ${n}\n\nRun \`python scripts/run.py\`.\n`;
const FILES: Record<string, string> = {
  'skills/alpha/SKILL.md': SKILL('alpha'),
  'skills/alpha/scripts/run.py': 'import subprocess\nsubprocess.run("ls", shell=True)\n',
  'skills/beta/SKILL.md': SKILL('beta'),
  'skills/beta/scripts/run.py': 'print(1)\n',
  'README.md': '# Demo\n',
};
const CORS = { 'access-control-allow-origin': '*' };

/** Chặn GitHub: cây thư mục và raw đều trả dữ liệu giả; không cần mạng. */
async function mockGithub(page: Page, o: { delay?: number; limited?: boolean } = {}) {
  await page.route('https://api.github.com/**', (r) => {
    if (o.limited) return r.fulfill({ status: 403, headers: { ...CORS, 'access-control-expose-headers': 'X-RateLimit-Remaining, X-RateLimit-Reset', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) }, body: '{}' });
    const tree = Object.entries(FILES).map(([path, text]) => ({ path, type: 'blob', size: text.length }));
    return r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ tree, truncated: false }) });
  });
  await page.route('https://raw.githubusercontent.com/**', async (r) => {
    if (o.delay) await new Promise((res) => setTimeout(res, o.delay));
    const p = decodeURIComponent(new URL(r.request().url()).pathname.replace(/^\/o\/r\/[^/]+\//, ''));
    return r.fulfill({ status: FILES[p] === undefined ? 404 : 200, headers: CORS, body: FILES[p] ?? '' });
  });
}
const field = (p: Page) => p.getByLabel('GitHub link to a skill or a repository');
const go = (p: Page) => p.goto(URL_);

test.describe('inspect: nhập', () => {
  test('màn đầu có tiêu đề, ô dán link và ba lối thay thế', async ({ page }) => {
    await go(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Look before');
    await expect(field(page)).toBeVisible();
    for (const t of ['drop a .zip', 'open a local folder', 'try an example']) await expect(page.getByRole('button', { name: t })).toBeVisible();
    await expect(page.getByText('Nothing is uploaded')).toBeVisible();
  });

  test('link không phải GitHub báo lỗi ngay tại ô, không rời màn đầu', async ({ page }) => {
    await go(page);
    await field(page).fill('hello world');
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.getByRole('alert')).toContainText('does not look like a GitHub link');
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
  });

  test('dán link GitHub: hiện màn đang tải rồi ra kết quả', async ({ page }) => {
    await mockGithub(page, { delay: 250 });
    await go(page);
    await field(page).fill('github.com/o/r');
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'o/r' })).toBeVisible();
    await expect(page.locator('.ix-loading')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Reading the text files')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A collection', { timeout: 10_000 });
    await expect(page.getByText('2 skills found')).toBeVisible();
  });

  test('?u= bắt đầu nhập ngay khi mở trang', async ({ page }) => {
    await mockGithub(page);
    await page.goto(URL_ + '?u=github.com/o/r');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A collection', { timeout: 10_000 });
  });

  test('nút Cancel quay về màn đầu', async ({ page }) => {
    await mockGithub(page, { delay: 5000 });
    await go(page);
    await field(page).fill('github.com/o/r');
    await page.getByRole('button', { name: 'Inspect' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Look before');
  });

  test('hết lượt GitHub: nói rõ chuyện gì xảy ra và đưa ba hướng đi', async ({ page }) => {
    await mockGithub(page, { limited: true });
    await go(page);
    await field(page).fill('github.com/o/r');
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('asked us to slow down');
    await expect(page.getByRole('button', { name: 'Choose a zip' })).toBeVisible();
    await expect(page.getByText(/Try again at/)).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Look before');
  });

  test('try an example nạp skill mẫu', async ({ page }) => {
    await go(page);
    await page.getByRole('button', { name: 'try an example' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('example-skill');
  });

  test('chọn file zip', async ({ page }) => {
    const buffer = Buffer.from(zipSync({ 'z/SKILL.md': strToU8(SKILL('z')) }));
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'z.zip', mimeType: 'application/zip', buffer });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('z');
  });

  test('zip hỏng báo lỗi bad-zip', async ({ page }) => {
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip at all') });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('could not be opened');
  });

  test('zip không có SKILL.md báo không thấy skill', async ({ page }) => {
    const buffer = Buffer.from(zipSync({ 'a/readme.md': strToU8('# hi') }));
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'a.zip', mimeType: 'application/zip', buffer });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('No skill found');
  });

  test('mở thư mục cục bộ (Chromium)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'webkitdirectory qua setInputFiles chỉ chắc chắn trên Chromium');
    await go(page);
    await page.getByLabel('Choose a folder').setInputFiles('e2e/fixtures/inspect/my-skill');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('my-skill');
  });
});

const h1 = (p: Page) => p.getByRole('heading', { level: 1 });
const example = async (p: Page) => { await go(p); await p.getByRole('button', { name: 'try an example' }).click(); await expect(h1(p)).toHaveText('example-skill'); };
const collection = async (p: Page) => { await mockGithub(p); await go(p); await field(p).fill('github.com/o/r'); await p.getByRole('button', { name: 'Inspect' }).click(); await expect(h1(p)).toHaveText('A collection', { timeout: 10_000 }); };
const zipOf = (files: Record<string, string>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));

test.describe('inspect: bộ sưu tập', () => {
  test('hiện tổng token và tổng của những skill được chọn', async ({ page }) => {
    await collection(page);
    await expect(page.getByText('Installing all of them puts')).toBeVisible();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Select none' }).click();
    await expect(page.getByText('0 selected')).toBeVisible();
    await page.getByLabel('Include alpha').check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
  });

  test('mở một skill rồi quay lại bộ sưu tập; nút Back của trình duyệt đi lùi từng màn', async ({ page }) => {
    await collection(page);
    await page.getByRole('button', { name: 'alpha', exact: true }).click();
    await expect(h1(page)).toHaveText('alpha');
    await page.getByRole('button', { name: 'Files' }).click();
    await expect(page.getByRole('navigation', { name: 'Files in this skill' })).toBeVisible();
    await page.goBack();
    await expect(h1(page)).toHaveText('alpha');
    await page.goBack();
    await expect(h1(page)).toHaveText('A collection');
    await page.getByRole('button', { name: 'beta', exact: true }).click();
    await page.getByRole('button', { name: /← 2 skills/ }).click();
    await expect(h1(page)).toHaveText('A collection');
  });

  test('skill có script đáng đọc được đánh REVIEW ngay trong bảng', async ({ page }) => {
    await collection(page);
    const row = page.getByRole('row').filter({ hasText: 'alpha' });
    await expect(row).toContainText('1 REVIEW');
  });
});

test.describe('inspect: báo cáo', () => {
  test('một skill: vào thẳng báo cáo, câu kết luận đúng, ba mức token', async ({ page }) => {
    await example(page);
    await expect(page.locator('.ix-verdict')).toHaveText('Well-formed, with one script worth a read.');
    await expect(page.getByText('tokens, always loaded')).toBeVisible();
    await expect(page.getByText('when the skill triggers')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Findings · 2/ })).toBeVisible();
  });

  test('phát hiện có trích dòng và liên kết mở file đúng dòng', async ({ page }) => {
    await example(page);
    const ex = page.locator('.ix-ex').filter({ hasText: 'shell=True' });
    await expect(ex).toContainText('subprocess.run');
    await page.getByRole('button', { name: /Open scripts\/outline\.py at line 6/ }).click();
    const hit = page.locator('.ix-ln[data-hit]');
    await expect(hit).toContainText('shell=True');
    await expect(hit).toBeInViewport();
    await expect(page.locator('.ix-f[aria-current="true"]')).toContainText('outline.py');
  });

  test('sao chép báo cáo dạng Markdown', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'quyền clipboard chỉ cấp được trên Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await example(page);
    await page.getByRole('button', { name: 'Copy as Markdown' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const md = await page.evaluate(() => navigator.clipboard.readText());
    expect(md).toContain('# Inspection: example-skill');
    expect(md).toContain('not a safety guarantee');
  });
});

test.describe('inspect: cây file và xem file', () => {
  test('ô lọc thu hẹp danh sách; chấm cam ở file có phát hiện', async ({ page }) => {
    await example(page);
    await page.getByRole('button', { name: 'Files' }).click();
    const tree = page.getByRole('navigation', { name: 'Files in this skill' });
    await expect(tree.getByRole('button', { name: /outline\.py/ }).getByRole('img', { name: /findings/ })).toBeVisible();
    await page.getByLabel('Filter files').fill('format');
    await expect(tree.locator('.ix-f')).toHaveCount(1);
    await expect(tree.locator('.ix-f')).toContainText('format.md');
    await page.getByLabel('Filter files').fill('zzz');
    await expect(tree.getByText('No file matches')).toBeVisible();
  });

  test('file nhị phân không mở được, nói rõ vì sao', async ({ page }) => {
    const buffer = Buffer.from(zipSync({ 's/SKILL.md': strToU8(SKILL('s')), 's/logo.bin': new Uint8Array([1, 2, 0, 3]) }));
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 's.zip', mimeType: 'application/zip', buffer });
    await expect(h1(page)).toHaveText('s');
    await page.getByRole('button', { name: 'Files' }).click();
    await page.getByRole('button', { name: /logo\.bin/ }).click();
    await expect(page.getByText('This file was not read')).toBeVisible();
  });

  test('Preview chặn script, ảnh ngoài và liên kết javascript:', async ({ page }) => {
    const evil = '---\nname: evil\ndescription: Test. Use when testing.\n---\n# Hi\n\n<script>window.__pwned = 1</script>\n\n![](https://tracker.example/x.png)\n\n[click](javascript:window.__pwned=2)\n';
    let dialog = false;
    page.on('dialog', (d) => { dialog = true; void d.dismiss(); });
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'evil.zip', mimeType: 'application/zip', buffer: zipOf({ 'evil/SKILL.md': evil }) });
    await expect(h1(page)).toHaveText('evil');
    await page.getByRole('button', { name: 'Files' }).click();
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('.ix-doc h1')).toHaveText('Hi');
    await expect(page.getByText('1 external image is not loaded')).toBeVisible();
    expect(await page.locator('.ix-doc script').count()).toBe(0);
    expect(await page.locator('.ix-doc img[src^="http"]').count()).toBe(0);
    expect(await page.locator('.ix-doc a[href^="javascript"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialog).toBe(false);
  });
});

test.describe('inspect: điện thoại 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const noOverflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  test('Import, Collection, Report, Files không tràn ngang', async ({ page }) => {
    await go(page);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    await collection(page);
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'alpha', exact: true }).click();
    await expect(h1(page)).toHaveText('alpha');
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Files' }).click();
    await expect(page.locator('.ix-view')).toBeVisible();
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('inspect: axe', () => {
  for (const theme of ['light', 'dark']) {
    test(`không lỗi axe ở các màn chính (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('mdprev-theme', t), theme);
      const check = async (what: string) => {
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.map((v) => `${what}/${theme}/${v.id}:${v.nodes.map((n) => n.target).join('|')}`)).toEqual([]);
      };
      await go(page);
      await check('import');
      await collection(page);
      await check('collection');
      await page.getByRole('button', { name: 'alpha', exact: true }).click();
      await expect(h1(page)).toHaveText('alpha');
      await check('report');
      await page.getByRole('button', { name: 'Files' }).click();
      await expect(page.locator('.ix-view')).toBeVisible();
      await check('files');
    });
  }
});

test.describe('inspect: lối vào và điều hướng', () => {
  test('trang chủ và thanh trên của editor đều dẫn tới Inspector', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.appbar-ins > summary')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Skill inspector' })).toBeVisible();
    await page.locator('.appbar-ins > summary').click();
    await page.locator('.appbar-ins-in').fill('github.com/owner/repo');
    await page.locator('.appbar-ins-in').press('Enter');
    await expect(page).toHaveURL(/\/app\/inspect\/\?u=github\.com(%2F|\/)owner(%2F|\/)repo$/);
    await expect(page.locator('.appbar').getByRole('link', { name: 'Editor' })).toHaveAttribute('href', /\/app\/$/);
    await page.goto('/app/');
    await expect(page.locator('.appbar').getByRole('link', { name: 'Inspect a skill' })).toHaveCount(0);
    await expect(page.locator('.appbar-ins > summary')).toHaveAttribute('title', /Inspect a skill/);
  });

  test('Inspect another tua lịch sử về đầu, Back không đi qua các màn đã bỏ', async ({ page }) => {
    await example(page);
    await page.getByRole('button', { name: 'Files' }).click();
    await page.getByRole('button', { name: 'Report' }).click();
    expect(await page.evaluate(() => (history.state as { ixn?: number } | null)?.ixn)).toBe(2);
    await page.getByRole('button', { name: 'Inspect another' }).click();
    await expect(h1(page)).toContainText('Look before');
    await expect.poll(() => page.evaluate(() => (history.state as { ixn?: number } | null)?.ixn ?? 0)).toBe(0);
  });

  test('cây file tự mở thư mục chứa file được mở từ báo cáo (skill hơn 60 file)', async ({ page }) => {
    const files: Record<string, string> = { 'big/SKILL.md': SKILL('big') + '\nRun `python scripts/deep/run.py`.\n', 'big/scripts/deep/run.py': 'import subprocess\nsubprocess.run("ls", shell=True)\n' };
    for (let i = 0; i < 70; i++) files[`big/docs/f${i}.md`] = `# f${i}\n`;
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'big.zip', mimeType: 'application/zip', buffer: zipOf(files) });
    await expect(h1(page)).toHaveText('big');
    await page.getByRole('button', { name: /Open scripts\/deep\/run\.py at line 2/ }).click();
    await expect(page.locator('.ix-f[aria-current="true"]')).toContainText('run.py');
    await expect(page.locator('.ix-ln[data-hit]')).toContainText('shell=True');
  });
});

test.describe('inspect: sửa sau rà soát', () => {
  test('phím / đưa con trỏ vào ô lọc, và không cướp phím khi đang gõ ở ô khác', async ({ page }) => {
    await example(page);
    await page.getByRole('button', { name: 'Files' }).click();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    await expect(page.getByLabel('Filter files')).toBeFocused();
    await page.getByLabel('Filter files').fill('a/b');
    await expect(page.getByLabel('Filter files')).toHaveValue('a/b');
  });

  test('mở file ở dòng quá 3000: cửa sổ hiển thị dời tới dòng đó', async ({ page }) => {
    const lines = Array.from({ length: 3600 }, (_, i) => `x_${i + 1} = ${i + 1}`);
    lines[3499] = 'subprocess.run(c, shell=True)';
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'long.zip', mimeType: 'application/zip', buffer: zipOf({ 'long/SKILL.md': SKILL('long') + '\nRun `python scripts/long.py`.\n', 'long/scripts/long.py': lines.join('\n') }) });
    await expect(h1(page)).toHaveText('long');
    await page.getByRole('button', { name: /Open scripts\/long\.py at line 3500/ }).click();
    const hit = page.locator('.ix-ln[data-hit]');
    await expect(hit).toContainText('shell=True');
    await expect(hit.locator('i')).toHaveText('3500');
    await expect(page.getByText(/Showing lines \d+ to \d+ of 3600/)).toBeVisible();
  });

  test('đổi file khi đang ở Preview không hiện nội dung của file trước', async ({ page }) => {
    const buffer = zipOf({ 'p/SKILL.md': SKILL('p'), 'p/references/a.md': '# Alpha heading\n', 'p/references/b.py': 'print("not markdown")\n' });
    await go(page);
    await page.getByLabel('Choose a zip file').setInputFiles({ name: 'p.zip', mimeType: 'application/zip', buffer });
    await page.getByRole('button', { name: 'Files' }).click();
    await page.getByRole('button', { name: /a\.md/ }).click();
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('.ix-doc h1')).toHaveText('Alpha heading');
    await page.getByRole('button', { name: /b\.py/ }).click();
    await expect(page.locator('.ix-doc')).toHaveCount(0);
    await expect(page.locator('.ix-ln').first()).toContainText('print');
  });
});

test.describe('Skills Studio: màn nhập và severity', () => {
  test('màn nhập có report mẫu có nhãn EXAMPLE và không có điều khiển', async ({ page }) => {
    await page.goto('/app/inspect/');
    const sample = page.getByRole('region', { name: 'Example report' });
    await expect(sample).toBeVisible();
    await expect(sample).toContainText('EXAMPLE');
    await expect(sample).toContainText('outline.py is worth a read');
    await expect(sample).toContainText('Mentioned but not found');
    await expect(sample.getByRole('button')).toHaveCount(0);
    await expect(sample.getByRole('link')).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');
  });

  test('severity có ký hiệu: review "!" và note "i", NOTHING TO REVIEW không có', async ({ page }) => {
    await page.goto('/app/inspect/');
    const glyph = (sev: string) => page.evaluate((v) => {
      const sp = document.createElement('span'); sp.className = 'ix-tag'; sp.dataset['sev'] = v; document.body.append(sp);
      const c = getComputedStyle(sp, '::before').content; sp.remove(); return c;
    }, sev);
    expect(await glyph('review')).toContain('!');
    expect(await glyph('note')).toContain('i');
    expect(['none', 'normal']).toContain(await glyph('none'));
  });
});
