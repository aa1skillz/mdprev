/**
 * Dựng công thức bằng KaTeX trong cây hast (remark-math sinh `code.language-math`).
 * Không dùng rehype-katex vì nó parse HTML bằng DOMParser ở bản browser, mà pipeline chạy trong Web Worker.
 * Công thức lỗi hiện nguyên văn (class `katex-error`) thay vì làm hỏng cả trang.
 */
import { fromHtml } from 'hast-util-from-html';
import katex from 'katex';
import { visit } from 'unist-util-visit';
import type { Element, ElementContent, Root } from 'hast';

const textOf = (n: ElementContent): string => (n.type === 'text' ? n.value : n.type === 'element' ? n.children.map(textOf).join('') : '');
const classes = (n: Element): string[] => (n.properties?.['className'] as string[] | undefined) ?? [];
const mathCode = (n: ElementContent | undefined): n is Element => !!n && n.type === 'element' && n.tagName === 'code' && classes(n).includes('language-math');

function render(code: Element, display: boolean): ElementContent[] {
  const tex = textOf(code);
  let html: string;
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'htmlAndMathml', trust: false });
  } catch (err) {
    const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const why = String((err as Error)?.message ?? 'invalid formula').replace(/^KaTeX parse error:\s*/, '').split('\n')[0]!.slice(0, 140);
    html = `<span class="katex-error" title="Formula error: ${esc(why)}">${esc(tex)}</span>`;
  }
  const kids = fromHtml(html, { fragment: true }).children as ElementContent[];
  // công thức khối có thể rộng hơn cột: cho focus được để người dùng bàn phím cuộn ngang (axe: scrollable-region-focusable), lúc CSS KaTeX nạp xong mới biết có tràn hay không
  if (display) for (const k of kids) if (k.type === 'element' && Array.isArray(k.properties?.['className']) && (k.properties['className'] as string[]).includes('katex-display')) k.properties['tabIndex'] = 0;
  return kids;
}

export function rehypeMath() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (!parent || typeof index !== 'number') return undefined;
      // khối: <pre><code class="language-math math-display"> (cả fence ```math)
      if (node.tagName === 'pre' && node.children.length === 1 && mathCode(node.children[0])) {
        const out = render(node.children[0], true);
        parent.children.splice(index, 1, ...out);
        return index + out.length;
      }
      // dòng: <code class="language-math math-inline">
      if (mathCode(node)) {
        const out = render(node, classes(node).includes('math-display'));
        parent.children.splice(index, 1, ...out);
        return index + out.length;
      }
      return undefined;
    });
  };
}
