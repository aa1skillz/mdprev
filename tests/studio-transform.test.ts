import { describe, expect, it } from 'vitest';
import { applyTransform, TRANSFORMS, type TransformId } from '../src/lib/studio/transform';
import { lint } from '../src/lib/studio/lint';
import { plainHeading, slugify, idMaker } from '../src/lib/studio/slug';
import { renderMarkdown } from '../src/lib/studio/pipeline';

const run = (text: string, s: number, e: number, id: TransformId) => { const r = applyTransform(text, s, e, id); return 'error' in r ? `ERR:${r.error}` : r.text; };

describe('transform: đổi chữ', () => {
  it('hoa, thường, title case có tiếng Việt; không chọn thì lấy dòng hiện tại', () => {
    expect(run('xin chào các bạn', 0, 16, 'upper')).toBe('XIN CHÀO CÁC BẠN');
    expect(run('XIN CHÀO', 0, 8, 'lower')).toBe('xin chào');
    expect(run('hello WORLD\nsecond line', 3, 3, 'title')).toBe('Hello World\nsecond line');
    expect(run('đường đi ở đây', 0, 14, 'title')).toBe('Đường Đi Ở Đây');
    expect(run('keep (this) "that"', 0, 19, 'title')).toBe('Keep (This) "That"');
  });
  it('báo khi không có gì đổi', () => expect(run('ABC', 0, 3, 'upper')).toBe('ERR:NOTHING TO CHANGE'));
});

describe('transform: theo dòng', () => {
  it('sắp xếp theo số tự nhiên và tiếng Việt, đảo, bỏ trùng, nối', () => {
    expect(run('b10\nb2\na1', 0, 9, 'sort')).toBe('a1\nb2\nb10');
    expect(run('a1\nb2\nb10', 0, 9, 'sort-desc')).toBe('b10\nb2\na1');
    expect(run('a\nb\na\nc\nb', 0, 9, 'unique')).toBe('a\nb\nc');
    expect(run('1\n2\n3', 0, 5, 'reverse')).toBe('3\n2\n1');
    expect(run('one\n  two \nthree', 0, 15, 'join')).toBe('one two three');
  });
  it('cần chọn dòng; chỉ đụng các dòng chạm vùng chọn', () => {
    expect(run('b\na', 1, 1, 'sort')).toBe('ERR:SELECT THE LINES FIRST');
    expect(run('keep\nb\na\nkeep2', 6, 9, 'sort')).toBe('keep\na\nb\nkeep2');
  });
  it('vùng chọn kết thúc ngay sau xuống dòng không kéo theo dòng kế', () => {
    expect(run('b\na\nz\n', 0, 4, 'sort')).toBe('a\nb\nz\n');
  });
});

describe('transform: ngắt và nối dòng', () => {
  const long = 'The quick brown fox jumps over the lazy dog and keeps running through the forest until night falls.';
  it('wrap giữ độ rộng và cắt ở khoảng trắng', () => {
    const out = run(long, 0, 0, 'wrap-72').split('\n');
    expect(out.length).toBe(2);
    expect(out.every((l) => [...l].length <= 72)).toBe(true);
    expect(out.join(' ')).toBe(long);
  });
  it('wrap giữ tiền tố danh sách và quote, thụt các dòng tiếp theo', () => {
    expect(run('- ' + long, 0, 0, 'wrap-72').split('\n')[1]!.startsWith('  ')).toBe(true);
    const q = run('> ' + long, 0, 0, 'wrap-72').split('\n');
    expect(q.every((l) => l.startsWith('> '))).toBe(true);
  });
  it('wrap không đụng khối code, bảng, heading', () => {
    const t = `# ${long}\n\n\`\`\`\n${long}\n\`\`\`\n\n| ${long} |\n`;
    expect(applyTransform(t, 0, t.length, 'wrap-72')).toEqual({ error: 'NOTHING TO CHANGE' });
  });
  it('unwrap nối các dòng của cùng đoạn, giữ ranh giới đoạn và mục danh sách', () => {
    expect(run('one\ntwo\nthree\n\nnext\nline', 0, 24, 'unwrap')).toBe('one two three\n\nnext line');
    expect(run('- a\n  b\n- c\n  d', 0, 15, 'unwrap')).toBe('- a b\n- c d');
    expect(run('> a\n> b', 0, 7, 'unwrap')).toBe('> a b');
  });
  it('wrap rồi unwrap trả về chữ ban đầu', () => {
    const wrapped = run(long, 0, 0, 'wrap-72');
    expect(run(wrapped, 0, wrapped.length, 'unwrap')).toBe(long);
  });
});

