import { describe, expect, it } from 'vitest';
import { normalizeMathDelims as n } from '../src/lib/studio/mathdelim';
import { renderMarkdown } from '../src/lib/studio/pipeline';

const html = async (md: string) => (await renderMarkdown(md)).html;

describe('dấu phân cách toán kiểu LaTeX', () => {
  it('\\(…\\) thành $…$, cắt khoảng trắng sát dấu', () => {
    expect(n('Einstein: \\(E = mc^2\\).')).toBe('Einstein: $E = mc^2$.');
    expect(n('a \\( x \\) b \\(y\\)')).toBe('a $x$ b $y$');
  });
  it('\\[ … \\] nhiều dòng thành $$ … $$, giữ nguyên số dòng', () => {
    const src = 'Công thức:\n\n\\[\nx = \\frac{-b}{2a}\n\\]\n\nHết';
    const out = n(src);
    expect(out).toBe('Công thức:\n\n$$\nx = \\frac{-b}{2a}\n$$\n\nHết');
    expect(out.split('\n').length).toBe(src.split('\n').length);
  });
  it('\\[ … \\] một dòng; trong blockquote', () => {
    expect(n('\\[ a+b \\]')).toBe('$$a+b$$');
    expect(n('> \\[\n> x\n> \\]')).toBe('> $$\n> x\n> $$');
  });
  it('không đụng khối code, code dòng, gạch chéo ngược đã thoát, khối thụt lề', () => {
    expect(n('```\n\\(a\\)\n\\[\nb\n\\]\n```')).toBe('```\n\\(a\\)\n\\[\nb\n\\]\n```');
    expect(n('~~~tex\n\\(a\\)\n~~~')).toBe('~~~tex\n\\(a\\)\n~~~');
    expect(n('dùng `\\(x\\)` để viết')).toBe('dùng `\\(x\\)` để viết');
    expect(n('thật sự \\\\(x\\\\) ở đây')).toBe('thật sự \\\\(x\\\\) ở đây');
    expect(n('mở đầu\n\n    \\(code\\)\n')).toBe('mở đầu\n\n    \\(code\\)\n');
  });
  it('trường hợp không chắc thì để nguyên (không làm khối toán nuốt phần còn lại)', () => {
    expect(n('\\[TODO\\] sửa sau')).toBe('\\[TODO\\] sửa sau'); // dấu ngoặc đã thoát, không phải công thức
    expect(n('\\[\nx\n\ny\n\\]')).toBe('\\[\nx\n\ny\n\\]'); // dòng trống chen giữa
    expect(n('\\[\nx = 1 \\]')).toBe('\\[\nx = 1 \\]'); // dòng đóng kèm nội dung: không thể đóng khối an toàn
    expect(n('chưa đóng \\(x')).toBe('chưa đóng \\(x');
  });
  it('render ra KaTeX (dòng và khối), không còn mã thô', async () => {
    const out = await html('Einstein: \\(E = mc^2\\).\n\n\\[\n\\frac{a}{b}\n\\]\n');
    expect(out).toContain('class="katex"');
    expect(out).toContain('katex-display');
    const visible = out.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, ''); // KaTeX giữ mã nguồn trong thẻ annotation (MathML), không hiện ra
    expect(visible).not.toContain('\\frac');
    expect(visible).not.toContain('\\(');
  });
  it('tài liệu có \\(…\\) khi `$` tiền tệ không bị hiểu nhầm', async () => {
    const out = await html('Giá \\(x^2\\) là 5 đô.');
    expect(out).toContain('katex');
  });
});

