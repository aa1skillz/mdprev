/**
 * Markdown -> HTML sạch cho trang /app/: GFM + Shiki (theme biến CSS của blog).
 * Mỗi khối có `data-line` (số dòng trong ô soạn) để click bản xem nhảy về nguồn, heading có `id` cho outline.
 * HTML thô trong Markdown bị bỏ; link chỉ cho http, https, mailto và đường dẫn tương đối (ảnh thêm `asset:` của studio).
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Element, ElementContent, Root } from 'hast';
import { highlightBlocks } from './shiki';
import { idMaker } from './slug';
import { remarkCallout } from './callout';
import type { VaultCtx } from '../vault/preview';

export interface FrontMatter { rows: [string, string][]; raw: string }

/** Icon nét (lưới 24) cho nút chép của khối code; hai icon chép/đã chép đổi chỗ bằng CSS theo data-done. */
const icon = (cls: string, d: string): Element => ({ type: 'element', tagName: 'svg', properties: { className: ['cb-ic', cls], viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round', ariaHidden: 'true', focusable: 'false' }, children: [{ type: 'element', tagName: 'path', properties: { d }, children: [] }] });
/** Phần front matter ở đầu văn bản (chưa đọc YAML). `body` giữ nguyên số dòng (front matter thay bằng dòng trống) để `data-line` khớp ô soạn. */
export function cutFrontMatter(src: string): { raw: string | null; body: string } {
  const m = FM_RE.exec(src);
  if (!m) return { raw: null, body: src };
  return { raw: m[1] ?? '', body: '\n'.repeat(m[0].split('\n').length - 1) + src.slice(m[0].length) };
}
export const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const textOf = (n: ElementContent): string => (n.type === 'text' ? n.value : n.type === 'element' ? n.children.map(textOf).join('') : '');

/** Thu thập khối code để tô màu (bất đồng bộ), rồi thay vào cây hast. */
function rehypeShiki() {
  return async (tree: Root) => {
    const jobs: { node: Element; lang: string; code: string }[] = [];
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'pre') return;
      const code = node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
      if (!code) return;
      const cls = (code.properties?.['className'] as string[] | undefined) ?? [];
      const lang = (cls.find((c) => c.startsWith('language-')) ?? 'language-text').slice(9).toLowerCase();
      if (lang === 'mermaid') return;
      jobs.push({ node, lang, code: textOf(code).replace(/\n$/, '') });
    });
    const out = await highlightBlocks(jobs.map((j) => ({ lang: j.lang, code: j.code })));
    jobs.forEach((j, i) => { const h = out[i]; if (h) { j.node.properties = { ...h.properties, 'data-lang': j.lang }; j.node.children = h.children; } });
  };
}

const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'table', 'tr', 'hr', 'pre']);

/** id cho heading, `data-line` cho khối, khung + nút Copy cho khối code. */
function rehypeDoc() {
  return (tree: Root) => {
    const nextId = idMaker();
    visit(tree, 'element', (node: Element, index, parent) => {
      const line = node.position?.start.line;
      if (BLOCKS.has(node.tagName) && line) node.properties = { ...node.properties, 'data-line': line };
      if (/^h[1-6]$/.test(node.tagName) && line) { // heading trong khối nhúng của vault không có vị trí nguồn: không cấp id (Outline và id của tài liệu không lệch)
        node.properties = { ...node.properties, id: nextId(textOf(node)) };
      }
      // checkbox của task list cần tên truy cập: lấy chữ của mục
      if (node.tagName === 'input' && node.properties?.['type'] === 'checkbox' && parent && 'children' in parent) {
        node.properties = { ...node.properties, ariaLabel: textOf(parent as Element).trim() || 'Task' };
      }
      if (node.tagName === 'pre' && parent && typeof index === 'number') {
        const codeEl = node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
        const isMermaid = ((codeEl?.properties?.['className'] as string[] | undefined) ?? []).includes('language-mermaid');
        const lang = isMermaid ? 'mermaid' : String(node.properties?.['data-lang'] ?? 'text');
        const wrap: Element = {
          type: 'element', tagName: 'div', properties: { className: ['cb'], 'data-line': line ?? 0, ...(isMermaid ? { 'data-mermaid': '' } : {}) }, children: [
            { type: 'element', tagName: 'div', properties: { className: ['cb-h'] }, children: [
              { type: 'element', tagName: 'span', properties: {}, children: [{ type: 'text', value: lang.toUpperCase() }] },
              { type: 'element', tagName: 'button', properties: { type: 'button', className: ['cb-copy'], 'data-copy': '', ariaLabel: 'Copy code', title: 'Copy code' }, children: [icon('cb-ic-copy', 'M9 9h11v11H9zM5 15V5a1 1 0 0 1 1-1h10'), icon('cb-ic-ok', 'm4 12.5 5 5L20 6.5')] },
            ] },
            node,
          ],
        };
        delete node.properties!['data-line'];
        delete node.properties!['data-lang'];
        parent.children[index] = wrap;
        return 'skip';
      }
      return undefined;
    });
  };
}

