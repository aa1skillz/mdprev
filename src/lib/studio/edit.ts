/** Thao tác định dạng Markdown trên văn bản + vùng chọn. Hàm thuần: nhận (text, start, end), trả văn bản mới và vùng chọn mới. */
export interface Edit { text: string; start: number; end: number }

/** Bọc vùng chọn (đậm, nghiêng, gạch ngang, code dòng). Đã bọc sẵn thì gỡ ra. */
export function wrapSel(text: string, s: number, e: number, before: string, after: string, placeholder: string): Edit {
  const sel = text.slice(s, e);
  if (text.slice(s - before.length, s) === before && text.slice(e, e + after.length) === after && s >= before.length) {
    return { text: text.slice(0, s - before.length) + sel + text.slice(e + after.length), start: s - before.length, end: e - before.length };
  }
  if (/\S/.test(sel) && /\n|^\s|\s$/.test(sel)) {
    // vùng chọn có xuống dòng/khoảng trắng ở rìa: dấu bọc phải ôm sát chữ và nằm trong từng dòng (inline không bắc qua dòng)
    const lead = sel.length - sel.trimStart().length;
    const body = sel.trim();
    const out = body.split('\n').map((l) => (/\S/.test(l) ? l.replace(/^(\s*)(.*?)(\s*)$/, (_m, x: string, y: string, z: string) => x + before + y + after + z) : l)).join('\n');
    const st = s + lead;
    return { text: text.slice(0, st) + out + text.slice(s + lead + body.length), start: st, end: st + out.length };
  }
  const inner = sel || placeholder;
  const start = s + before.length;
  return { text: text.slice(0, s) + before + inner + after + text.slice(e), start, end: start + inner.length };
}