describe('HTML trần được phép (kbd, details/summary, sub, sup, mark, br)', () => {
  it('kbd, sub, sup, mark và <br>', async () => {
    const out = await html('Nhấn <kbd>Ctrl</kbd> + <KBD>S</KBD>; H<sub>2</sub>O, x<sup>2</sup>, <mark>chú ý</mark>.<br>dòng mới\n');
    expect(out).toContain('<kbd>Ctrl</kbd>');
    expect(out).toContain('<kbd>S</kbd>');
    expect(out).toContain('<sub>2</sub>');
    expect(out).toContain('<sup>2</sup>');
    expect(out).toContain('<mark>chú ý</mark>');
    expect(out).toContain('<br>');
  });
  it('details có summary, nội dung markdown bên trong, mặc định thu gọn; có open thì mở', async () => {
    const md = '<details>\n<summary>Bấm để mở</summary>\n\nNội dung **ẩn**.\n\n- một\n- hai\n\n</details>\n\nSau.\n';
    const out = await html(md);
    expect(out).toMatch(/<details[^>]*>\s*<summary>Bấm để mở<\/summary>/);
    expect(out).toMatch(/<details[^>]*>[\s\S]*<strong>ẩn<\/strong>[\s\S]*<li[^>]*>một<\/li>[\s\S]*<\/details>\s*<p[^>]*>Sau\.<\/p>/);
    expect(out).not.toMatch(/<details[^>]*\sopen/);
    expect(await html('<details open>\n<summary>S</summary>\n\nx\n\n</details>\n')).toMatch(/<details[^>]*\sopen/);
  });
  it('thiếu </details> thì kéo tới hết khối cha; thẻ đóng lạc bị bỏ', async () => {
    const a = await html('<details>\n<summary>S</summary>\n\nchưa đóng\n');
    expect(a).toContain('<details');
    expect(a).toContain('chưa đóng');
    expect(await html('rồi </kbd> lạc\n')).not.toContain('</kbd>');
  });
  it('hoạt động trong danh sách và blockquote', async () => {
    const out = await html('- mục <kbd>Esc</kbd>\n\n> trích <mark>dẫn</mark>\n');
    expect(out).toContain('<kbd>Esc</kbd>');
    expect(out).toContain('<mark>dẫn</mark>');
  });
});

describe('HTML: mọi thứ khác vẫn bị chặn (không thuộc tính, không phần tử lạ)', () => {
  const cases = [
    '<kbd onclick="alert(1)">x</kbd>',
    '<details open ontoggle="alert(1)"><summary>s</summary></details>',
    '<summary><img src=x onerror=alert(1)></summary>',
    '</kbd><script>alert(1)</script>',
    '<kbd style="position:fixed">x</kbd>',
    '<details><summary>a <b onmouseover=alert(1)>b</b></summary></details>',
    '<mark class="x" id="y">z</mark>',
    '<DETAILS OPEN><SUMMARY>x</SUMMARY>\n\n<iframe src="//evil"></iframe>\n\n</DETAILS>',
  ];
  for (const raw of cases) {
    it(raw.slice(0, 48), async () => {
      const out = await html(`# t\n\n${raw}\n`);
      expect(out).not.toMatch(/<(script|iframe|img|svg|b|object|embed)\b/i);
      expect(out).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i); // thẻ thật không có trình xử lý sự kiện (chữ đã thoát `&#x3C;…` thì không phải thẻ)
      expect(out).not.toMatch(/<(kbd|mark|sub|sup|summary)\s/i); // phần tử cho phép không có thuộc tính
      expect(out).not.toMatch(/<details\s+(?!open>)[^>]*>/i); // details chỉ có thể có `open`
    });
  }
  it('khối lẫn thẻ lạ hiện thành chữ đã thoát (không mất âm thầm)', async () => {
    const out = await html('<summary><b>x</b></summary>\n');
    expect(out).toContain('&#x3C;b>');
  });
});

import { prepSource } from '../src/lib/studio/mermaid';

describe('Gantt: mốc trục theo tháng khi axisFormat chỉ tới tháng/năm', () => {
  const g = (fmt: string, extra = '') => `gantt\n    title T\n    dateFormat YYYY-MM-DD\n    axisFormat ${fmt}\n${extra}    section S\n    A :a, 2026-01-01, 3d\n`;
  it('thêm tickInterval 1month ngay sau axisFormat', () => {
    expect(prepSource(g('%b %Y'))).toContain('    axisFormat %b %Y\n    tickInterval 1month\n');
    expect(prepSource(g('%B'))).toContain('tickInterval 1month');
  });
  it('giữ nguyên khi có ngày/tuần/giờ, khi tác giả đã đặt tickInterval, khi không có axisFormat, khi không phải gantt', () => {
    for (const f of ['%d %b', '%Y-%m-%d', '%H:%M', '%a', '%U']) expect(prepSource(g(f))).toBe(g(f));
    const withTick = g('%b %Y', '    tickInterval 1week\n');
    expect(prepSource(withTick)).toBe(withTick);
    const noAxis = 'gantt\n    title T\n    section S\n    A :a, 2026-01-01, 3d\n';
    expect(prepSource(noAxis)).toBe(noAxis);
    expect(prepSource('flowchart TD\n  A --> B\n')).toBe('flowchart TD\n  A --> B\n');
  });
});