/** Chỉ cho http, https, mailto và đường dẫn tương đối. Bỏ ký tự điều khiển trước khi xét (trình duyệt cũng bỏ chúng khi đọc URL). */
function rehypeSafeUrls() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      for (const k of ['href', 'src'] as const) {
        const v = node.properties?.[k];
        if (typeof v !== 'string') continue;
        const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v.replace(/[\u0000- \u007f-\u009f]/g, ''))?.[1]?.toLowerCase();
        // `asset:` chỉ cho ảnh: ảnh dán vào studio, lưu trong IndexedDB, luồng chính đổi thành blob URL
        if (scheme === 'asset' && k === 'src' && node.tagName === 'img' && /^asset:[a-z0-9]+\.[a-z0-9]+$/.test(v)) continue;
        if (scheme && !['http', 'https', 'mailto'].includes(scheme)) node.properties![k] = '#';
      }
    });
  };
}

/**
 * Có công thức thật không? Bỏ khối code và code dòng trước (lệnh shell như `kill $PID` không phải công thức),
 * rồi tìm `$...$` trên một dòng hoặc một khối `$$`. Đoán sai thì chỉ mất công thức, không hỏng trang.
 */
export function hasMath(body: string): boolean {
  if (!body.includes('$')) return false;
  const bare = body.replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\1\2[`~]*[ \t]*(?=\n|$)|$)/gm, '').replace(/`[^`\n]*`/g, '');
  return /\$\$|\$[^$\s][^$\n]*\$/.test(bare);
}

type Proc = { process: (v: string) => Promise<{ toString(): string }> };

/** Math (KaTeX) chỉ được nạp khi tài liệu có công thức, để trang thường không phải tải thư viện. */
const build = async (math: boolean, vault?: { ctx: VaultCtx; src: string }): Promise<Proc> => {
  const p = unified().use(remarkParse).use(remarkGfm).use(remarkCallout);
  if (vault) p.use((await import('../vault/preview')).remarkVault, vault); // chỉ vault mới nạp phần wikilink
  if (math) {
    const [{ default: remarkMath }, { rehypeMath }] = await Promise.all([import('remark-math'), import('./rehype-math')]);
    return p.use(remarkMath).use(remarkRehype).use(rehypeMath)
      .use(rehypeSafeUrls).use(rehypeShiki).use(rehypeDoc).use(rehypeStringify) as unknown as Proc;
  }
  return p.use(remarkRehype).use(rehypeSafeUrls).use(rehypeShiki).use(rehypeDoc).use(rehypeStringify) as unknown as Proc;
};
const procs: { plain?: Promise<Proc>; math?: Promise<Proc> } = {};
/** Lưu lời hứa dựng, nhưng bỏ đi nếu thất bại (mất mạng khi nạp KaTeX không được làm hỏng mọi lần dựng sau đó). */
const getProc = (math: boolean): Promise<Proc> => {
  const k = math ? 'math' : 'plain';
  const cached = procs[k];
  if (cached) return cached;
  const made = build(math);
  procs[k] = made;
  made.catch(() => { if (procs[k] === made) delete procs[k]; });
  return made;
};

export async function renderMarkdown(src: string, vault?: VaultCtx): Promise<{ html: string; fm: FrontMatter | null }> {
  const { raw, body } = cutFrontMatter(src);
  // thư viện YAML (~25 KB gzip) chỉ nạp khi tài liệu có front matter
  const fm = raw === null ? null : (await import('./frontmatter')).fmRows(raw);
  let proc: Proc;
  if (vault) { // bộ dựng của vault mang theo văn bản đang dựng nên không giữ lại
    try { proc = await build(hasMath(body), { ctx: vault, src }); } catch { proc = await build(false, { ctx: vault, src }); }
    return { html: String(await proc.process(body)), fm };
  }
  try { proc = await getProc(hasMath(body)); } catch { proc = await getProc(false); } // không nạp được KaTeX: dựng không công thức
  return { html: String(await proc.process(body)), fm };
}
