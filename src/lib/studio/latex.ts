/**
 * Markdown → LaTeX (biên dịch bằng XeLaTeX/tectonic). Dựng từ cây mdast như bản xem và docx.
 * Chưa hỗ trợ: ảnh (thay bằng chữ thay thế), sơ đồ Mermaid (giữ mã), HTML thô (bỏ); `notes` liệt kê những gì không chuyển được.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Definition, FootnoteDefinition, List, PhrasingContent, Root, RootContent, Table } from 'mdast';
import { splitFrontMatter } from './frontmatter';
import { normalizeMathDelims } from './mathdelim';
import { CALLOUTS, parseCallout } from './callout';

export interface LatexResult { tex: string; notes: string[] }

const SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}', '#': '\\#', $: '\\$', '%': '\\%', '&': '\\&', _: '\\_', '{': '\\{', '}': '\\}',
  '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
};
/** Thoát các ký tự đặc biệt của TeX; Unicode giữ nguyên. */
export const escapeTex = (s: string): string => s.replace(/[\\#$%&_{}~^]/g, (c) => SPECIAL[c]!);

/** URL trong \href/\url: `%` `#` cần dấu `\`, `\` và ngoặc nhọn được mã hoá phần trăm. */
const escapeUrl = (u: string): string => u.replace(/[%#\\{}]/g, (c) => (c === '%' || c === '#' ? `\\${c}` : `\\%${c.charCodeAt(0).toString(16).toUpperCase()}`));
/** Tránh `[` đầu dòng bị hiểu là đối số tuỳ chọn của \item / \\. */
const guard = (s: string): string => (s.startsWith('[') ? `{}${s}` : s);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

const PREAMBLE = `\\documentclass[11pt]{article}
\\usepackage{fontspec}
\\usepackage{amsmath,amssymb,graphicx}
\\usepackage{longtable,booktabs}
\\usepackage{ulem}\\normalem
\\usepackage{verbatim}
\\usepackage[margin=1in]{geometry}
\\usepackage{hyperref}`;

export function toLatex(src: string, opts: { title?: string } = {}): LatexResult {
  const { fm, body } = splitFrontMatter(src);
  const p = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  const tree = p.runSync(p.parse(normalizeMathDelims(body))) as Root;

  const defs = new Map<string, Definition>();
  const notesDef = new Map<string, FootnoteDefinition>();
  const walk = (n: { type: string; children?: unknown[] }) => {
    if (n.type === 'definition') defs.set(((n as Definition).identifier).toLowerCase(), n as Definition);
    if (n.type === 'footnoteDefinition') notesDef.set(((n as FootnoteDefinition).identifier).toLowerCase(), n as FootnoteDefinition);
    (n.children as typeof n[] | undefined)?.forEach(walk);
  };
  walk(tree);

  let images = 0, mermaids = 0, htmls = 0;
  let inCell = false; // trong ô bảng: ngắt dòng thành khoảng trắng
  let enumDepth = 0;

  const inl = (ns: PhrasingContent[]): string => ns.map(phrasing).join('');
  const link = (url: string, kids: PhrasingContent[]): string => {
    if (!url || url.startsWith('#')) return inl(kids);
    const only = kids.length === 1 && kids[0]!.type === 'text' ? (kids[0] as { value: string }).value : null;
    if (only !== null && (only === url || `http://${only}` === url || `https://${only}` === url || `mailto:${only}` === url)) return `\\url{${escapeUrl(url)}}`;
    return `\\href{${escapeUrl(url)}}{${inl(kids)}}`;
  };
  const image = (alt: string): string => { images++; return `\\emph{${escapeTex(`[image${alt ? `: ${alt}` : ''}]`)}}`; };

  function phrasing(n: PhrasingContent): string {
    switch (n.type) {
      case 'text': return escapeTex(n.value);
      case 'emphasis': return `\\emph{${inl(n.children)}}`;
      case 'strong': return `\\textbf{${inl(n.children)}}`;
      case 'delete': return `\\sout{${inl(n.children)}}`;
      case 'inlineCode': return `\\texttt{${escapeTex(n.value).replace(/ /g, '\\ ')}}`;
      case 'inlineMath': return `$${n.value}$`;
      case 'break': return inCell ? ' ' : '\\\\{}\n';
      case 'link': return link(n.url, n.children);
      case 'linkReference': return link(defs.get(n.identifier.toLowerCase())?.url ?? '', n.children);
      case 'image': return image(n.alt ?? '');
      case 'imageReference': return image(n.alt ?? '');
      case 'html': htmls++; return '';
      case 'footnoteReference': {
        const d = notesDef.get(n.identifier.toLowerCase());
        if (!d) return '';
        return `\\footnote{${d.children.map((c) => (c.type === 'paragraph' ? inl(c.children) : c.type === 'code' ? `\\texttt{${escapeTex(c.value)}}` : block(c))).join(' ')}}`;
      }
      default: return '';
    }
  }

  function list(n: List): string {
    const env = n.ordered ? 'enumerate' : 'itemize';
    const pre = n.ordered && (n.start ?? 1) !== 1 ? `\\setcounter{enum${['i', 'ii', 'iii', 'iv'][enumDepth] ?? 'iv'}}{${(n.start ?? 1) - 1}}\n` : '';
    if (n.ordered) enumDepth++;
    const items = n.children.map((li) => {
      const box = li.checked === true ? '$\\boxtimes$ ' : li.checked === false ? '$\\square$ ' : '';
      return `\\item ${guard(box + li.children.map(block).join('\n\n'))}`;
    });
    if (n.ordered) enumDepth--;
    return `\\begin{${env}}\n${pre}${items.join('\n')}\n\\end{${env}}`;
  }

  function table(n: Table): string {
    const cols = Math.max(...n.children.map((r) => r.children.length), 1);
    const spec = Array.from({ length: cols }, (_, i) => ({ center: 'c', right: 'r' } as Record<string, string>)[n.align?.[i] ?? ''] ?? 'l').join('');
    inCell = true;
    const rows = n.children.map((r, i) => {
      const cells = r.children.map((c) => { const t = inl(c.children); return i === 0 ? `\\textbf{${t}}` : t; });
      return `${guard(cells.join(' & '))} \\\\`;
    });
    inCell = false;
    return `\\begin{longtable}{${spec}}\n\\toprule\n${rows[0]}\n\\midrule\n${rows.slice(1).map((r) => `${r}\n`).join('')}\\bottomrule\n\\end{longtable}`;
  }

  function block(n: RootContent): string {
    switch (n.type) {
      case 'paragraph': return inl(n.children);
      case 'heading': return `\\${['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph'][n.depth - 1]}{${inl(n.children)}}`;
      case 'blockquote': {
        const first = n.children[0];
        const t = first?.type === 'paragraph' ? first.children[0] : undefined;
        const c = t?.type === 'text' ? parseCallout(t.value) : null;
        if (c && t?.type === 'text' && first?.type === 'paragraph') {
          const rest = [{ ...t, value: t.value.slice(c.len) }, ...first.children.slice(1)].filter((x) => x.type !== 'text' || x.value);
          const parts = [`\\textbf{${CALLOUTS[c.kind]}}`, ...(rest.length ? [inl(rest)] : []), ...n.children.slice(1).map(block)];
          return `\\begin{quote}\n${parts.join('\n\n')}\n\\end{quote}`;
        }
        return `\\begin{quote}\n${n.children.map(block).join('\n\n')}\n\\end{quote}`;
      }
      case 'list': return list(n);
      case 'code': {
        if (n.lang === 'mermaid') mermaids++;
        const v = n.value.split('\\end{verbatim}').join('\\end{verbatim}\n\\texttt{\\textbackslash{}end\\{verbatim\\}}\n\\begin{verbatim}\n');
        return `\\begin{verbatim}\n${v}\n\\end{verbatim}`;
      }
      case 'math': return `\\[\n${n.value.replace(/\n\s*\n/g, '\n')}\n\\]`;
      case 'thematicBreak': return '\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par';
      case 'table': return table(n);
      case 'html': htmls++; return '';
      case 'definition': case 'footnoteDefinition': return '';
      default: return 'children' in n ? (n.children as RootContent[]).map(block).join('\n\n') : '';
    }
  }

  const main = tree.children.map(block).filter(Boolean).join('\n\n');
  const meta = new Map((fm?.rows ?? []).map(([k, v]) => [k.toLowerCase(), v]));
  const fmTitle = meta.get('title');
  const head = fmTitle
    ? `\\title{${escapeTex(fmTitle)}}\n\\author{${escapeTex(meta.get('author') ?? '')}}\n\\date{${escapeTex(meta.get('date') ?? '')}}\n`
    : '';
  const pdfTitle = fmTitle ?? opts.title;
  const notes: string[] = [];
  if (images) notes.push(`${plural(images, 'image')} replaced by alt text`);
  if (mermaids) notes.push(`${plural(mermaids, 'Mermaid diagram')} left as code`);
  if (htmls) notes.push(`${plural(htmls, 'raw HTML fragment')} dropped (raw HTML dropped)`);

  const tex = `% Generated by mdprev. Not supported: images (alt text only), Mermaid diagrams (kept as code), raw HTML (dropped).
${PREAMBLE}
${pdfTitle ? `\\hypersetup{pdftitle={${escapeTex(pdfTitle)}}}\n` : ''}${head}\\begin{document}
${fmTitle ? '\\maketitle\n\n' : ''}${main}
\\end{document}
`;
  return { tex, notes };
}
