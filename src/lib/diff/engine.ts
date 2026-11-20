/**
 * So sánh hai văn bản theo dòng (rồi theo từ trong các dòng đã sửa). Kết quả là các khối dạng khoảng chỉ số, không chứa chữ,
 * nên gửi qua worker rất nhẹ; chữ lấy lại từ hai mảng dòng ở phía giao diện.
 */
import { myers } from '../studio/diff';

export interface DiffOpts { ignoreSpace: boolean; ignoreCase: boolean }
/** `eq`: n dòng giống nhau bắt đầu từ a (bên A) và b (bên B). `chg`: an dòng A bị thay bằng bn dòng B (an hoặc bn có thể bằng 0). */
export type Block = { k: 'eq'; a: number; b: number; n: number } | { k: 'chg'; a: number; an: number; b: number; bn: number };
export interface DiffResult { blocks: Block[]; added: number; removed: number; hunks: number; truncated: boolean }
export interface Seg { t: string; w: boolean }

/** Tách dòng; một dấu xuống dòng cuối không sinh thêm dòng rỗng. */
export function splitLines(s: string): string[] {
  if (s === '') return [];
  const l = s.replace(/\r\n/g, '\n').split('\n');
  if (l[l.length - 1] === '') l.pop();
  return l;
}

const key = (o: DiffOpts) => (l: string) => { let k = l; if (o.ignoreSpace) k = k.replace(/\s+/g, ' ').trim(); if (o.ignoreCase) k = k.toLowerCase(); return k; };

export function diffBlocks(a: string[], b: string[], o: DiffOpts): DiffResult {
  const k = key(o);
  const ops = myers(a.map(k), b.map(k));
  const blocks: Block[] = [];
  let added = 0, removed = 0, hunks = 0;
  if (!ops) { // quá nhiều khác biệt: không so chi tiết, coi như thay toàn bộ (báo `truncated`)
    if (a.length || b.length) { blocks.push({ k: 'chg', a: 0, an: a.length, b: 0, bn: b.length }); hunks = 1; }
    return { blocks, added: b.length, removed: a.length, hunks, truncated: true };
  }
  let ai = 0, bj = 0, eq = 0, ea = 0, eb = 0, da = 0, db = 0;
  const flushEq = () => { if (eq) { blocks.push({ k: 'eq', a: ea, b: eb, n: eq }); eq = 0; } };
  const flushChg = () => { if (da || db) { blocks.push({ k: 'chg', a: ai - da, an: da, b: bj - db, bn: db }); removed += da; added += db; hunks++; da = db = 0; } };
  for (const op of ops) {
    if (op === 0) { flushChg(); if (!eq) { ea = ai; eb = bj; } eq++; ai++; bj++; }
    else { flushEq(); if (op < 0) { da++; ai++; } else { db++; bj++; } }
  }
  flushEq(); flushChg();
  return { blocks, added, removed, hunks, truncated: false };
}

// ---- theo từ ----
const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const MAX_WORD_CHARS = 4000;

/** So hai dòng theo từ: các đoạn đổi được đánh dấu `w`. Dòng quá dài thì coi như đổi cả dòng. */
export function wordDiff(a: string, b: string): { a: Seg[]; b: Seg[] } {
  const whole = () => ({ a: a ? [{ t: a, w: true }] : [], b: b ? [{ t: b, w: true }] : [] });
  if (a.length > MAX_WORD_CHARS || b.length > MAX_WORD_CHARS) return whole();
  const ta = a.match(TOKEN) ?? [], tb = b.match(TOKEN) ?? [];
  const ops = myers(ta, tb);
  if (!ops) return whole();
  const sa: Seg[] = [], sb: Seg[] = [];
  const push = (arr: Seg[], t: string, w: boolean) => { const last = arr[arr.length - 1]; if (last && last.w === w) last.t += t; else arr.push({ t, w }); };
  let i = 0, j = 0;
  for (const op of ops) {
    if (op === 0) { push(sa, ta[i]!, false); push(sb, tb[j]!, false); i++; j++; }
    else if (op < 0) { push(sa, ta[i]!, true); i++; }
    else { push(sb, tb[j]!, true); j++; }
  }
  return { a: mergeGaps(sa), b: mergeGaps(sb) };
}

/** Hai đoạn đổi chỉ cách nhau bởi khoảng trắng thì gộp thành một đoạn (dễ đọc hơn "thế" + " " + "giới"). */
function mergeGaps(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const prev = out[out.length - 1];
    if (!s.w && /^\s+$/.test(s.t) && prev?.w && segs[i + 1]?.w) { prev.t += s.t + segs[i + 1]!.t; i++; continue; }
    if (prev && prev.w === s.w) prev.t += s.t; else out.push({ ...s });
  }
  return out;
}

// ---- hiển thị ----
export type ViewRow =
  | { t: 'eq'; a: number; b: number }
  | { t: 'del'; a: number; pair?: number }
  | { t: 'add'; b: number; pair?: number }
  | { t: 'gap'; id: number; n: number };

