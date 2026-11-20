import { describe, expect, it } from 'vitest';
import { parseCallout } from '../src/lib/studio/callout';
import { renderMarkdown } from '../src/lib/studio/pipeline';

describe('callout', () => {
  it('đọc dấu [!KIND] và số ký tự cần cắt', () => {
    expect(parseCallout('[!NOTE]\nbody')).toEqual({ kind: 'note', len: 8 });
    expect(parseCallout('[!warning] text')).toEqual({ kind: 'warning', len: 11 });
    expect(parseCallout('[!UNKNOWN]\nx')).toBeNull();
    expect(parseCallout('plain')).toBeNull();
  });
  it('blockquote có dấu thành khối callout, blockquote thường giữ nguyên', async () => {
    const a = (await renderMarkdown('> [!TIP]\n> Use it.\n')).html;
    expect(a).toContain('class="callout callout-tip"');
    expect(a).toContain('<p class="callout-t">Tip</p>');
    expect(a).toContain('Use it.');
    expect(a).not.toContain('[!TIP]');
    expect((await renderMarkdown('> just a quote\n')).html).toContain('<blockquote');
  });
});

describe('math', () => {
  it('có $ thì dựng KaTeX, không có thì không', async () => {
    expect((await renderMarkdown('Inline $a^2+b^2=c^2$ here.\n\n$$\\int_0^1 x\\,dx$$\n')).html).toContain('class="katex"');
    expect((await renderMarkdown('No formula here.\n')).html).not.toContain('katex');
  });
  it('công thức lỗi không làm vỡ trang', async () => {
    const h = (await renderMarkdown('Bad $\\frac{$ math\n')).html;
    expect(h).toContain('Bad');
  });
});

describe('mermaid', () => {
  it('khối mermaid được đánh dấu cho bước dựng ở luồng chính', async () => {
    const h = (await renderMarkdown('```mermaid\ngraph TD; A-->B\n```\n')).html;
    expect(h).toContain('data-mermaid');
    expect(h).toContain('graph TD; A-->B');
  });
});

describe('bài mặc định', () => {
  it('dựng đủ callout, bảng, công thức, sơ đồ, task list và chú thích', async () => {
    const { SAMPLE } = await import('../src/lib/studio/sample');
    const { html, fm } = await renderMarkdown(SAMPLE);
    expect(fm?.rows.map(([k]) => k)).toEqual(['title', 'subtitle', 'tags', 'updated']);
    expect((html.match(/class="callout callout-/g) ?? []).length).toBe(1);
    expect((html.match(/data-mermaid/g) ?? []).length).toBe(1);
    expect((html.match(/class="katex-display"/g) ?? []).length).toBe(1);
    expect(html).toContain('class="footnotes"');
    expect((html.match(/<table/g) ?? []).length).toBe(1);
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(4);
    expect(html).not.toContain('katex-error');
  });
});

describe('template mẫu', () => {
  it('mọi template dựng được, có tiêu đề và id khác nhau', async () => {
    const { TEMPLATES } = await import('../src/lib/studio/templates');
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const t of TEMPLATES) {
      const { html } = await renderMarkdown(t.body());
      expect(html, t.id).toContain('<h1');
      expect(html, t.id).not.toContain('katex-error');
    }
  });
  it('template Technical note có công thức, sơ đồ và code', async () => {
    const { TEMPLATES } = await import('../src/lib/studio/templates');
    const { html } = await renderMarkdown(TEMPLATES.find((t) => t.id === 'note')!.body());
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('data-mermaid');
    expect(html).toContain('callout-tip');
  });
});

describe('hasMath', () => {
  it('chỉ nhận công thức thật, không nhận $ trong code hay giá tiền', async () => {
    const { hasMath } = await import('../src/lib/studio/pipeline');
    expect(hasMath('Inline $a^2$ here')).toBe(true);
    expect(hasMath('$$\nx\n$$')).toBe(true);
    expect(hasMath('```bash\nkill $PID\nV=$!\n```')).toBe(false);
    expect(hasMath('run `echo $HOME`')).toBe(false);
    expect(hasMath('it costs $5')).toBe(false);
    expect(hasMath('```bash\nkill $PID\n```\n\nthen $x+1$ ok')).toBe(true);
  });
});
