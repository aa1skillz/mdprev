/**
 * Gợi ý khi gõ link: `](#` → tiêu đề, `[^` → chú thích đã định nghĩa, `![…](` → ảnh đã dán.
 * Hàm thuần: tìm ngữ cảnh tại con trỏ, lọc mục, tính văn bản sau khi chọn.
 */
import type { Edit } from './edit';
import { nrm } from '../tags';

export type CompKind = 'anchor' | 'footnote' | 'image';
export interface CompAt { kind: CompKind; start: number; q: string; altStart?: number; altEnd?: number }
export interface CompItem { id: string; label: string; hint: string; insert: string; alt?: string }

/** Con trỏ có nằm trong khối code (```/~~~) hay trong `code` dòng không. */
function inCode(text: string, pos: number): boolean {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  let fence = '';
  for (const l of text.slice(0, ls).split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; }
    else if (f) fence = f[1] ?? '';
  }
  if (fence) return true;
  return ((text.slice(ls, pos).match(/`/g) ?? []).length % 2) === 1;
}

/** Ngữ cảnh gợi ý tại `pos` (chỉ khi không bôi đen), hoặc null. */
export function completionAt(text: string, pos: number): CompAt | null {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const before = text.slice(ls, pos);
  let m: RegExpExecArray | null;
  if ((m = /!\[([^\]\n]*)\]\(([^\s)]*)$/.exec(before))) {
    if (inCode(text, pos)) return null;
    const altStart = ls + m.index + 2;
    return { kind: 'image', start: pos - (m[2] ?? '').length, q: m[2] ?? '', altStart, altEnd: altStart + (m[1] ?? '').length };
  }
  if ((m = /\]\(#([^\s)#]*)$/.exec(before))) {
    if (inCode(text, pos)) return null;
    return { kind: 'anchor', start: pos - (m[1] ?? '').length, q: m[1] ?? '' };
  }
  if ((m = /(\S)\[\^([^\]\s]*)$/.exec(before))) { // tham chiếu chú thích ngay sau chữ; `[^x]:` đầu dòng là định nghĩa, không gợi ý
    if (inCode(text, pos)) return null;
    return { kind: 'footnote', start: pos - (m[2] ?? '').length, q: m[2] ?? '' };
  }
  return null;
}

/** Chú thích đã định nghĩa: nhãn và đoạn đầu của nội dung. */
export function footnotesOf(text: string): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  for (const m of text.matchAll(/^\s{0,3}\[\^([^\]]+)\]:[ \t]*(.*)$/gm)) out.push({ label: m[1] ?? '', text: (m[2] ?? '').trim() });
  return out;
}

const match = (q: string, ...hay: string[]) => { const k = nrm(q.trim()); return !k || hay.some((h) => nrm(h).includes(k)); };
const short = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Mục gợi ý theo ngữ cảnh. Tiêu đề lấy đúng id mà bản xem đã dựng, nên link chọn từ đây luôn trỏ đúng. */
export function completionItems(at: CompAt, ctx: { heads: { id: string; text: string; level: number }[]; text: string; assets: { id: string; name: string }[] }): CompItem[] {
  if (at.kind === 'anchor') return ctx.heads.filter((h) => match(at.q, h.id, h.text)).slice(0, 50)
    .map((h) => ({ id: h.id, label: (h.level > 1 ? '  '.repeat(Math.min(h.level, 4) - 1) : '') + h.text, hint: 'h' + h.level, insert: h.id }));
  if (at.kind === 'footnote') return footnotesOf(ctx.text).filter((f) => match(at.q, f.label, f.text))
    .map((f) => ({ id: f.label, label: '^' + f.label, hint: short(f.text), insert: f.label }));
  return ctx.assets.filter((a) => match(at.q, a.name, a.id)).slice(0, 50)
    .map((a) => ({ id: a.id, label: a.name || a.id, hint: 'pasted image', insert: 'asset:' + a.id, alt: a.name }));
}

/** Chèn mục đã chọn, thêm dấu đóng (`)` hoặc `]`) nếu sau con trỏ chưa có; ảnh chưa có chữ thay thế thì điền từ tên file. */
export function applyCompletion(text: string, at: CompAt, pos: number, item: CompItem, altOf: (name: string) => string = (n) => n): Edit {
  const close = at.kind === 'footnote' ? ']' : ')';
  const after = text.slice(pos);
  const tail = after.startsWith(close) ? '' : close;
  let head = text.slice(0, at.start);
  let shift = 0;
  if (at.kind === 'image' && at.altStart !== undefined && at.altEnd === at.altStart && item.alt) {
    const alt = altOf(item.alt);
    head = text.slice(0, at.altStart) + alt + text.slice(at.altStart, at.start);
    shift = alt.length;
  }
  const out = head + item.insert + tail + after;
  const caret = at.start + shift + item.insert.length + 1; // sau dấu đóng (có sẵn hay vừa thêm)
  return { text: out, start: caret, end: caret };
}
