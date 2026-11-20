/** Biến đổi văn bản trong ô soạn: hàm thuần nhận (text, vùng chọn) trả sửa đổi mới, hoặc lỗi để báo người dùng. */
import type { Edit } from './edit';

export type TransformId =
  | 'upper' | 'lower' | 'title' | 'sort' | 'sort-desc' | 'unique' | 'reverse' | 'join'
  | 'wrap-72' | 'wrap-80' | 'wrap-100' | 'unwrap' | 'quotes-curly' | 'quotes-straight' | 'trim';

export interface TransformDef { id: TransformId; label: string; hint: string }
export const TRANSFORMS: TransformDef[] = [
  { id: 'upper', label: 'UPPERCASE', hint: 'selection or current line' },
  { id: 'lower', label: 'lowercase', hint: 'selection or current line' },
  { id: 'title', label: 'Title Case', hint: 'selection or current line' },
  { id: 'sort', label: 'Sort lines A→Z', hint: 'select the lines' },
  { id: 'sort-desc', label: 'Sort lines Z→A', hint: 'select the lines' },
  { id: 'unique', label: 'Remove duplicate lines', hint: 'select the lines' },
  { id: 'reverse', label: 'Reverse lines', hint: 'select the lines' },
  { id: 'join', label: 'Join lines into one', hint: 'select the lines' },
  { id: 'wrap-72', label: 'Wrap at 72 columns', hint: 'selection or paragraph' },
  { id: 'wrap-80', label: 'Wrap at 80 columns', hint: 'selection or paragraph' },
  { id: 'wrap-100', label: 'Wrap at 100 columns', hint: 'selection or paragraph' },
  { id: 'unwrap', label: 'Unwrap paragraphs', hint: 'selection or paragraph' },
  { id: 'quotes-curly', label: 'Curly quotes', hint: 'selection or document, skips code' },
  { id: 'quotes-straight', label: 'Straight quotes', hint: 'selection or document' },
  { id: 'trim', label: 'Trim trailing spaces', hint: 'selection or document' },
];

