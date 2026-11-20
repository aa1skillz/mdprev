import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { exportMenu, ready } from './helpers';

// Kiểm bằng công cụ thật khi có (không cài vào hệ thống): JAVA + EPUBCHECK_JAR cho EPUB, TECTONIC cho LaTeX.
const { JAVA, EPUBCHECK_JAR, TECTONIC } = process.env;
const out = mkdtempSync(join(tmpdir(), 'mdprev-export-'));

async function exportAs(page: Page, label: string): Promise<string> {
  await exportMenu(page).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: label }).click()]);
  const p = join(out, dl.suggestedFilename());
  await dl.saveAs(p);
  return p;
}

// PNG 1×1 đỏ, sinh lúc chạy bằng canvas để không có chuỗi base64 dài trong mã
async function dropImage(page: Page) {
  await page.locator('.ed-ta').evaluate(async (ta: HTMLTextAreaElement) => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 4;
    const g = c.getContext('2d')!; g.fillStyle = '#c00'; g.fillRect(0, 0, 4, 4);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'red-dot.png', { type: 'image/png' }));
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.ed-ta')).toHaveValue(/!\[red dot\]\(asset:[a-z0-9]+\.png\)/);
  await expect(page.locator('.pv .md-doc img[alt="red dot"]')).toBeVisible(); // bản xem đã dựng xong (bản xuất lấy HTML đã dựng)
}

// Bài mặc định giờ là tờ giấy trống; các test "của bài mẫu" cần chính bài mẫu nên gieo nó như khi khách bấm "Try a sample" (không đổi điều test canh).
const SAMPLE_MD = readFileSync('src/lib/studio/sample.md', 'utf8').replace(/\r\n/g, '\n');

test.describe('xuất EPUB, LaTeX, TextPack', () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  test.beforeEach(async ({ context }) => {
    await context.addInitScript((m: string) => { try { if (localStorage.getItem('mdprev-md') === null) localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, SAMPLE_MD);
  });

  test('EPUB của bài mẫu: zip đúng cấu trúc, ảnh dán được nhúng, epubcheck không lỗi', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/');
    await ready(page);
    await dropImage(page);
    const p = await exportAs(page, 'EPUB (.epub)');
    const f = unzipSync(readFileSync(p));
    expect(Object.keys(f)[0]).toBe('mimetype');
    expect(Object.keys(f)).toEqual(expect.arrayContaining(['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/text.xhtml', 'OEBPS/images/i1.png', 'OEBPS/images/i2.png']));
    const text = Buffer.from(f['OEBPS/text.xhtml']!).toString();
    expect(text).not.toContain('data-line');
    expect(text).toContain('<img alt="red dot" src="images/i2.png" />');
    expect(text).toMatch(/<img alt="flowchart diagram[^"]*" src="images\/i1.png" \/>/); // sơ đồ Mermaid thành ảnh PNG
    expect(text).not.toContain('foreignObject');
    if (JAVA && EPUBCHECK_JAR) {
      const r = execFileSync(JAVA, ['-jar', EPUBCHECK_JAR, p], { encoding: 'utf8' }); // thoát mã khác 0 là ném lỗi
      expect(r).toContain('No errors or warnings detected');
    }
  });

  test('TextPack: xuất kèm ảnh dán rồi mở lại được, ảnh vẫn hiện', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('mdprev-md', '# Pack test\n\nHello pack.\n\n'); } });
    await page.goto('/app/');
    await ready(page);
    await dropImage(page);
    const before = await page.locator('.ed-ta').inputValue();
    const p = await exportAs(page, 'TextPack (.textpack)');
    const f = unzipSync(readFileSync(p));
    const md = Buffer.from(f['pack-test.textbundle/text.md']!).toString();
    expect(md).toMatch(/!\[red dot\]\(assets\/[a-z0-9]+\.png\)/);
    await page.locator('.ed-ta').fill('# Something else\n');
    await page.locator('input[type=file]').setInputFiles({ name: 'pack-test.textpack', mimeType: 'application/zip', buffer: readFileSync(p) });
    await expect(page.locator('.ed-ta')).toHaveValue(before);
    await expect(page.locator('.pv .md-doc img[alt="red dot"]')).toHaveJSProperty('complete', true);
    expect(await page.locator('.pv .md-doc img[alt="red dot"]').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(4);
  });

  test('LaTeX của bài mẫu: tải được, biên dịch bằng tectonic nếu có', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/app/');
    await ready(page);
    const p = await exportAs(page, 'LaTeX (.tex)');
    const tex = readFileSync(p, 'utf8');
    expect(tex).toContain('\\documentclass');
    expect(tex).toContain('\\begin{document}');
    if (TECTONIC) {
      const dir = join(out, 'tex'); mkdirSync(dir, { recursive: true });
      execFileSync(TECTONIC, ['--outdir', dir, p], { encoding: 'utf8', stdio: 'pipe' });
      expect(readFileSync(join(dir, p.split('/').pop()!.replace(/\.tex$/, '.pdf'))).subarray(0, 4).toString()).toBe('%PDF');
    }
  });
});
