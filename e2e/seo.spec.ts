import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { exportMenu, openInspector, publicPages } from './helpers';

const PUBLIC = publicPages();
const APP = ['/app/', '/app/inspect/', '/app/preview/', '/app/presenter/'];

test.describe('SEO: sitemap, robots, CSP', () => {
  test('sitemap.xml liệt kê đúng các trang công khai đã dựng (mọi trang ngoài /app/), không có /app/*', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('xml');
    const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname).sort();
    expect(locs).toEqual(PUBLIC);
    expect(locs.some((p) => p.startsWith('/app/'))).toBe(false);
  });

  test('robots.txt cho thu thập, có dòng Sitemap, không chặn /app/ (để công cụ tìm kiếm còn thấy noindex)', async ({ request }) => {
    const txt = await (await request.get('/robots.txt')).text();
    expect(txt).toMatch(/User-agent: \*/);
    expect(txt).not.toMatch(/Disallow/i);
    expect(txt).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m);
  });

  test('llms.txt và llms-full.txt có, là văn bản thuần, liệt kê mọi guide; robots.txt nhắc tới chúng', async ({ request }) => {
    const idx = await request.get('/llms.txt');
    expect(idx.ok()).toBe(true);
    expect(idx.headers()['content-type']).toContain('text/plain');
    const t = await idx.text();
    expect(t).toMatch(/^# mdprev$/m);
    const guides = PUBLIC.filter((x) => x.startsWith('/guides/') && x !== '/guides/');
    expect(guides.length).toBeGreaterThanOrEqual(4);
    for (const p of guides) expect(t, p).toContain(p);
    const full = await (await request.get('/llms-full.txt')).text();
    expect(full).toContain('How do I export Markdown to PDF or Word?');
    expect(full).toContain('What exactly does it check?');
    for (const p of guides) expect(full, p).toContain(p);
    expect(await (await request.get('/robots.txt')).text()).toContain('/llms.txt');
  });

  test('trang chủ: đúng một <h1> trong HTML tĩnh và vẫn một sau khi editor nạp; #skill-inspector cuộn tới mục kiểm tra skill', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('h1').count()).toBe(1);
    await page.locator('.studio-facade').click();
    // bài mặc định giờ là tờ giấy trống (không còn H1 của bài mẫu để hạ cấp): gõ một bài có H1 rồi kiểm điều test này canh
    await expect(page.locator('.pv .ed-ta')).toBeVisible({ timeout: 10_000 });
    await page.locator('.pv .ed-ta').fill('# Better meetings\n\nBody text.');
    await page.waitForSelector('.pv .md-doc [data-h1]');
    expect(await page.locator('h1').count()).toBe(1);
    await expect(page.locator('.pv-title')).toHaveJSProperty('tagName', 'DIV');
    await expect(page.locator('.md-doc [data-h1]').first()).toHaveAttribute('aria-level', '2');
    await page.goto('/#skill-inspector');
    await expect(page.locator('#skill-inspector h2')).toBeInViewport();
  });

  test('trang chủ: hạ H1 chỉ ở hiển thị; Outline, export HTML và Present vẫn thấy H1 của bài', async ({ page }) => {
    await page.goto('/');
    await page.locator('.studio-facade').click();
    // như trên: bài mặc định là tờ giấy trống nên gõ bài có H1 "Better meetings" (nội dung các assert bên dưới giữ nguyên)
    await expect(page.locator('.pv .ed-ta')).toBeVisible({ timeout: 10_000 });
    await page.locator('.pv .ed-ta').fill('# Better meetings\n\nBody text.');
    await page.waitForSelector('.pv .md-doc [data-h1]');
    await openInspector(page, 'Outline');
    await expect(page.locator('.pv-insp .pv-ol', { hasText: 'Better meetings' }).first()).toBeVisible();
    await exportMenu(page).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'HTML (.html)' }).click()]);
    const out = readFileSync((await dl.path())!, 'utf8');
    expect(out).toMatch(/<h1[ >][^]*Better meetings/);
    expect(out).not.toContain('<div role="heading"'); // CSS có selector [data-h1], nhưng phần tử hạ cấp không lọt vào file xuất
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Present/ }).first().click();
    await expect(page.locator('.sv')).toContainText('Better meetings');
  });

  test('CSP: form-action chỉ cho cùng nguồn; dòng CSP không phình vì JSON-LD', () => {
    const csp = readFileSync('dist/_headers', 'utf8').split('\n').find((l) => l.includes('Content-Security-Policy'))!;
    expect(csp).toContain("form-action 'self'");
    expect(csp.length).toBeLessThan(1500); // giới hạn của _headers là 2000 ký tự/dòng
    expect(csp.match(/'sha256-/g)!.length).toBeLessThanOrEqual(8); // chỉ script thực thi được băm, không băm ld+json
  });

  test('og.png là ảnh PNG 1200×630', async ({ request }) => {
    const res = await request.get('/og.png');
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('image/png');
    const b = await res.body();
    expect(b.readUInt32BE(16)).toBe(1200);
    expect(b.readUInt32BE(20)).toBe(630);
  });
});

test.describe('SEO: từng trang công khai', () => {
  test('có ít nhất trang chủ', () => expect(PUBLIC).toContain('/'));

  for (const path of PUBLIC) {
    test(`${path}: title, description, canonical, og, twitter, JSON-LD hợp lệ, cho phép lập chỉ mục`, async ({ page, request }) => {
      await page.goto(path);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(10);
      expect(title.length).toBeLessThanOrEqual(70);
      const desc = (await page.locator('meta[name="description"]').getAttribute('content'))!;
      expect(desc.length).toBeGreaterThanOrEqual(50);
      expect(desc.length).toBeLessThanOrEqual(175);
      expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname).toBe(path);
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      for (const sel of ['meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'meta[name="twitter:card"]']) {
        await expect(page.locator(sel)).toHaveCount(1);
      }
      // ảnh chung /og.png hoặc ảnh riêng của trang /og-<tên>.png (sinh bằng tools/make-og.cjs --pages)
      const og = (await page.locator('meta[property="og:image"]').getAttribute('content'))!;
      expect(og).toMatch(/^https?:\/\/.+\/og(-[a-z0-9-]+)?\.png$/);
      const img = await request.get(new URL(og).pathname);
      expect(img.ok(), og).toBe(true);
      const ib = await img.body();
      expect([ib.readUInt32BE(16), ib.readUInt32BE(20)], og).toEqual([1200, 630]);
      expect(await page.locator('h1').count()).toBeGreaterThanOrEqual(1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');

      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      const bodyText = await page.locator('body').innerText();
      for (const raw of blocks) {
        const data = JSON.parse(raw) as { '@context': string; '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] };
        expect(data['@context']).toBe('https://schema.org');
        expect(data['@type']).toBeTruthy();
        // FAQPage chỉ hợp lệ khi đúng hỏi đáp đó hiện trên trang
        if (data['@type'] === 'FAQPage') {
          for (const q of data.mainEntity!) {
            expect(bodyText).toContain(q.name);
            expect(await page.locator('body').textContent()).toContain(q.acceptedAnswer.text);
          }
        }
      }
    });
  }

  for (const path of APP) {
    test(`${path}: giữ noindex (ứng dụng, không lập chỉ mục)`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    });
  }
});