const FENCE = /^\s*(```|~~~)/;
const LIST = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;
const cp = (s: string) => [...s].length;

/** Mở rộng vùng chọn ra cả dòng. Vùng chọn kết thúc ngay sau `\n` thì không tính dòng trống kế tiếp. */
function lineRange(text: string, s: number, e: number): [number, number] {
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  const base = e > s && text[e - 1] === '\n' ? e - 1 : e;
  const nl = text.indexOf('\n', base);
  return [ls, nl === -1 ? text.length : nl];
}
/** Đoạn (khối dòng không trống) chứa vị trí s. */
function paragraphRange(text: string, s: number): [number, number] {
  const lines = text.split('\n');
  let off = 0, row = 0;
  for (; row < lines.length; row++) { if (s <= off + (lines[row] ?? '').length) break; off += (lines[row] ?? '').length + 1; }
  const blank = (i: number) => (lines[i] ?? '').trim() === '';
  let a = Math.min(row, lines.length - 1), b = a;
  if (blank(a)) return [off, off + (lines[a] ?? '').length];
  while (a > 0 && !blank(a - 1)) a--;
  while (b < lines.length - 1 && !blank(b + 1)) b++;
  const start = lines.slice(0, a).reduce((n, l) => n + l.length + 1, 0);
  return [start, start + lines.slice(a, b + 1).join('\n').length];
}

const titleCase = (s: string) => s.toLocaleLowerCase('vi').replace(/(^|[\s([{"'“‘—-])(\p{L})/gu, (_m, pre: string, c: string) => pre + c.toLocaleUpperCase('vi'));

/** Chia dòng thành khối: mục danh sách, trích dẫn, đoạn thường. Khối code, bảng, heading, hr giữ nguyên. */
interface Block { raw: string[]; keep: boolean }
function blocks(rows: string[]): Block[] {
  const out: Block[] = [];
  let fence = false;
  const isKeep = (l: string) => /^\s*\|/.test(l) || /^#{1,6}\s/.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) || /^\s*<[A-Za-z!/]/.test(l);
  for (const l of rows) {
    if (FENCE.test(l)) { fence = !fence; out.push({ raw: [l], keep: true }); continue; }
    const last = out[out.length - 1];
    if (fence) { out.push({ raw: [l], keep: true }); continue; }
    if (l.trim() === '') { out.push({ raw: [l], keep: true }); continue; }
    if (isKeep(l)) { out.push({ raw: [l], keep: true }); continue; }
    const startsItem = LIST.test(l);
    const quote = /^\s*>/.test(l);
    const lastQuote = last && !last.keep && /^\s*>/.test(last.raw[0] ?? '');
    if (last && !last.keep && !startsItem && (quote === !!lastQuote)) last.raw.push(l);
    else out.push({ raw: [l], keep: false });
  }
  return out;
}

function prefixOf(first: string): { prefix: string; cont: string } {
  const q = /^(\s*(?:>\s?)+)/.exec(first);
  if (q) return { prefix: q[1] ?? '', cont: q[1] ?? '' };
  const m = LIST.exec(first);
  if (m) return { prefix: m[0], cont: ' '.repeat(cp(m[0])) };
  const ind = /^\s*/.exec(first)?.[0] ?? '';
  return { prefix: ind, cont: ind };
}
const bodyOf = (block: string[], prefix: string): string[] => block.map((l, i) => (i === 0 ? l.slice(prefix.length) : l.replace(/^(\s*(?:>\s?)+)/, '').trim())).map((l) => l.trim());

function wrapBlock(block: string[], width: number): string[] {
  const { prefix, cont } = prefixOf(block[0] ?? '');
  const words = bodyOf(block, prefix).join(' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = prefix;
  let curLen = cp(prefix);
  let has = false;
  for (const w of words) {
    const add = (has ? 1 : 0) + cp(w);
    if (has && curLen + add > width) { out.push(cur); cur = cont + w; curLen = cp(cont) + cp(w); }
    else { cur += (has ? ' ' : '') + w; curLen += add; }
    has = true;
  }
  out.push(cur);
  return out;
}
function unwrapBlock(block: string[]): string[] {
  const { prefix } = prefixOf(block[0] ?? '');
  return [prefix + bodyOf(block, prefix).join(' ').replace(/\s+/g, ' ').trim()];
}
const reflow = (rows: string[], f: (b: string[]) => string[]) => blocks(rows).flatMap((b) => (b.keep || b.raw.length === 0 ? b.raw : f(b.raw)));

/** Dấu nháy: bỏ qua code inline và khối code. */
function quotes(rows: string[], curly: boolean): string[] {
  let fence = false;
  return rows.map((l) => {
    if (FENCE.test(l)) { fence = !fence; return l; }
    if (fence) return l;
    return l.split(/(`[^`]*`)/).map((part, i) => {
      if (i % 2) return part;
      if (!curly) return part.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      return part
        .replace(/(^|[\s([{—-])"/g, '$1“').replace(/"/g, '”')
        .replace(/(^|[\s([{—-])'/g, '$1‘').replace(/'/g, '’');
    }).join('');
  });
}

export function applyTransform(text: string, s: number, e: number, id: TransformId): Edit | { error: string } {
  const sel = s !== e;
  const lineLevel = ['sort', 'sort-desc', 'unique', 'reverse', 'join'].includes(id);
  if (lineLevel && !sel) return { error: 'SELECT THE LINES FIRST' };
  let from: number, to: number;
  if (id === 'wrap-72' || id === 'wrap-80' || id === 'wrap-100' || id === 'unwrap') [from, to] = sel ? lineRange(text, s, e) : paragraphRange(text, s);
  else if (id === 'quotes-curly' || id === 'quotes-straight' || id === 'trim') [from, to] = sel ? lineRange(text, s, e) : [0, text.length];
  else if (lineLevel) [from, to] = lineRange(text, s, e);
  else [from, to] = sel ? [s, e] : lineRange(text, s, e); // đổi chữ: vùng chọn nguyên văn, hoặc cả dòng hiện tại
  const chunk = text.slice(from, to);
  const rows = chunk.split('\n');
  let out: string;
  switch (id) {
    case 'upper': out = chunk.toLocaleUpperCase('vi'); break;
    case 'lower': out = chunk.toLocaleLowerCase('vi'); break;
    case 'title': out = titleCase(chunk); break;
    case 'sort': case 'sort-desc': { const k = [...rows].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)); out = (id === 'sort' ? k : k.reverse()).join('\n'); break; }
    case 'unique': out = [...new Set(rows)].join('\n'); break;
    case 'reverse': out = [...rows].reverse().join('\n'); break;
    case 'join': out = rows.map((r) => r.trim()).filter(Boolean).join(' '); break;
    case 'wrap-72': out = reflow(rows, (b) => wrapBlock(b, 72)).join('\n'); break;
    case 'wrap-80': out = reflow(rows, (b) => wrapBlock(b, 80)).join('\n'); break;
    case 'wrap-100': out = reflow(rows, (b) => wrapBlock(b, 100)).join('\n'); break;
    case 'unwrap': out = reflow(rows, unwrapBlock).join('\n'); break;
    case 'quotes-curly': out = quotes(rows, true).join('\n'); break;
    case 'quotes-straight': out = quotes(rows, false).join('\n'); break;
    case 'trim': out = rows.map((r) => r.replace(/[ \t]+$/, '')).join('\n'); break;
  }
  if (out === chunk) return { error: 'NOTHING TO CHANGE' };
  return { text: text.slice(0, from) + out + text.slice(to), start: from, end: from + out.length };
}