export type LineKind = 'h1' | 'h2' | 'h3' | 'quote' | 'ul' | 'ol' | 'task';
const HEAD = /^#{1,6}\s+/;
const RULES: Record<LineKind, { has: (l: string) => boolean; strip: (l: string) => string; add: (l: string, i: number) => string }> = {
  h1: { has: (l) => /^#\s/.test(l), strip: (l) => l.replace(HEAD, ''), add: (l) => '# ' + l.replace(HEAD, '') },
  h2: { has: (l) => /^##\s/.test(l), strip: (l) => l.replace(HEAD, ''), add: (l) => '## ' + l.replace(HEAD, '') },
  h3: { has: (l) => /^###\s/.test(l), strip: (l) => l.replace(HEAD, ''), add: (l) => '### ' + l.replace(HEAD, '') },
  quote: { has: (l) => /^>\s?/.test(l), strip: (l) => l.replace(/^>\s?/, ''), add: (l) => '> ' + l },
  ul: { has: (l) => /^[-*+]\s(?!\[[ xX]\])/.test(l), strip: (l) => l.replace(/^[-*+]\s/, ''), add: (l) => '- ' + l },
  ol: { has: (l) => /^\d+\.\s/.test(l), strip: (l) => l.replace(/^\d+\.\s/, ''), add: (l, i) => `${i + 1}. ` + l },
  task: { has: (l) => /^[-*+]\s\[[ xX]\]\s/.test(l), strip: (l) => l.replace(/^[-*+]\s\[[ xX]\]\s/, ''), add: (l) => '- [ ] ' + l },
};

/** Thêm/bỏ tiền tố cho mọi dòng đang chạm vùng chọn (tiêu đề, trích dẫn, danh sách). Tất cả dòng đã có thì bỏ. */
export function toggleLines(text: string, s: number, e: number, kind: LineKind): Edit {
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  const base = e > s && text[e - 1] === '\n' ? e - 1 : e;
  const nl = text.indexOf('\n', base);
  const le = nl === -1 ? text.length : nl;
  const lines = text.slice(ls, le).split('\n');
  const r = RULES[kind];
  const body = lines.filter((l) => l.trim() !== '');
  const all = body.length > 0 && body.every((l) => r.has(l));
  const isList = kind === 'ul' || kind === 'ol' || kind === 'task';
  // đổi qua lại giữa các kiểu danh sách thì bỏ dấu cũ trước khi thêm dấu mới
  const clean = (l: string) => (isList ? (['task', 'ul', 'ol'] as const).reduce((x, k) => (RULES[k].has(x) ? RULES[k].strip(x) : x), l) : r.has(l) ? r.strip(l) : l);
  let n = 0;
  const out = lines.map((l) => (l.trim() === '' ? l : all ? r.strip(l) : r.add(clean(l), n++))).join('\n');
  return { text: text.slice(0, ls) + out + text.slice(le), start: ls, end: ls + out.length };
}

/** Chèn một khối, bảo đảm cách đoạn trước và sau bằng một dòng trống. `sel` là vùng chọn trong khối. */
function block(text: string, s: number, e: number, content: string, selFrom: number, selLen: number): Edit {
  const before = text.slice(0, s), after = text.slice(e);
  const p1 = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const p2 = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const start = s + p1.length + selFrom;
  return { text: before + p1 + content + p2 + after, start, end: start + selLen };
}

export function codeBlock(text: string, s: number, e: number): Edit {
  const sel = text.slice(s, e);
  return block(text, s, e, '```\n' + sel + '\n```', 4, sel.length);
}

export const TABLE = '| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |';
export function table(text: string, s: number, e: number): Edit {
  const r = block(text, s, e, TABLE, 2, 'Column 1'.length);
  return r;
}

/** Chèn một bảng từ ma trận ô (dán từ spreadsheet). Hàng đầu là tiêu đề. */
export function insertTable(text: string, s: number, e: number, rows: string[][]): Edit {
  const cols = Math.max(...rows.map((r) => r.length));
  const body = rows.map((r) => Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\|/g, '\\|')));
  const md = renderTable([body[0] ?? [], ...(body.length > 1 ? body.slice(1) : [])], true).join('\n');
  const r = block(text, s, e, md, 0, 0);
  return { ...r, start: r.start + md.length, end: r.start + md.length };
}

/** `[chữ](https://)`, chọn sẵn phần URL để gõ đè. */
export function link(text: string, s: number, e: number): Edit {
  const label = text.slice(s, e) || 'text';
  const url = 'https://';
  const start = s + label.length + 3;
  return { text: text.slice(0, s) + `[${label}](${url})` + text.slice(e), start, end: start + url.length };
}

/** `[chữ](url)` từ URL vừa dán lên vùng chọn. */
export function linkTo(text: string, s: number, e: number, url: string): Edit {
  const label = text.slice(s, e);
  const md = `[${label}](${url})`;
  return { text: text.slice(0, s) + md + text.slice(e), start: s + md.length, end: s + md.length };
}

/** Phần khác nhau nhỏ nhất giữa hai chuỗi: thay `a.slice(from, aEnd)` bằng `b.slice(from, bEnd)`. Dùng để áp sửa đổi qua lịch sử undo gốc. */
export function diffSpan(a: string, b: string): { from: number; aEnd: number; bEnd: number } {
  let from = 0;
  const max = Math.min(a.length, b.length);
  while (from < max && a[from] === b[from]) from++;
  let ae = a.length, be = b.length;
  while (ae > from && be > from && a[ae - 1] === b[be - 1]) { ae--; be--; }
  return { from, aEnd: ae, bEnd: be };
}

// ---- Bảng ----
const SEP = /^:?-+:?$/;
const splitRow = (line: string): string[] => {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
};
const width = (s: string) => [...s].length;
const isSepRow = (cells: string[]) => cells.length > 0 && cells.every((c) => SEP.test(c));

/** Dựng bảng căn cột từ ma trận ô. `fresh`: chưa có hàng phân cách, tự thêm sau hàng đầu. */
function renderTable(rows: string[][], fresh = false): string[] {
  const m = fresh ? [rows[0] ?? [], (rows[0] ?? []).map(() => '---'), ...rows.slice(1)] : rows;
  const cols = Math.max(...m.map((r) => r.length));
  const w = Array.from({ length: cols }, (_, c) => Math.max(3, ...m.map((r) => (isSepRow(r) ? 3 : width(r[c] ?? '')))));
  return m.map((r) => {
    const sep = isSepRow(r);
    const cells = Array.from({ length: cols }, (_, c) => {
      const v = r[c] ?? '';
      if (!sep) return v + ' '.repeat(w[c]! - width(v));
      const L = v.startsWith(':'), R = v.endsWith(':') && v.length > 1;
      const dash = w[c]! - (L ? 1 : 0) - (R ? 1 : 0);
      return (L ? ':' : '') + '-'.repeat(dash) + (R ? ':' : '');
    });
    return '| ' + cells.join(' | ') + ' |';
  });
}

interface TableAt { from: number; to: number; lines: string[]; startOffset: number; endOffset: number }
function tableAt(text: string, pos: number): TableAt | null {
  const lines = text.split('\n');
  let off = 0, row = 0;
  for (; row < lines.length; row++) { if (pos <= off + (lines[row] ?? '').length) break; off += (lines[row] ?? '').length + 1; }
  const isRow = (i: number) => /^\s*\|/.test(lines[i] ?? '');
  if (row >= lines.length || !isRow(row)) return null;
  let from = row, to = row;
  while (from > 0 && isRow(from - 1)) from--;
  while (to < lines.length - 1 && isRow(to + 1)) to++;
  const startOffset = lines.slice(0, from).reduce((n, l) => n + l.length + 1, 0);
  const endOffset = startOffset + lines.slice(from, to + 1).join('\n').length;
  return { from, to, lines: lines.slice(from, to + 1), startOffset, endOffset };
}

/** Tab / Shift+Tab trong bảng: căn lại cột rồi chọn ô kế tiếp (ở ô cuối thì thêm hàng mới). Trả về null nếu con trỏ không ở trong bảng. */
export function moveCell(text: string, pos: number, dir: 1 | -1): Edit | null {
  const t = tableAt(text, pos);
  if (!t) return null;
  const rows = t.lines.map(splitRow);
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const row = t.lines.findIndex((_, i) => t.startOffset + t.lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0) === lineStart);
  const before = text.slice(lineStart, pos);
  const pipes = (before.match(/(?<!\\)\|/g) ?? []).length;
  const lead = /^\s*\|/.test(t.lines[row] ?? '') ? 1 : 0;
  let cell = Math.max(0, pipes - lead);
  let r = row;
  const cols = Math.max(...rows.map((x) => x.length));
  const skip = (i: number, d: number) => (isSepRow(rows[i] ?? []) ? i + d : i);
  if (dir === 1) {
    cell++;
    if (cell >= cols) { cell = 0; r = skip(r + 1, 1); }
    if (r >= rows.length) rows.push(Array.from({ length: cols }, () => ''));
  } else {
    cell--;
    if (cell < 0) { cell = cols - 1; r = skip(r - 1, -1); }
    if (r < 0) { r = 0; cell = 0; }
  }
  const out = renderTable(rows);
  const w = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.map((x) => (isSepRow(x) ? 3 : width(x[c] ?? '')))));
  const lineOff = out.slice(0, r).reduce((n, l) => n + l.length + 1, 0);
  const cellOff = 2 + w.slice(0, cell).reduce((n, x) => n + x + 3, 0);
  const start = t.startOffset + lineOff + cellOff;
  const val = rows[r]?.[cell] ?? '';
  const joined = out.join('\n');
  return { text: text.slice(0, t.startOffset) + joined + text.slice(t.endOffset), start, end: start + val.length };
}

