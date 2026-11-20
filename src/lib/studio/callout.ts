/** Callout kiểu GitHub: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` ở đầu blockquote. */
import { visit } from 'unist-util-visit';
import type { Blockquote, Root } from 'mdast';

export const CALLOUTS = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' } as const;
export type CalloutKind = keyof typeof CALLOUTS;

/** Đọc dấu `[!KIND]` ở đầu đoạn; trả về loại và số ký tự cần cắt (gồm cả xuống dòng ngay sau dấu). */
export function parseCallout(text: string): { kind: CalloutKind; len: number } | null {
  const m = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n)?/i.exec(text);
  return m ? { kind: m[1]!.toLowerCase() as CalloutKind, len: m[0].length } : null;
}

export function remarkCallout() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const p = node.children[0];
      if (p?.type !== 'paragraph') return;
      const t = p.children[0];
      if (t?.type !== 'text') return;
      const c = parseCallout(t.value);
      if (!c) return;
      t.value = t.value.slice(c.len);
      if (!t.value) p.children.shift();
      if (p.children.length === 0) node.children.shift();
      const line = node.position?.start.line;
      node.data = { hName: 'div', hProperties: { className: ['callout', `callout-${c.kind}`], ...(line ? { 'data-line': line } : {}) } } as Blockquote['data'];
      node.children.unshift({ type: 'paragraph', children: [{ type: 'text', value: CALLOUTS[c.kind] }], data: { hProperties: { className: ['callout-t'] } } as never });
    });
  };
}
