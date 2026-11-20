import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

/**
 * Gieo bài mẫu nguyên văn (src/lib/studio/sample.md) như khi khách bấm "Try a sample". Từ 2026-11-18 bài mặc định của /app/ là tờ giấy trống
 * (thẻ chào) nên các test viết khi bài mặc định còn là bài mẫu gọi hàm này để bắt đầu đúng như trước; test về lần ghé đầu tiên thì không gọi.
 */
export async function seedSample(context: BrowserContext): Promise<void> {
  const md = readFileSync('src/lib/studio/sample.md', 'utf8').replace(/\r\n/g, '\n');
  await context.addInitScript((m: string) => { try { if (localStorage.getItem('mdprev-md') === null) localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, md);
}
/** Bài nhỏ một-h1 mà các test studio cũ dựa vào; bài mặc định hiện là tờ giấy trống. Seed như lần ghé đầu tiên. */
export async function seedNotes(context: BrowserContext): Promise<void> {
  const md = readFileSync('e2e/fixtures/project-notes.md', 'utf8');
  await context.addInitScript((m: string) => { try { if (localStorage.getItem('mdprev-md') === null) localStorage.setItem('mdprev-md', m); } catch { /* bỏ qua */ } }, md);
}
/** Chờ mọi island client:load và client:idle hydrate xong (astro-island hết thuộc tính ssr). */
export async function ready(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr][client="load"], astro-island[ssr][client="idle"]'), null, { timeout: 10_000 });
}

/** Mọi trang đã dựng trong dist/ (đường dẫn kết thúc bằng /). Test chạy trên bản build. */
export function builtPages(dir = 'dist', base = ''): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return builtPages(p, base + '/' + n);
    return n === 'index.html' ? [base + '/'] : [];
  });
}
/** Trang công khai (ngoài /app/) đã dựng. */
export const publicPages = (): string[] => builtPages().filter((p) => !p.startsWith('/app/')).sort();

/** Nút trong nhóm chế độ xem (role=group "View mode"): Edit, Split, Read hoặc Zen. */
export function viewTab(page: Page, name: 'Edit' | 'Split' | 'Read' | 'Zen'): Locator {
  return page.getByRole('group', { name: 'View mode' }).getByRole('button', { name, exact: true });
}
/** Nút menu Export. */
export function exportMenu(page: Page): Locator {
  return page.getByRole('button', { name: 'Export', exact: true });
}
/** Nút mở menu File, cạnh tên file ở thanh tài liệu. */
export function fileMenu(page: Page): Locator {
  return page.getByRole('button', { name: 'File menu', exact: true });
}
/** Nút `Aa` mở popover View. */
export function viewOptions(page: Page): Locator {
  return page.getByRole('button', { name: 'View options', exact: true });
}
/** Nút icon Inspector ở header (aria-pressed). */
export function inspectorToggle(page: Page): Locator {
  return page.getByRole('button', { name: 'Inspector', exact: true });
}
/** Tab của panel Inspector: Outline, Properties, Checks hoặc History. */
export function inspectorTab(page: Page, name: 'Outline' | 'Properties' | 'Checks' | 'History'): Locator {
  return page.getByRole('tab', { name });
}
/** Mở Inspector (nếu đang đóng) và chọn tab. Chỉ có ở viewport >= 900px, ngoài Zen. */
export async function openInspector(page: Page, tab: 'Outline' | 'Properties' | 'Checks' | 'History'): Promise<Locator> {
  const t = inspectorToggle(page);
  if ((await t.getAttribute('aria-pressed')) !== 'true') await t.click();
  await inspectorTab(page, tab).click();
  return page.getByRole('complementary', { name: 'Inspector' });
}
/** Zen mở ở mặt đang dùng (Edit → Write, Read/Split → Read); gọi sau khi đã vào Zen để chuyển sang mặt VIẾT (Alt+V) và chờ ô soạn nhận focus. */
export async function enterZenWrite(page: Page): Promise<void> {
  await expect(page.locator('.zc-mode button[aria-pressed=true]')).toHaveText(/Read|Write/); // Zen mở ở mặt đang dùng: Edit vào Write, Read/Split vào Read
  if ((await page.locator('.zc-mode button[aria-pressed=true]').innerText()) === 'Read') await expect(page.locator('.pv-out')).toBeFocused(); // mặt Read đã áp xong (cuộn tới chỗ đang soạn, bản xem giữ focus); Alt+V gửi sớm hơn thì WebKit đặt cuộn lệch
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  // WebKit: nghe phím của Zen gắn sau lần dựng đầu một nhịp, nên Alt+V gửi quá sớm có thể bị mất: thử lại tới khi sang Write (chỉ bấm khi vẫn ở Read, không bật tắt hai lần)
  await expect(async () => {
    if ((await page.locator('.zc-mode button[aria-pressed=true]').innerText()) === 'Read') await page.keyboard.press('Alt+v');
    await expect(page.locator('.zc-mode button[aria-pressed=true]')).toHaveText('Write', { timeout: 600 });
  }).toPass({ timeout: 8000 });
  await expect(page.locator('.ed-ta')).toBeFocused();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))); // để căn giữa con trỏ sau khi ô soạn hiện lại ổn định (WebKit đo lần hai)
  await page.waitForTimeout(250); // WebKit còn khôi phục vùng chọn và cuộn một nhịp sau khi ô soạn hiện lại
}

/** Bấm "New document": nếu tài liệu có chữ thì hộp "Start a new document?" hiện ra, xác nhận nó. */
export async function newDocument(page: Page, from: Locator = page.getByRole('button', { name: 'New document' })): Promise<void> {
  await from.click();
  const ask = page.getByRole('alertdialog', { name: 'Start a new document' });
  if (await ask.isVisible({ timeout: 400 }).catch(() => false)) await ask.getByRole('button', { name: 'New document' }).click();
}