/** Ma trận ô từ văn bản dán dạng TSV (Excel, Google Sheets). Null nếu không giống bảng. */
export function tsvToRows(text: string): string[][] | null {
  const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  if (!lines.length || !lines.some((l) => l.includes('\t'))) return null;
  const rows = lines.map((l) => l.split('\t').map((c) => c.trim()));
  return Math.max(...rows.map((r) => r.length)) >= 2 ? rows : null;
}

// ---- Soạn thông minh ----
const FENCE_LINE = /^\s*(```|~~~)/;
const LIST = /^(\s*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;
function insideFence(text: string, lineStart: number): boolean {
  let open = false;
  for (const l of text.slice(0, lineStart).split('\n')) if (FENCE_LINE.test(l)) open = !open;
  return open;
}

/** Enter trong danh sách, task, trích dẫn: tự tiếp tục dấu đầu dòng; Enter ở dòng trống thì thoát (mục lồng nhau thì lùi một cấp). Null = để trình duyệt xử lý. */
export function smartEnter(text: string, s: number, e: number): Edit | null {
  if (s !== e) return null;
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  const nl = text.indexOf('\n', s);
  const le = nl === -1 ? text.length : nl;
  const line = text.slice(ls, le);
  const col = s - ls;
  if (insideFence(text, ls)) return null;
  const q = /^(\s*(?:>\s?)+)/.exec(line);
  if (q) {
    const prefix = q[1] ?? '';
    if (col < prefix.length) return null;
    if (line.slice(prefix.length).trim() === '') return { text: text.slice(0, ls) + text.slice(le), start: ls, end: ls };
    return { text: text.slice(0, s) + '\n' + prefix + text.slice(s), start: s + 1 + prefix.length, end: s + 1 + prefix.length };
  }
  const m = LIST.exec(line);
  if (!m) return null;
  if (col < m[0].length) return null;
  const indent = m[1] ?? '';
  if (line.slice(m[0].length).trim() === '') {
    const kept = indent.length >= 2 ? indent.slice(2) + m[0].slice(indent.length) : '';
    return { text: text.slice(0, ls) + kept + text.slice(le), start: ls + kept.length, end: ls + kept.length };
  }
  const marker = m[3] ? `${Number(m[3]) + 1}${m[4] ?? '.'}` : (m[2] ?? '-');
  const next = '\n' + indent + marker + (m[5] ?? ' ') + (m[6] ? '[ ] ' : '');
  return { text: text.slice(0, s) + next + text.slice(s), start: s + next.length, end: s + next.length };
}

/** Gõ "- " ngay sau dấu đầu dòng mà Enter đã tự chèn ("- -" rồi dấu cách): giữ một dấu, không lồng thành "- - ". Null = không áp dụng. */
export function collapseMarker(text: string, s: number, e: number): Edit | null {
  if (s !== e) return null;
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  const nl = text.indexOf('\n', s);
  if ((nl === -1 ? text.length : nl) !== s || insideFence(text, ls)) return null;
  const m = /^(\s*)([-*+]) ([-*+])$/.exec(text.slice(ls, s));
  if (!m || ls === 0) return null;
  const prev = text.slice(text.lastIndexOf('\n', ls - 2) + 1, ls - 1);
  if (!/^\s*[-*+]\s+\S/.test(prev)) return null; // chỉ khi dòng trên là mục danh sách (tránh phá "- - -")
  const keep = (m[1] ?? '') + (m[2] ?? '-') + ' ';
  return { text: text.slice(0, ls) + keep + text.slice(s), start: ls + keep.length, end: ls + keep.length };
}

/** Tab / Shift+Tab: thụt hoặc lùi hai dấu cách cho mục danh sách đang đứng hoặc cho mọi dòng trong vùng chọn nhiều dòng. Null = không áp dụng. */
export function indentLines(text: string, s: number, e: number, dir: 1 | -1): Edit | null {
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  const base = e > s && text[e - 1] === '\n' ? e - 1 : e;
  const nl = text.indexOf('\n', base);
  const le = nl === -1 ? text.length : nl;
  const block = text.slice(ls, le);
  const rows = block.split('\n');
  const multi = rows.length > 1;
  if (!multi && !LIST.test(rows[0] ?? '')) return null;
  let first = 0, total = 0;
  const out = rows.map((l, i) => {
    if (dir === 1) { if (l.trim() === '') return l; if (i === 0) first = 2; total += 2; return '  ' + l; }
    const lead = /^( {1,2}|\t)/.exec(l)?.[1] ?? '';
    if (i === 0) first = lead.length; total += lead.length;
    return l.slice(lead.length);
  });
  if (dir === -1 && total === 0 && !multi) return null;
  const joined = out.join('\n');
  const sign = dir === 1 ? 1 : -1;
  return { text: text.slice(0, ls) + joined + text.slice(le), start: Math.max(ls, s + sign * first), end: Math.max(ls, e + sign * total) };
}

const WRAP: Record<string, string> = { '*': '*', _: '_', '~': '~', '`': '`', '"': '"', "'": "'", '(': ')', '[': ']' };
/** Gõ ký tự đóng/mở lên vùng chọn thì bọc vùng chọn (không bật tắt như nút định dạng). Không tự đóng cặp khi không chọn gì: Telex dùng [ và ] để gõ ư, ơ. */
export function wrapKey(text: string, s: number, e: number, key: string): Edit | null {
  const close = WRAP[key];
  if (close === undefined || s === e) return null;
  return { text: text.slice(0, s) + key + text.slice(s, e) + close + text.slice(e), start: s + 1, end: e + 1 };
}

/** Căn lại bảng chứa vị trí `pos` (ví dụ nơi con trỏ vừa rời đi). Null nếu `pos` không ở trong bảng hoặc bảng đã căn. */
export function alignTableAt(text: string, pos: number): { text: string; delta: number; startOffset: number; endOffset: number } | null {
  const t = tableAt(text, pos);
  if (!t) return null;
  const rows = t.lines.map(splitRow);
  if (rows.length < 2 || !isSepRow(rows[1] ?? [])) return null;
  const out = renderTable(rows).join('\n');
  const old = t.lines.join('\n');
  if (out === old) return null;
  return { text: text.slice(0, t.startOffset) + out + text.slice(t.endOffset), delta: out.length - old.length, startOffset: t.startOffset, endOffset: t.endOffset };
}

/**
 * Enter trong bảng: thêm một hàng trống ngay dưới hàng hiện tại (dưới hàng phân cách nếu đang ở hàng tiêu đề), con trỏ vào ô đầu.
 * Enter ở hàng cuối đang trống thì bỏ hàng đó và ra khỏi bảng. Null nếu không ở trong bảng có hàng phân cách.
 */
export function tableEnter(text: string, s: number, e: number): Edit | null {
  if (s !== e) return null;
  const t = tableAt(text, s);
  if (!t) return null;
  const rows = t.lines.map(splitRow);
  if (rows.length < 2 || !isSepRow(rows[1] ?? [])) return null;
  const lineStart = text.lastIndexOf('\n', s - 1) + 1;
  let row = 0;
  for (let off = t.startOffset; row < t.lines.length; row++) { if (off === lineStart) break; off += (t.lines[row] ?? '').length + 1; }
  if (row >= t.lines.length) return null;
  const cols = Math.max(...rows.map((x) => x.length));
  const empty = (rows[row] ?? []).every((c) => c === '');
  if (row === rows.length - 1 && row > 1 && empty) {
    const keep = renderTable(rows.slice(0, -1)).join('\n');
    // GFM: dòng chữ liền ngay dưới bảng vẫn là một hàng, nên chừa một dòng trống rồi mới đặt con trỏ
    const rest = text.slice(t.endOffset).replace(/^\n+/, '');
    const out = text.slice(0, t.startOffset) + keep + '\n\n' + (rest ? '\n' + rest : '');
    const at = t.startOffset + keep.length + 2;
    return { text: out, start: at, end: at };
  }
  const at = row <= 1 ? 2 : row + 1;
  rows.splice(at, 0, Array.from({ length: cols }, () => ''));
  const out = renderTable(rows);
  const start = t.startOffset + out.slice(0, at).reduce((n, l) => n + l.length + 1, 0) + 2;
  return { text: text.slice(0, t.startOffset) + out.join('\n') + text.slice(t.endOffset), start, end: start };
}

export type TableOp = 'row-above' | 'row-below' | 'row-del' | 'col-left' | 'col-right' | 'col-del' | 'align-left' | 'align-center' | 'align-right' | 'sort-asc' | 'sort-desc';

/** Ô (hàng, cột) chứa `pos` trong bảng có hàng phân cách. Null nếu không phải. */
export function tableCellAt(text: string, pos: number): { row: number; col: number; rows: string[][]; startOffset: number; endOffset: number } | null {
  const t = tableAt(text, pos);
  if (!t) return null;
  const rows = t.lines.map(splitRow);
  if (rows.length < 2 || !isSepRow(rows[1] ?? [])) return null;
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  let row = 0;
  for (let off = t.startOffset; row < t.lines.length; row++) { if (off === lineStart) break; off += (t.lines[row] ?? '').length + 1; }
  const before = text.slice(lineStart, pos);
  const lead = /^\s*\|/.test(t.lines[row] ?? '') ? 1 : 0;
  const cols = Math.max(...rows.map((x) => x.length));
  const col = Math.min(cols - 1, Math.max(0, (before.match(/(?<!\\)\|/g) ?? []).length - lead));
  return { row, col, rows, startOffset: t.startOffset, endOffset: t.endOffset };
}

/** Vị trí đầu nội dung ô (r, c) trong bảng đã dựng lại bằng renderTable. */
function cellOffset(rows: string[][], r: number, c: number): number {
  const out = renderTable(rows);
  const cols = Math.max(...rows.map((x) => x.length));
  const w = Array.from({ length: cols }, (_, k) => Math.max(3, ...rows.map((x) => (isSepRow(x) ? 3 : width(x[k] ?? '')))));
  return out.slice(0, r).reduce((n, l) => n + l.length + 1, 0) + 2 + w.slice(0, c).reduce((n, x) => n + x + 3, 0);
}

const NUM = /^[-+]?[\d\s.,]*\d[\d\s.,]*%?$/;
const asNum = (s: string) => Number(s.replace(/[\s,%]/g, ''));

/** Sửa bảng tại con trỏ: thêm/xoá hàng, cột; căn cột; sắp xếp các hàng thân theo cột (số theo giá trị, chữ theo thứ tự tiếng Việt). */
export function tableOp(text: string, pos: number, op: TableOp): Edit | null {
  const c = tableCellAt(text, pos);
  if (!c) return null;
  const rows = c.rows.map((r) => [...r]);
  const cols = Math.max(...rows.map((x) => x.length));
  rows.forEach((r) => { while (r.length < cols) r.push(isSepRow(r) ? '---' : ''); });
  let r = c.row, col = c.col;
  const blank = () => Array.from({ length: cols }, () => '');
  switch (op) {
    case 'row-above': { const at = Math.max(2, r); rows.splice(at, 0, blank()); r = at; break; }
    case 'row-below': { const at = r <= 1 ? 2 : r + 1; rows.splice(at, 0, blank()); r = at; break; }
    case 'row-del': { if (r <= 1) return null; rows.splice(r, 1); if (rows.length === 2) rows.push(blank()); r = Math.min(r, rows.length - 1); break; }
    case 'col-left': case 'col-right': {
      const at = op === 'col-left' ? col : col + 1;
      rows.forEach((x, i) => x.splice(at, 0, i === 1 ? '---' : i === 0 ? 'Column' : ''));
      col = at; break;
    }
    case 'col-del': { if (cols <= 1) return null; rows.forEach((x) => x.splice(col, 1)); col = Math.min(col, cols - 2); break; }
    case 'align-left': case 'align-center': case 'align-right': {
      const want = op === 'align-left' ? ':---' : op === 'align-center' ? ':---:' : '---:';
      const cur = rows[1]![col] ?? '---';
      const norm = (s: string) => (s.startsWith(':') ? ':' : '') + '---' + (s.endsWith(':') && s.length > 1 ? ':' : '');
      rows[1]![col] = norm(cur) === want ? '---' : want; // bấm lại cùng kiểu căn thì bỏ căn
      break;
    }
    case 'sort-asc': case 'sort-desc': {
      const body = rows.slice(2);
      const vals = body.map((x) => (x[col] ?? '').trim()).filter(Boolean);
      const numeric = vals.length > 0 && vals.every((v) => NUM.test(v));
      const coll = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
      const dir = op === 'sort-asc' ? 1 : -1;
      body.sort((a, b) => {
        const x = (a[col] ?? '').trim(), y = (b[col] ?? '').trim();
        if (!x || !y) return x ? -1 : y ? 1 : 0; // ô trống luôn xuống cuối
        return dir * (numeric ? asNum(x) - asNum(y) : coll.compare(x, y));
      });
      rows.splice(2, body.length, ...body);
      break;
    }
  }
  const out = renderTable(rows).join('\n');
  const start = c.startOffset + cellOffset(rows, r, col);
  return { text: text.slice(0, c.startOffset) + out + text.slice(c.endOffset), start, end: start };
}

/** Vị trí [từ, đến) của bảng chứa `pos`, hoặc null. */
export function tableRangeAt(text: string, pos: number): [number, number] | null {
  const t = tableAt(text, pos);
  return t ? [t.startOffset, t.endOffset] : null;
}

/** Đường kẻ ngang `---` thành một khối riêng. */
export function hr(text: string, s: number, e: number): Edit {
  const r = block(text, s, e, '---', 3, 0);
  return { ...r, start: r.start, end: r.start };
}

/** `![chữ](https://)`, chọn sẵn phần URL để gõ đè. */
export function image(text: string, s: number, e: number): Edit {
  const alt = text.slice(s, e) || 'alt text';
  const url = 'https://';
  const start = s + alt.length + 4;
  return { text: text.slice(0, s) + `![${alt}](${url})` + text.slice(e), start, end: start + url.length };
}

/** Công thức dòng `$…$`; có xuống dòng thì khối `$$…$$`. */
export function math(text: string, s: number, e: number): Edit {
  const sel = text.slice(s, e);
  if (sel.includes('\n')) return block(text, s, e, '$$\n' + sel + '\n$$', 3, sel.length);
  return wrapSel(text, s, e, '$', '$', 'x');
}

/** Mục lục: danh sách liên kết tới tiêu đề (cấp 1–3, bỏ tiêu đề cấp 1 đầu tiên là tên tài liệu), thụt theo cấp. `heads` đã có id đúng như bản xem dựng. */
export function toc(text: string, s: number, e: number, heads: { id: string; text: string; level: number }[]): Edit {
  const use = heads.filter((h) => h.level <= 3);
  const items = use[0] && use[0].level === 1 ? use.slice(1) : use;
  if (!items.length) return block(text, s, e, '- (add headings, then insert the contents again)', 0, 0);
  const min = Math.min(...items.map((h) => h.level));
  const md = items.map((h) => `${'  '.repeat(h.level - min)}- [${h.text.replace(/([[\]])/g, '\\$1')}](#${h.id})`).join('\n');
  const r = block(text, s, e, md, md.length, 0);
  return r;
}
