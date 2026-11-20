import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/studio/pipeline';
import { splitFrontMatter } from '../src/lib/studio/frontmatter';
import { highlightHtml, paragraphRange, tokenizeLines } from '../src/lib/studio/tokenize';
import { lint } from '../src/lib/studio/lint';
import { cleanHtml, fileNameOf, standaloneHtml, stats, titleOf } from '../src/lib/studio/export';
import { SAMPLE } from '../src/lib/studio/sample';

describe('pipeline', () => {
  it('GFM: bảng, task list, gạch ngang, id heading và data-line', async () => {
    const { html } = await renderMarkdown('# Hello World\n\n- [x] done\n- [ ] open\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n~~gone~~\n\n## Hello World\n');
    expect(html).toContain('<h1 data-line="1" id="hello-world">');
    expect(html).toContain('id="hello-world-1"'); // heading trùng được đánh số
    expect(html).toContain('<table data-line="6">');
    expect(html).toMatch(/<input type="checkbox" checked disabled aria-label="done">/);
    expect(html).toMatch(/<input type="checkbox" disabled aria-label="open">/);
    expect(html).toContain('<del>gone</del>');
  });
  it('khối code có khung, nhãn ngôn ngữ, nút Copy và đã tô màu', async () => {
    const { html } = await renderMarkdown('text\n\n```ts\nconst a = 1;\n```\n');
    expect(html).toContain('<div class="cb" data-line="3">');
    expect(html).toContain('<span>TS</span>');
    expect(html).toContain('class="cb-copy"');
    expect(html).toContain('var(--shiki-token-');
  });
  it('front-matter: tách khỏi bản dựng nhưng giữ số dòng', async () => {
    const src = '---\ntitle: A\ntags: [x, y]\n---\n\n# Body\n';
    const { fm, body } = splitFrontMatter(src);
    expect(fm?.rows).toEqual([['title', 'A'], ['tags', 'x, y']]);
    expect(body.split('\n').length).toBe(src.split('\n').length);
    const { html } = await renderMarkdown(src);
    expect(html).toContain('<h1 data-line="6"');
    expect(html).not.toContain('title: A');
  });
  it('bỏ HTML thô và chặn link nguy hiểm', async () => {
    expect((await renderMarkdown('<script>alert(1)</script>\n\nhi')).html).not.toContain('<script');
    for (const href of ['javascript:alert(1)', 'java&#9;script:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x']) {
      const { html } = await renderMarkdown(`[x](${href})`);
      for (const m of html.matchAll(/href="([^"]*)"/g)) expect((m[1] ?? '').replace(/[\u0000- \u007f-\u009f]/g, ''), href).not.toMatch(/^(javascript|data|vbscript):/i);
    }
    expect((await renderMarkdown('[a](https://x.dev) [b](/p/) [c](#s) [d](mailto:a@b.c)')).html).toMatch(/href="https:\/\/x\.dev".*href="\/p\/".*href="#s".*href="mailto:a@b\.c"/);
  });
});

describe('tokenize', () => {
  const nasty = [
    '# Heading with `code` and **bold**', '## ', '#nospace', '> quote with [link](https://x.dev) inside', '- [x] task *it* ~~st~~', '1. item __b__ _i_',
    '| a | `b|c` | **d** |', '```ts title="x"', 'const `not md` = 1;', '```', '~~~', 'text', '~~~', '---', '***', 'bare https://x.dev/a?b=1 and <https://y.dev>',
    '![img](a.png) `unclosed', 'tiếng Việt có dấu: **đậm** _nghiêng_', '', '   ', '\ttab', 'a_b_c snake_case_word',
  ];
  it('ghép các span lại đúng bằng dòng gốc (điều kiện để lớp tô màu khớp textarea)', () => {
    for (const src of [nasty.join('\n'), SAMPLE, '', '\n\n']) {
      const lines = src.split('\n');
      const toks = tokenizeLines(src);
      expect(toks.length).toBe(lines.length);
      toks.forEach((t, i) => expect(t.map((s) => s.text).join('')).toBe(lines[i]));
    }
  });
  it('nhận đúng thành phần', () => {
    const cls = (src: string) => tokenizeLines(src)[0]!.filter((s) => s.cls).map((s) => `${s.cls}:${s.text}`);
    expect(cls('## Hi `x`')).toEqual(expect.arrayContaining(['mk h:##', 'h code:`x`']));
    expect(cls('[t](https://u)')).toEqual(['mk:[', 'link:t', 'mk:](', 'url:https://u', 'mk:)']);
    expect(cls('- [ ] a')).toEqual(['li:-', 'task-open:[ ]']);
    expect(cls('- [x] a')).toEqual(['li:-', 'task-done:[x]', 'done: a']);
    expect(cls('> q')).toEqual(['qm:> ', 'q:q']);
    expect(cls('snake_case_word')).toEqual([]); // gạch dưới giữa từ không phải nghiêng
  });
  it('front-matter và khối code không bị tô như Markdown', () => {
    const t = tokenizeLines('---\ntitle: **x**\n---\n```\n# not heading\n```');
    expect(t[1]!.map((s) => s.cls)).toEqual(['fmk', 'mk', 'fmv']);
    expect(t[4]!.map((s) => s.cls)).toEqual(['cb']);
  });
  it('highlightHtml: làm mờ dòng ngoài đoạn và luôn kết thúc bằng xuống dòng', () => {
    const h = highlightHtml('a\n\nb', [3, 3]);
    expect(h.endsWith('\n')).toBe(true);
    expect(h.match(/class="l dz"/g)?.length).toBe(2);
    expect(highlightHtml('<b>&')).toContain('&lt;b&gt;');
    expect(highlightHtml('<b>&')).toContain('&amp;');
  });
  it('paragraphRange', () => {
    const s = 'a\nb\n\nc\nd\ne\n\nf';
    expect(paragraphRange(s, 2)).toEqual([1, 2]);
    expect(paragraphRange(s, 5)).toEqual([4, 6]);
    expect(paragraphRange(s, 3)).toEqual([3, 3]);
  });
});

