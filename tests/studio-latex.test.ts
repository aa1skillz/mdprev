import { describe, expect, it } from 'vitest';
import { escapeTex, toLatex } from '../src/lib/studio/latex';

const tex = (md: string, title?: string) => toLatex(md, title ? { title } : undefined).tex;
const body = (md: string) => { const t = tex(md); return t.slice(t.indexOf('\\begin{document}') + 16, t.indexOf('\\end{document}')).trim(); };

describe('toLatex', () => {
  it('escape đủ ký tự đặc biệt', () => {
    expect(escapeTex('\\ # $ % & _ { } ~ ^')).toBe('\\textbackslash{} \\# \\$ \\% \\& \\_ \\{ \\} \\textasciitilde{} \\textasciicircum{}');
    expect(escapeTex('Tiếng Việt <ok> é')).toBe('Tiếng Việt <ok> é');
  });

  it('khung tài liệu', () => {
    const t = tex('hi');
    expect(t).toContain('\\documentclass[11pt]{article}');
    expect(t).toContain('\\usepackage{fontspec}');
    expect(t).toContain('\\usepackage{longtable,booktabs}');
    expect(t).toContain('\\end{document}');
    expect(t).not.toContain('\\maketitle');
  });

  it('tiêu đề các cấp', () => {
    expect(body('# A\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F')).toBe(
      '\\section{A}\n\n\\subsection{B}\n\n\\subsubsection{C}\n\n\\paragraph{D}\n\n\\subparagraph{E}\n\n\\subparagraph{F}');
  });

  it('nhấn mạnh, đậm, gạch, code dòng', () => {
    expect(body('*a* **b** ~~c~~ `x_y z`')).toBe('\\emph{a} \\textbf{b} \\sout{c} \\texttt{x\\_y\\ z}');
  });

  it('link: % và # trong URL, autolink, anchor nội bộ', () => {
    expect(body('[t](https://a.com/p?q=1%20x#frag)')).toBe('\\href{https://a.com/p?q=1\\%20x\\#frag}{t}');
    expect(body('<https://a.com/x>')).toBe('\\url{https://a.com/x}');
    expect(body('[nhảy](#muc-1)')).toBe('nhảy');
    expect(body('[r][1]\n\n[1]: https://b.com/a_b')).toBe('\\href{https://b.com/a_b}{r}');
  });

  it('ảnh thành chữ thay thế và ghi chú', () => {
    const r = toLatex('![sơ đồ](a.png) và ![](b.png)');
    expect(r.tex).toContain('\\emph{[image: sơ đồ]}');
    expect(r.tex).not.toContain('a.png');
    expect(r.notes.join('|')).toMatch(/2 images replaced/);
  });

  it('danh sách lồng nhau và start', () => {
    const t = body('- a\n  - b\n- c\n\n3. x\n4. y');
    expect(t).toContain('\\begin{itemize}\n\\item a\n\n\\begin{itemize}\n\\item b\n\\end{itemize}\n\\item c\n\\end{itemize}');
    expect(t).toContain('\\begin{enumerate}\n\\setcounter{enumi}{2}\n\\item x\n\\item y\n\\end{enumerate}');
  });

  it('task list', () => {
    const t = body('- [ ] a\n- [x] b');
    expect(t).toContain('\\item $\\square$ a');
    expect(t).toContain('\\item $\\boxtimes$ b');
  });

  it('bảng với căn lề', () => {
    const t = body('| A | B | C |\n|:--|:-:|--:|\n| 1 | x_y | 3 |');
    expect(t).toContain('\\begin{longtable}{lcr}');
    expect(t).toContain('\\toprule\n\\textbf{A} & \\textbf{B} & \\textbf{C} \\\\\n\\midrule\n1 & x\\_y & 3 \\\\\n\\bottomrule\n\\end{longtable}');
  });

  it('chú thích cuối trang', () => {
    expect(body('Chữ[^1].\n\n[^1]: Nội dung 50%.')).toBe('Chữ\\footnote{Nội dung 50\\%.}.');
  });

  it('công thức giữ nguyên', () => {
    expect(body('a $x_1^2$ b')).toBe('a $x_1^2$ b');
    expect(body('$$\n\\frac{a}{b}\n$$')).toBe('\\[\n\\frac{a}{b}\n\\]');
  });

  it('khối code giữ nguyên, tách \\end{verbatim}', () => {
    expect(body('```js\na_b {}\n```')).toBe('\\begin{verbatim}\na_b {}\n\\end{verbatim}');
    const t = body('```\n\\end{verbatim}\n```');
    expect(t.match(/\\end\{verbatim\}/g)?.length).toBe(2); // một thật, một chữ trong \texttt đã bị phá
    expect(t).toContain('\\texttt{');
  });

  it('mermaid giữ mã và ghi chú', () => {
    const r = toLatex('```mermaid\ngraph TD; A-->B\n```');
    expect(r.tex).toContain('\\begin{verbatim}\ngraph TD; A-->B');
    expect(r.notes.join('|')).toMatch(/1 Mermaid diagram left as code/);
  });

  it('front matter title thành \\maketitle', () => {
    const t = tex('---\ntitle: "Tên & bài"\nauthor: Cris\ndate: 2026-01-02\n---\n\n# H');
    expect(t).toContain('\\title{Tên \\& bài}');
    expect(t).toContain('\\author{Cris}');
    expect(t).toContain('\\date{2026-01-02}');
    expect(t).toContain('\\maketitle');
    expect(t).not.toContain('2026-01-02}\n\n# H');
  });

  it('opts.title chỉ vào hypersetup', () => {
    const t = tex('x', 'Doc 1');
    expect(t).toContain('pdftitle={Doc 1}');
    expect(t).not.toContain('\\maketitle');
  });

  it('HTML thô bị bỏ và ghi chú', () => {
    const r = toLatex('a\n\n<div>x</div>\n\nb <b>c</b>');
    expect(r.tex).not.toContain('<div>');
    expect(r.notes.join('|')).toMatch(/raw HTML dropped/);
  });

  it('callout, quote, đường kẻ, ngắt dòng', () => {
    expect(body('> [!NOTE]\n> hay')).toBe('\\begin{quote}\n\\textbf{Note}\n\nhay\n\\end{quote}');
    expect(body('> q')).toBe('\\begin{quote}\nq\n\\end{quote}');
    expect(body('---')).toBe('\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par');
    expect(body('a  \nb')).toContain('a\\\\');
  });
});