describe('transform: dấu nháy, khoảng trắng', () => {
  it('nháy cong theo ngữ cảnh, bỏ qua code inline và khối code; nháy thẳng đảo lại', () => {
    expect(run('She said "hi" and it\'s `"raw"`.', 0, 0, 'quotes-curly')).toBe('She said “hi” and it’s `"raw"`.');
    expect(run('"a"\n```\n"b"\n```', 0, 0, 'quotes-curly')).toBe('“a”\n```\n"b"\n```');
    expect(run('“a” ‘b’ it’s', 0, 0, 'quotes-straight')).toBe('"a" \'b\' it\'s');
  });
  it('trim cả tài liệu khi không chọn, hoặc chỉ vùng chọn', () => {
    expect(run('a  \nb \n', 0, 0, 'trim')).toBe('a\nb\n');
    expect(run('a  \nb \nc ', 0, 6, 'trim')).toBe('a\nb\nc ');
  });
  it('mọi transform trong menu có id hợp lệ và nhãn', () => {
    for (const t of TRANSFORMS) expect(typeof run('abc def', 0, 7, t.id)).toBe('string');
    expect(new Set(TRANSFORMS.map((t) => t.id)).size).toBe(TRANSFORMS.length);
  });
});

describe('slug và lint liên kết', () => {
  it('slugify, idMaker đánh số trùng', () => {
    // đúng như github-slugger: mục lục viết cho GitHub (README, SKILL.md) phải trỏ được
    expect(slugify("What's new?")).toBe('whats-new');
    expect(slugify('API v2.0')).toBe('api-v20');
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('Tiếng Việt: Đây là bài')).toBe('tiếng-việt-đây-là-bài');
    expect(slugify('foo_bar')).toBe('foo_bar');
    expect(slugify('C++ & Rust')).toBe('c--rust');
    expect(slugify('A  B')).toBe('a--b');
    const next = idMaker();
    expect([next('A'), next('A'), next('A'), next('')]).toEqual(['a', 'a-1', 'a-2', 'section']);
  });
  it('plainHeading khớp chữ hiển thị của bản dựng', async () => {
    const heads = ['Plain', '`code` and **bold**', 'A [link](https://x.dev) here', '*it* and ~~gone~~', 'Escaped \\* star', 'Tiếng Việt có `dấu`'];
    const md = heads.map((h) => `## ${h}`).join('\n\n');
    const { html } = await renderMarkdown(md);
    const ids = [...html.matchAll(/<h2[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    const next = idMaker();
    expect(heads.map((h) => next(plainHeading(h)))).toEqual(ids);
  });
  const L = (s: string) => lint(s).map((i) => `${i.line}:${i.message}`);
  it('anchor trỏ tới heading có thật thì sạch; không có thì báo', () => {
    expect(L('# A\n\n## Hello World\n\n[ok](#hello-world) [top](#a)\n')).toEqual([]);
    expect(L('# A\n\n[bad](#nope)\n')).toEqual(['3:Anchor "#nope" not found in this document']);
    expect(L('# A\n\n## A\n\n[second](#a-1)\n')).toEqual([]); // heading trùng tên được đánh số như bản dựng
  });
  it('anchor tiếng Việt: viết thẳng hoặc đã mã hoá phần trăm đều khớp heading có dấu', () => {
    expect(L('# T\n\n## Tiếng Việt\n\n[a](#tiếng-việt) [b](#ti%E1%BA%BFng-vi%E1%BB%87t)\n')).toEqual([]);
    expect(L("# T\n\n## What's new?\n\n[a](#whats-new) [b](#what-s-new)\n")).toEqual(['5:Anchor "#what-s-new" not found in this document']);
  });
  it('reference link và định nghĩa', () => {
    expect(L('see [text][r] and [r2][]\n\n[r]: https://a.dev\n[r2]: https://b.dev\n')).toEqual([]);
    expect(L('see [text][missing]\n')).toEqual(['1:Reference [missing] has no definition']);
    expect(L('[unused]: https://a.dev\n')).toEqual(['1:Definition [unused] is never used']);
    expect(L('shortcut [r] ok\n\n[r]: https://a.dev\n')).toEqual([]);
  });
  it('chú thích', () => {
    expect(L('text[^1]\n\n[^1]: note\n')).toEqual([]);
    expect(L('text[^1]\n')).toEqual(['1:Footnote [^1] has no definition']);
    expect(L('[^2]: orphan\n')).toEqual(['1:Footnote definition [^2] is never used']);
  });
  it('bỏ qua code inline, khối code và front-matter', () => {
    expect(L('---\nx: [a](#zzz)\n---\n\n`[a](#zzz)`\n\n```\n[a](#zzz)\n```\n')).toEqual([]);
  });
});