describe('lint', () => {
  const msgs = (s: string) => lint(s).map((i) => `${i.line}:${i.message}`);
  it('bài mặc định không có cảnh báo', () => expect(lint(SAMPLE)).toEqual([]));
  it('heading nhảy cấp, trùng, nhiều h1', () => {
    expect(msgs('# A\n\n### B\n')).toEqual(['3:Heading level jumps from h1 to h3']);
    expect(msgs('# A\n\n## B\n\n## B\n')).toEqual(['5:Duplicate heading, first on line 3']);
    expect(msgs('# A\n\n# B\n')).toEqual(['3:Multiple top-level headings']);
  });
  it('khoảng trắng cuối dòng (hai dấu cách là xuống dòng, bỏ qua)', () => {
    expect(msgs('a \nb  \nc   \n')).toEqual(['1:Trailing whitespace', '3:Trailing whitespace']);
  });
  it('URL trần, ảnh thiếu alt, link rỗng, fence không đóng', () => {
    expect(msgs('see https://x.dev now')).toEqual(['1:Bare URL, wrap it in a link or <angle brackets>']);
    expect(msgs('[ok](https://x.dev) `https://y.dev` <https://z.dev>')).toEqual([]);
    expect(msgs('![](a.png)')).toEqual(['1:Image without alt text']);
    expect(msgs('[x]()')).toEqual(['1:Link with empty target']);
    expect(msgs('```\ncode')).toEqual(['1:Code fence is never closed']);
  });
  it('bỏ qua front-matter và khối code', () => {
    expect(msgs('---\nurl: https://x.dev \n---\n\n```\nhttps://y.dev  \n```\n')).toEqual([]);
  });
});

describe('export', () => {
  it('cleanHtml bỏ data-line và nút Copy', () => {
    const h = '<div class="cb" data-line="3"><div class="cb-h"><span>TS</span><button type="button" class="cb-copy" data-copy="">COPY</button></div><pre>x</pre></div>';
    expect(cleanHtml(h)).toBe('<div class="cb"><div class="cb-h"><span>TS</span></div><pre>x</pre></div>');
  });
  it('file .html đứng riêng: có title đã escape, biến màu, css, thân bài', () => {
    const out = standaloneHtml({ title: 'A <b> & "c"', bodyHtml: '<p data-line="1">hi</p>', css: '.md-doc{x:y}', vars: ':root{--bg:#fff}' });
    expect(out).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(out).toContain(':root{--bg:#fff}');
    expect(out).toContain('<main class="md-doc">\n<p>hi</p>');
    expect(out).not.toContain('data-line');
  });
  it('tên file và tiêu đề', () => {
    expect(fileNameOf('# Tiếng Việt: Đây là bài\n')).toBe('tieng-viet-day-la-bai.md');
    expect(fileNameOf('---\ntitle: x\n---\n\n# Real\n', 'html')).toBe('real.html');
    expect(fileNameOf('no heading')).toBe('untitled.md');
    expect(titleOf('no heading')).toBe('Untitled');
  });
  it('stats bỏ front-matter và khối code', () => {
    expect(stats('---\na: b\n---\n\none two three\n\n```\nx y z\n```\n').words).toBe(3);
    expect(stats('').minutes).toBe(1);
  });
});
