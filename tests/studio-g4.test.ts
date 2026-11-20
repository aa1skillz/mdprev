import { describe, expect, it } from 'vitest';
import { diffBlocks, splitLines } from '../src/lib/diff/engine';
import { hunksOf, revertHunk } from '../src/lib/studio/hunks';
import { htmlToMarkdown, looksLikeMarkdown, tidy } from '../src/lib/studio/paste-html';
import { slideRanges } from '../src/lib/studio/slides';
import { TEMPLATES } from '../src/lib/studio/templates';

const O = { ignoreSpace: false, ignoreCase: false };

describe('slideRanges', () => {
  it('cắt ở hr, bỏ phần rỗng', () => {
    expect(slideRanges(['H1', 'P', 'HR', 'H2', 'UL', 'HR', 'HR', 'P'])).toEqual([[0, 2], [3, 5], [7, 8]]);
  });
  it('không có hr thì cắt ở h1/h2', () => {
    expect(slideRanges(['P', 'H2', 'P', 'H3', 'P', 'H2', 'P'])).toEqual([[0, 1], [1, 5], [5, 7]]);
    expect(slideRanges(['H1', 'P', 'H2', 'P'])).toEqual([[0, 2], [2, 4]]);
  });
  it('không có gì để cắt thì một slide; rỗng thì không có slide', () => {
    expect(slideRanges(['P', 'H3', 'P'])).toEqual([[0, 3]]);
    expect(slideRanges([])).toEqual([]);
  });
});

describe('hunks', () => {
  const rev = (cur: string, base: string) => {
    let text = cur;
    for (let guard = 0; guard < 200; guard++) {
      const hs = hunksOf(diffBlocks(splitLines(base), splitLines(text), O).blocks);
      if (!hs.length) return text;
      text = revertHunk(text, base, hs[0]!).text; // tính lại sau mỗi lần hoàn tác
    }
    throw new Error('không hội tụ');
  };
  it('hoàn tác từng cụm một và tính lại thì về đúng bản gốc', () => {
    const base = 'a\nb\nc\nd\ne\nf\ng\n';
    for (const cur of ['a\nX\nc\nd\ne\nf\ng\n', 'a\nc\nd\ne\nf\n', 'new\na\nb\nc\nd\ne\nf\ng\nend\n', 'a\nb\nc\nd\nE\nF\nG2\nmore\n', '']) {
      expect([cur, rev(cur, base)]).toEqual([cur, base]);
    }
  });
  it('khớp trên chuỗi ngẫu nhiên', () => {
    let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const word = () => 'w' + Math.floor(rnd() * 6);
    for (let k = 0; k < 300; k++) {
      const base = Array.from({ length: 1 + Math.floor(rnd() * 30) }, word).join('\n') + '\n';
      const lines = splitLines(base);
      for (let e = 0; e < 1 + Math.floor(rnd() * 6); e++) {
        const i = Math.floor(rnd() * (lines.length + 1)); const op = rnd();
        if (op < 0.4) lines.splice(i, 0, word() + 'x'); else if (op < 0.7) lines.splice(i, 1); else lines[i] = word() + 'y';
      }
      const cur = lines.length ? lines.join('\n') + '\n' : '';
      expect(rev(cur, base)).toBe(base);
    }
  });
  it('con trỏ đặt ở đầu cụm vừa hoàn tác', () => {
    const base = 'a\nb\nc\n', cur = 'a\nX\nc\n';
    const h = hunksOf(diffBlocks(splitLines(base), splitLines(cur), O).blocks)[0]!;
    expect(revertHunk(cur, base, h)).toEqual({ text: base, caret: 2 });
  });
});

describe('paste html', () => {
  it('nhận biết Markdown có cấu trúc', () => {
    expect(looksLikeMarkdown('# Title')).toBe(true);
    expect(looksLikeMarkdown('see [x](http://a.b)')).toBe(true);
    expect(looksLikeMarkdown('plain words only')).toBe(false);
    expect(looksLikeMarkdown('snake_case_name and 2 * 3')).toBe(false);
  });
  it('turndown: tiêu đề, danh sách, link, bảng, code', async () => {
    const md = await htmlToMarkdown('<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://x.io">link</a>.</p><ul><li>one</li><li>two</li></ul><pre><code>let a = 1;</code></pre><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(md).toContain('## Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('[link](https://x.io)');
    expect(md).toMatch(/^- +one$/m);
    expect(md).toContain('```');
    expect(md).toContain('| A | B |');
  });
  it('chữ trơn có ký tự đặc biệt thì trả null (dùng chữ gốc)', async () => {
    expect(await htmlToMarkdown('<p>just text</p>')).toBeNull();
  });
  it('tidy gọn dòng trống và khoảng trắng cuối dòng', () => { expect(tidy('a  \n\n\n\nb \n')).toBe('a\n\nb'); });
});

describe('templates', () => {
  it('mỗi mẫu có tiêu đề h1 và không có chỗ trống ngày', () => {
    for (const t of TEMPLATES) { const b = t.body(); expect(b.startsWith('# ')).toBe(true); expect(b).not.toContain('undefined'); expect(b.endsWith('\n')).toBe(true); }
    expect(TEMPLATES.map((t) => t.id)).toEqual(['readme', 'adr', 'meeting', 'changelog', 'design', 'postmortem', 'runbook', 'bug', 'pr', 'weekly', 'api', 'note']);
    expect(TEMPLATES[1]!.body()).toMatch(/Date: \d{4}-\d\d-\d\d/);
  });
});