describe('xuất file với \\( \\)', () => {
  it('LaTeX nhận công thức inline', async () => {
    const { toLatex } = await import('../src/lib/studio/latex');
    expect(toLatex('Là \\(x^2\\).').tex).toMatch(/\$x\^2\$/);
  });
});

describe('muse: HTML liền kề + liên kết ngoài', () => {
  it('`</details>` dán liền fence/footnote không nuốt phần sau', async () => {
    const out = await renderMarkdown('<details>\n<summary>S</summary>\n\nin\n\n</details>\n```ts\nconst x = 1;\n```\nSau đó.\n');
    expect(out.html).toContain('<details>');
    expect(out.html).toMatch(/<pre|class="cb"/);
    expect(out.html).toContain('Sau đó');
    expect(out.html).not.toContain('&lt;/details&gt;');
  });
  it('liên kết http(s) mở tab mới, anchor/mailto thì không', async () => {
    const out = await renderMarkdown('[a](https://example.com) [b](#x) [c](mailto:a@b.c)');
    expect(out.html).toMatch(/<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">a<\/a>/);
    expect(out.html).not.toMatch(/href="#x"[^>]*target/);
    expect(out.html).not.toMatch(/mailto[^>]*target/);
  });
});

describe('tiền tệ không thành công thức', () => {
  it('chuẩn hoá: cặp mở bằng số mà thân kết thúc bằng khoảng trắng, hoặc đóng trước chữ số', () => {
    expect(n('Giá $5 và $10 mỗi cái.')).toBe('Giá \\$5 và \\$10 mỗi cái.');
    expect(n('Từ $5-$10.')).toBe('Từ \\$5-\\$10.');
    expect(n('Total: $40,000 and $65,000')).toBe('Total: \\$40,000 and \\$65,000');
  });
  it('công thức thật giữ nguyên, kể cả bắt đầu bằng số; code và `\\$` không bị đụng', () => {
    for (const m of ['$5$', '$2x+1$', 'a $x$ b $y$', '$$5 + 5$$', '`$5 và $10`', '\\$5 và \\$10']) expect(n(m)).toBe(m);
  });
  it('render: tiền hiện nguyên chữ, công thức vẫn ra KaTeX', async () => {
    const h = await html('Giá $5 và $10, còn $x^2$ là toán.');
    expect(h).toContain('$5 và $10');
    expect(h.match(/class="katex"/g)?.length).toBe(1);
  });
});

describe('<details> không nuốt nội dung phía sau (Muse vòng 4)', () => {
  const after = (h: string) => h.slice(h.indexOf('</details>') + '</details>'.length);
  const full = (inner: string) => `<details>\n<summary>Chi tiết gấp</summary>\n${inner}</details>\n\`\`\`js\nconst a = 1;\n\`\`\`\n\n\`\`\`mermaid\ngraph TD; A-->B;\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] xong\n- [ ] chưa\n\n> trích dẫn\n\nBấm <kbd>Ctrl</kbd>+<kbd>C</kbd>\n\nĐoạn cuối.\n`;
  const check = (h: string) => {
    const inside = h.slice(0, h.indexOf('</details>'));
    const out = after(h);
    expect(inside).toContain('<details>');
    for (const frag of ['class="cb"', 'data-mermaid', '<table', 'task-list-item', '<blockquote', '<kbd>', 'Đoạn cuối.']) {
      expect(inside, `${frag} không được nằm trong details`).not.toContain(frag);
      expect(out, `${frag} phải nằm sau details`).toContain(frag);
    }
  };
  it('tài liệu của Muse: </details> liền với ```js, không có dòng trống nào sau nó', async () => { check(await html(full('Nội dung ẩn\n'))); });
  it('nội dung trong details có dòng trống (đoạn chữ, danh sách)', async () => { check(await html(full('\nĐoạn **đậm**\n\n- a\n- b\n\n'))); });
  it('details một dòng: <details><summary>…</summary>nội dung</details> rồi ```js liền sau', async () => {
    const h = await html('<details><summary>Gấp</summary>nội dung</details>\n```js\nconst a = 1;\n```\n\nĐoạn cuối.\n');
    expect(h).toContain('<details><summary>Gấp</summary>nội dung</details>');
    expect(after(h)).toContain('class="cb"');
    expect(after(h)).toContain('Đoạn cuối.');
  });
  it('chữ thuần giữa thẻ được thoát, không thành HTML', async () => {
    const h = await html('<details><summary>S</summary>a &lt;b&gt; c</details>\n');
    expect(h).not.toContain('<b>');
  });
});

