/**
 * Thao tác theo dòng kiểu IDE (di chuyển, nhân đôi, xoá, chọn dòng, chọn lần xuất hiện kế tiếp), tìm liên kết tại con trỏ
 * và di chuyển cả một mục (heading + nội dung). Hàm thuần: nhận văn bản + vùng chọn, trả văn bản mới + vùng chọn mới.
 */
import type { Edit } from './edit';
import { idMaker, plainHeading } from './slug';

/** [đầu dòng đầu, cuối dòng cuối) của các dòng mà vùng chọn chạm tới. Vùng chọn kết thúc ngay đầu một dòng thì không tính dòng đó. */
function lineSpan(text: string, s: number, e: number): [number, number] {
  const end = e > s && text[e - 1] === '\n' ? e - 1 : e;
  const a = text.lastIndexOf('\n', s - 1) + 1;
  const n = text.indexOf('\n', end);
  return [a, n === -1 ? text.length : n];
}

/** Alt+↑ / Alt+↓: đổi chỗ khối dòng đang chọn với dòng liền trên/dưới. Null khi đã ở mép văn bản. */
export function moveLines(text: string, s: number, e: number, dir: 1 | -1): Edit | null {
  const [a, b] = lineSpan(text, s, e);
  const block = text.slice(a, b);
  if (dir === -1) {
    if (a === 0) return null;
    const pa = text.lastIndexOf('\n', a - 2) + 1;
    const prev = text.slice(pa, a - 1);
    const d = a - pa;
    return { text: text.slice(0, pa) + block + '\n' + prev + text.slice(b), start: s - d, end: e - d };
  }
  if (b >= text.length) return null;
  const nn = text.indexOf('\n', b + 1);
  const nb = nn === -1 ? text.length : nn;
  const next = text.slice(b + 1, nb);
  const d = next.length + 1;
  return { text: text.slice(0, a) + next + '\n' + block + text.slice(nb), start: s + d, end: e + d };
}

/** Shift+Alt+↓ / ↑: nhân đôi các dòng đang chọn; ↓ thì vùng chọn đi theo bản mới bên dưới, ↑ thì ở lại bản trên. */
export function duplicateLines(text: string, s: number, e: number, dir: 1 | -1): Edit {
  const [a, b] = lineSpan(text, s, e);
  const block = text.slice(a, b);
  const out = text.slice(0, b) + '\n' + block + text.slice(b);
  const d = dir === 1 ? block.length + 1 : 0;
  return { text: out, start: s + d, end: e + d };
}

/** Ctrl/⌘+Shift+K: xoá các dòng đang chọn, con trỏ về đầu dòng thay vào chỗ đó. */
export function deleteLines(text: string, s: number, e: number): Edit {
  const [a, b] = lineSpan(text, s, e);
  if (b < text.length) return { text: text.slice(0, a) + text.slice(b + 1), start: a, end: a };
  const from = a > 0 ? a - 1 : 0; // dòng cuối: bỏ luôn ký tự xuống dòng phía trước
  const at = text.lastIndexOf('\n', from - 1) + 1;
  return { text: text.slice(0, from), start: a > 0 ? at : 0, end: a > 0 ? at : 0 };
}

/** Ctrl/⌘+L: chọn trọn dòng (kèm ký tự xuống dòng); bấm tiếp thì nới thêm một dòng. */
export function selectLines(text: string, s: number, e: number): Edit {
  const full = e > s && (s === 0 || text[s - 1] === '\n') && (e === text.length || text[e - 1] === '\n');
  if (full) {
    if (e >= text.length) return { text, start: s, end: e };
    const n = text.indexOf('\n', e);
    return { text, start: s, end: n === -1 ? text.length : n + 1 };
  }
  const [a, b] = lineSpan(text, s, e);
  return { text, start: a, end: b < text.length ? b + 1 : b };
}

const WORD = /[\p{L}\p{N}_]/u;
/** Ctrl/⌘+D: chưa chọn gì thì chọn từ tại con trỏ; đã chọn thì nhảy tới lần xuất hiện kế tiếp (vòng lại từ đầu). Không có thì null. */
export function selectNext(text: string, s: number, e: number): Edit | null {
  if (s === e) {
    let a = s, b = s;
    while (a > 0 && WORD.test(text[a - 1] ?? '')) a--;
    while (b < text.length && WORD.test(text[b] ?? '')) b++;
    return b > a ? { text, start: a, end: b } : null;
  }
  const needle = text.slice(s, e);
  let i = text.indexOf(needle, e);
  if (i === -1) i = text.indexOf(needle);
  if (i === -1 || i === s) return null;
  return { text, start: i, end: i + needle.length };
}

export type LinkHit = { kind: 'anchor'; id: string } | { kind: 'url'; url: string } | { kind: 'relative'; href: string };
const classify = (href: string): LinkHit | null => {
  const h = href.trim().replace(/^<|>$/g, '');
  if (!h) return null;
  if (h.startsWith('#')) { let id = h.slice(1); try { id = decodeURIComponent(id); } catch { /* giữ nguyên */ } return id ? { kind: 'anchor', id } : null; }
  if (/^(https?:|mailto:)/i.test(h)) return { kind: 'url', url: h };
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//')) return null;
  return { kind: 'relative', href: h };
};

