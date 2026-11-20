/** Tìm và thay thế: hàm thuần, dùng cho thanh Find của /app/. */
export interface Match { index: number; length: number; groups: string[] }
export interface FindOpts { regex: boolean; caseSensitive: boolean }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findAll(text: string, q: string, o: FindOpts, limit = 5000): { matches: Match[]; error?: string } {
  if (!q) return { matches: [] };
  let re: RegExp;
  try { re = new RegExp(o.regex ? q : escapeRe(q), 'gm' + (o.caseSensitive ? '' : 'i')); } catch (e) { return { matches: [], error: (e as Error).message.replace(/^Invalid regular expression: /, '') }; }
  const out: Match[] = [];
  for (const m of text.matchAll(re)) {
    if (m[0].length === 0) continue; // khớp rỗng (ví dụ `^`, `a*`) không có gì để chọn hay thay
    out.push({ index: m.index ?? 0, length: m[0].length, groups: [...m].slice(1).map((g) => g ?? '') });
    if (out.length >= limit) break;
  }
  return { matches: out };
}

/** Chuỗi thay thế: ở chế độ regex hiểu $& và $1..$9, $$; ngược lại là chữ nguyên văn. */
export function expand(repl: string, text: string, m: Match, regex: boolean): string {
  if (!regex) return repl;
  return repl.replace(/\$(\$|&|\d{1,2})/g, (_x, k: string) => (k === '$' ? '$' : k === '&' ? text.slice(m.index, m.index + m.length) : (m.groups[Number(k) - 1] ?? '')));
}

export function replaceOne(text: string, m: Match, repl: string, regex: boolean): { text: string; start: number; end: number } {
  const r = expand(repl, text, m, regex);
  return { text: text.slice(0, m.index) + r + text.slice(m.index + m.length), start: m.index, end: m.index + r.length };
}

export function replaceAll(text: string, ms: Match[], repl: string, regex: boolean): string {
  let out = '', last = 0;
  for (const m of ms) { out += text.slice(last, m.index) + expand(repl, text, m, regex); last = m.index + m.length; }
  return out + text.slice(last);
}

/** Vị trí đầu mỗi dòng. */
export function lineStartsOf(text: string): number[] {
  const a = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) a.push(i + 1);
  return a;
}

/** Dòng (0-based) và cột của một vị trí, tìm nhị phân trên `lineStartsOf`. */
export function locate(starts: number[], idx: number): { line: number; col: number } {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((starts[mid] ?? 0) <= idx) lo = mid; else hi = mid - 1; }
  return { line: lo, col: idx - (starts[lo] ?? 0) };
}

/** Các đoạn cần tô cho một kết quả khớp, tách theo dòng (kết quả nhiều dòng thành nhiều đoạn). */
export function segments(starts: number[], text: string, m: Match): { line: number; col: number; len: number }[] {
  const a = locate(starts, m.index), b = locate(starts, m.index + m.length);
  if (a.line === b.line) return [{ line: a.line, col: a.col, len: m.length }];
  const out: { line: number; col: number; len: number }[] = [];
  for (let l = a.line; l <= b.line; l++) {
    const s = l === a.line ? a.col : 0;
    const e = l === b.line ? b.col : (starts[l + 1] ?? text.length + 1) - (starts[l] ?? 0) - 1;
    if (e > s) out.push({ line: l, col: s, len: e - s });
  }
  return out;
}