/** Kiểu thống nhất: mỗi khối đổi in hết dòng `-` rồi hết dòng `+`; dòng giống nhau xa chỗ đổi gập lại (`context` dòng quanh chỗ đổi). `expanded` là các khối eq được mở. */
export function unifiedRows(blocks: Block[], context: number, expanded: ReadonlySet<number>): ViewRow[] {
  const out: ViewRow[] = [];
  blocks.forEach((bl, idx) => {
    if (bl.k === 'chg') {
      for (let i = 0; i < bl.an; i++) out.push({ t: 'del', a: bl.a + i, ...(i < bl.bn ? { pair: bl.b + i } : {}) });
      for (let i = 0; i < bl.bn; i++) out.push({ t: 'add', b: bl.b + i, ...(i < bl.an ? { pair: bl.a + i } : {}) });
      return;
    }
    const first = idx === 0, last = idx === blocks.length - 1;
    const head = first ? 0 : context, tail = last ? 0 : context;
    const emit = (from: number, to: number) => { for (let i = from; i < to; i++) out.push({ t: 'eq', a: bl.a + i, b: bl.b + i }); };
    if (expanded.has(idx) || bl.n <= head + tail + 1 || context >= 1e6) { emit(0, bl.n); return; }
    emit(0, head);
    out.push({ t: 'gap', id: idx, n: bl.n - head - tail });
    emit(bl.n - tail, bl.n);
  });
  return out;
}

export type SplitRow = { t: 'eq'; a: number; b: number } | { t: 'chg'; a?: number; b?: number } | { t: 'gap'; id: number; n: number };
/** Kiểu hai cột: dòng bị thay đứng cạnh dòng thay thế. */
export function splitRows(blocks: Block[], context: number, expanded: ReadonlySet<number>): SplitRow[] {
  const out: SplitRow[] = [];
  blocks.forEach((bl, idx) => {
    if (bl.k === 'chg') {
      const n = Math.max(bl.an, bl.bn);
      for (let i = 0; i < n; i++) out.push({ t: 'chg', ...(i < bl.an ? { a: bl.a + i } : {}), ...(i < bl.bn ? { b: bl.b + i } : {}) });
      return;
    }
    const first = idx === 0, last = idx === blocks.length - 1;
    const head = first ? 0 : context, tail = last ? 0 : context;
    const emit = (from: number, to: number) => { for (let i = from; i < to; i++) out.push({ t: 'eq', a: bl.a + i, b: bl.b + i }); };
    if (expanded.has(idx) || bl.n <= head + tail + 1 || context >= 1e6) { emit(0, bl.n); return; }
    emit(0, head);
    out.push({ t: 'gap', id: idx, n: bl.n - head - tail });
    emit(bl.n - tail, bl.n);
  });
  return out;
}

/** Bản vá chuẩn `diff -u` (3 dòng ngữ cảnh). Dùng được với `patch` và `git apply`. */
export function makePatch(a: string[], b: string[], blocks: Block[], names: [string, string] = ['a', 'b'], context = 3): string {
  if (!blocks.some((x) => x.k === 'chg')) return '';
  type Line = { c: ' ' | '-' | '+'; t: string };
  const lines: { ai: number; bi: number; l: Line }[] = [];
  for (const bl of blocks) {
    if (bl.k === 'eq') for (let i = 0; i < bl.n; i++) lines.push({ ai: bl.a + i, bi: bl.b + i, l: { c: ' ', t: a[bl.a + i]! } });
    else { for (let i = 0; i < bl.an; i++) lines.push({ ai: bl.a + i, bi: bl.b, l: { c: '-', t: a[bl.a + i]! } }); for (let i = 0; i < bl.bn; i++) lines.push({ ai: bl.a + bl.an, bi: bl.b + i, l: { c: '+', t: b[bl.b + i]! } }); }
  }
  // gom thành hunk: các dòng đổi cùng `context` dòng quanh chúng, gộp hai hunk nếu ngữ cảnh chạm nhau
  const changed = lines.map((x, i) => (x.l.c !== ' ' ? i : -1)).filter((i) => i >= 0);
  const out: string[] = [`--- ${names[0]}`, `+++ ${names[1]}`];
  let s = 0;
  while (s < changed.length) {
    let e = s;
    while (e + 1 < changed.length && changed[e + 1]! - changed[e]! <= 2 * context + 1) e++;
    const from = Math.max(0, changed[s]! - context), to = Math.min(lines.length, changed[e]! + context + 1);
    const seg = lines.slice(from, to);
    const aStart = seg.find((x) => x.l.c !== '+')?.ai ?? seg[0]!.ai, bStart = seg.find((x) => x.l.c !== '-')?.bi ?? seg[0]!.bi;
    const an = seg.filter((x) => x.l.c !== '+').length, bn = seg.filter((x) => x.l.c !== '-').length;
    out.push(`@@ -${an ? aStart + 1 : aStart},${an} +${bn ? bStart + 1 : bStart},${bn} @@`);
    for (const x of seg) out.push(x.l.c + x.l.t);
    s = e + 1;
  }
  return out.join('\n') + '\n';
}