/** Liên kết tại vị trí `pos`: `[chữ](đích)`, `<https://…>`, URL trần, hoặc dòng định nghĩa `[id]: url`. Dùng cho Ctrl/⌘+click trong ô soạn. */
export function linkAt(text: string, pos: number): LinkHit | null {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const nl = text.indexOf('\n', pos);
  const line = text.slice(ls, nl === -1 ? text.length : nl);
  const col = pos - ls;
  const inside = (m: RegExpMatchArray) => col >= (m.index ?? 0) && col <= (m.index ?? 0) + m[0].length;
  for (const m of line.matchAll(/!?\[[^\]]*\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g)) if (inside(m)) return classify(m[1] ?? '');
  for (const m of line.matchAll(/<((?:https?:|mailto:)[^>\s]+)>/g)) if (inside(m)) return classify(m[1] ?? '');
  const def = /^\s{0,3}\[[^\]]+\]:\s*(\S+)/.exec(line);
  if (def) return classify(def[1] ?? '');
  for (const m of line.matchAll(/https?:\/\/[^\s<>()]+/g)) if (inside(m)) return classify(m[0]);
  return null;
}

interface Sec { line: number; level: number; end: number; id: string }
/** Các mục theo heading ATX (bỏ qua khối code và front matter). `end` là dòng (1-based, loại trừ) nơi mục kết thúc: heading kế tiếp cùng cấp hoặc cao hơn. */
export function sections(text: string): Sec[] {
  const lines = text.split('\n');
  const out: Sec[] = [];
  const nextId = idMaker();
  let i = 0, fence = '';
  if (/^---[ \t]*$/.test(lines[0] ?? '')) { const end = lines.findIndex((l, n) => n > 0 && /^---[ \t]*$/.test(l)); if (end > 0) i = end + 1; }
  for (; i < lines.length; i++) {
    const l = lines[i] ?? '';
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) out.push({ line: i + 1, level: (h[1] ?? '').length, end: lines.length + 1, id: nextId(plainHeading(h[2] ?? '')) });
  }
  for (let k = 0; k < out.length; k++) {
    const nx = out.slice(k + 1).find((x) => x.level <= out[k]!.level);
    if (nx) out[k]!.end = nx.line;
  }
  return out;
}

/**
 * Chuyển mục bắt đầu ở dòng `from` (heading + mọi mục con) tới trước heading ở dòng `before` (0 = cuối văn bản).
 * Null khi không có mục ở `from` hoặc đích nằm trong chính mục đó.
 */
export function moveSection(text: string, from: number, before: number): Edit | null {
  const secs = sections(text);
  const sec = secs.find((x) => x.line === from);
  if (!sec) return null;
  if (before && (before >= sec.line && before < sec.end)) return null;
  if (before && !secs.some((x) => x.line === before)) return null;
  const lines = text.split('\n');
  const trail = text.endsWith('\n');
  const body = lines.slice(sec.line - 1, sec.end - 1);
  // mục chuyển đi luôn kết thúc bằng một dòng trống để không dính vào heading đứng sau
  while (body.length && (body[body.length - 1] ?? '').trim() === '') body.pop();
  const rest = [...lines.slice(0, sec.line - 1), ...lines.slice(sec.end - 1)];
  let at = before ? before - 1 - (before > sec.line ? sec.end - sec.line : 0) : rest.length;
  if (!before) { while (rest.length && (rest[rest.length - 1] ?? '').trim() === '') rest.pop(); at = rest.length; }
  const ins = before ? [...body, ''] : ['', ...body];
  const out = [...rest.slice(0, at), ...ins, ...rest.slice(at)];
  let result = out.join('\n');
  if (!before && trail && !result.endsWith('\n')) result += '\n';
  const startLine = before ? at : at + 1; // 0-based dòng của heading sau khi chuyển
  const start = out.slice(0, startLine).reduce((n, l) => n + l.length + 1, 0);
  return { text: result, start, end: start };
}

/** Đổi chỗ mục ở dòng `line` với mục anh em liền trên (-1) hoặc liền dưới (+1), cùng cấp và cùng cha. */
export function swapSection(text: string, line: number, dir: 1 | -1): Edit | null {
  const secs = sections(text);
  const k = secs.findIndex((x) => x.line === line);
  const me = secs[k];
  if (!me) return null;
  if (dir === -1) {
    for (let j = k - 1; j >= 0; j--) { const o = secs[j]!; if (o.level < me.level) return null; if (o.level === me.level) return moveSection(text, me.line, o.line); }
    return null;
  }
  const after = secs.find((x) => x.line === me.end);
  if (!after || after.level !== me.level) return null;
  const next = secs.find((x) => x.line === after.end);
  return next ? moveSection(text, me.line, next.line) : after.end > text.split('\n').length ? moveSection(text, me.line, 0) : moveSection(text, me.line, after.end);
}
