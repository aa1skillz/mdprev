import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/studio/pipeline';

/** Hồi quy bảo mật cho bước dựng Markdown: kết quả không được mang URL chạy mã, HTML thô hay trình xử lý sự kiện. */
const render = async (md: string) => (await renderMarkdown(md)).html;
const urls = (html: string) => [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]!);
const schemeOf = (u: string) => /^([a-z][a-z0-9+.-]*):/i.exec(u.replace(/[\u0000- \u007f-\u009f]/g, ''))?.[1]?.toLowerCase();

describe('renderMarkdown: URL nguy hiểm', () => {
  const links = [
    '[a](javascript:alert(1))',
    '[b](JaVa&#x09;ScRiPt:alert(1))',
    '[c](  javascript:alert(1))',
    '[d](data:text/html,x)',
    '[e](vbscript:x)',
    '![f](javascript:alert(1))',
    '![g](data:image/svg+xml,x)',
  ];
  for (const md of links) {
    it(`không để lọt scheme chạy mã: ${md}`, async () => {
      for (const u of urls(await render(md))) expect(['http', 'https', 'mailto', undefined]).toContain(schemeOf(u));
    });
  }
  it('JaVa&#x09;ScRiPt không thành scheme javascript sau khi trình duyệt chuẩn hoá', async () => {
    const [u] = urls(await render('[b](JaVa&#x09;ScRiPt:alert(1))'));
    // tab được mã hoá %09, nên đây là đường dẫn tương đối, không phải URL javascript:
    expect(u && new URL(u, 'https://mdprev.space/app/').protocol).toBe('https:');
  });
});

describe('renderMarkdown: HTML thô bị bỏ', () => {
  for (const raw of ['<script>alert(1)</script>', '<img src=x onerror="alert(1)">', '<iframe src="https://evil.example"></iframe>', '<a href="javascript:alert(1)" onclick="x()">h</a>', '<svg onload=alert(1)>']) {
    it(`bỏ ${raw}`, async () => {
      const html = await render(`# t\n\n${raw}\n`);
      expect(html).not.toMatch(/<(script|iframe|svg|img)\b/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toMatch(/javascript:/i);
    });
  }
});

describe('renderMarkdown: công thức', () => {
  it('KaTeX không cho \\href, \\url, \\includegraphics (trust: false)', async () => {
    const html = await render('$\\href{javascript:alert(1)}{x}$ and $\\url{https://evil.example}$ and $\\includegraphics{https://evil.example/m.png}$\n');
    // mã TeX gốc vẫn nằm trong <annotation> dưới dạng chữ; điều cần canh là không có liên kết hay ảnh thật
    expect(urls(html)).toEqual([]);
    expect(html).not.toMatch(/<(a|img)\b/i);
  });
});
