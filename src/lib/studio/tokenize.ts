/**
 * Tô màu cú pháp Markdown cho ô soạn. Hàm thuần: mỗi dòng thành danh sách span, ghép lại đúng bằng dòng gốc
 * (không đổi, không thêm ký tự) để lớp tô màu khớp từng ký tự với textarea phía trên.
 * Khối code được tô theo ngôn ngữ (từ khoá, chuỗi, chú thích, số); khối ```markdown được tô như Markdown.
 */
export interface Span { text: string; cls: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- inline ----
// thứ tự ưu tiên khi cùng vị trí: code, escape, ảnh/link, chú thích, đậm, gạch ngang, nghiêng, autolink, thẻ HTML, URL trần
const INLINE = /(`[^`\n]+`)|(\\[\\`*_{}[\]()#+\-.!|~<>])|(!?\[[^\]\n]*\]\([^)\n]*\))|(\[\^[^\]\n]+\])|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*|(?<![\w])_[^_\s][^_\n]*_(?![\w]))|(<https?:\/\/[^>\s]+>)|(<\/?[A-Za-z][^>\n]*>)|(https?:\/\/[^\s)>\]]+)/g;

function inline(text: string, base: string): Span[] {
  const out: Span[] = [];
  const push = (t: string, cls: string) => { if (t) out.push({ text: t, cls: (base + ' ' + cls).trim() }); };
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0;
    push(text.slice(last, i), '');
    const t = m[0];
    if (m[1]) push(t, 'code');
    else if (m[2]) push(t, 'esc');
    else if (m[3]) {
      const k = t.indexOf('](');
      const o = t.startsWith('!') ? 2 : 1;
      push(t.slice(0, o), 'mk');
      push(t.slice(o, k), 'link');
      push('](', 'mk');
      push(t.slice(k + 2, -1), 'url');
      push(')', 'mk');
    } else if (m[4]) push(t, 'ref');
    else if (m[5]) { push(t.slice(0, 2), 'mk'); push(t.slice(2, -2), 'b'); push(t.slice(-2), 'mk'); }
    else if (m[6]) { push('~~', 'mk'); push(t.slice(2, -2), 'st'); push('~~', 'mk'); }
    else if (m[7]) { push(t[0] ?? '', 'mk'); push(t.slice(1, -1), 'it'); push(t.slice(-1), 'mk'); }
    else if (m[9]) push(t, 'tag');
    else push(t, 'url');
    last = i + t.length;
  }
  push(text.slice(last), '');
  return out;
}

// ---- code trong khối fence ----
type Fam = 'js' | 'json' | 'sh' | 'py' | 'yaml' | 'css' | 'html' | 'sql' | 'clike' | 'md' | '';
const FAM: Record<string, Fam> = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', javascript: 'js', typescript: 'js', json: 'json', jsonc: 'json', json5: 'json',
  sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', fish: 'sh', py: 'py', python: 'py', yaml: 'yaml', yml: 'yaml', toml: 'yaml',
  css: 'css', scss: 'css', less: 'css', html: 'html', xml: 'html', svg: 'html', vue: 'html', astro: 'html', sql: 'sql',
  go: 'clike', rust: 'clike', rs: 'clike', java: 'clike', c: 'clike', cpp: 'clike', cs: 'clike', swift: 'clike', kotlin: 'clike', php: 'clike',
  md: 'md', markdown: 'md',
};
const kw = (s: string) => new Set(s.split(' '));
const KEYWORDS: Record<string, Set<string>> = {
  js: kw('const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false type interface enum implements public private readonly as void yield static'),
  sh: kw('if then else elif fi for while do done case esac function in return export local source alias cd echo exit set unset sudo'),
  py: kw('def class return if elif else for while in not and or is import from as with try except finally raise lambda yield pass break continue None True False async await global'),
  sql: kw('select from where insert into update delete create table drop alter join left right inner outer on group by order having limit as and or not null values set primary key index distinct union'),
  clike: kw('func fn let mut const var if else for while loop return struct enum impl trait interface class public private protected static void int string bool true false nil null match switch case break continue import package use pub new this self'),
  yaml: kw('true false null yes no on off'),
  css: kw('important'),
};
const COMMENT: Record<string, RegExp> = {
  js: /\/\/.*$|\/\*.*?\*\//, clike: /\/\/.*$|\/\*.*?\*\//, css: /\/\*.*?\*\//, sh: /(?<=^|\s)#.*$/, py: /(?<=^|\s)#.*$/, yaml: /(?<=^|\s)#.*$/, html: /<!--.*?-->/, sql: /--.*$|\/\*.*?\*\//,
};
const STRING_RE = '"(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?';

const codeRe = new Map<Fam, RegExp>();
function codeRegex(f: Fam): RegExp {
  let r = codeRe.get(f);
  if (r) return r;
  const parts: string[] = [];
  parts.push(`(${(COMMENT[f] ?? /(?!)/).source})`); // 1 chú thích
  parts.push(`(${STRING_RE}${f === 'js' || f === 'sh' ? '|`(?:\\\\.|[^`\\\\])*`?' : ''})`); // 2 chuỗi
  parts.push('(\\b0x[\\da-fA-F]+\\b|\\b\\d+(?:\\.\\d+)?\\b)'); // 3 số
  parts.push(f === 'html' ? '(<\\/?[A-Za-z][\\w:-]*|\\/?>)' : f === 'sh' ? '((?<=\\s)--?[A-Za-z][\\w-]*)' : '((?!))'); // 4 thẻ html / cờ lệnh
  parts.push('([A-Za-z_$][\\w$]*)'); // 5 định danh
  r = new RegExp(parts.join('|'), 'g');
  codeRe.set(f, r);
  return r;
}

function codeSpans(line: string, f: Fam): Span[] {
  if (!f) return [{ text: line, cls: 'cb' }];
  const out: Span[] = [];
  const put = (t: string, c: string) => { if (t) out.push({ text: t, cls: c }); };
  const kws = KEYWORDS[f];
  let last = 0;
  for (const m of line.matchAll(codeRegex(f))) {
    const i = m.index ?? 0;
    put(line.slice(last, i), 'cb');
    const t = m[0];
    if (m[1]) put(t, 'cc');
    else if (m[2]) put(t, f === 'json' && /^\s*:/.test(line.slice(i + t.length)) ? 'cp' : 'cs');
    else if (m[3]) put(t, 'cn');
    else if (m[4]) put(t, f === 'html' ? 'ck' : 'cp');
    else if (m[5]) put(t, (kws?.has(f === 'sql' ? t.toLowerCase() : t) ? 'ck' : (f === 'yaml' && /^\s*:/.test(line.slice(i + t.length))) ? 'cp' : 'cb'));
    last = i + t.length;
  }
  put(line.slice(last), 'cb');
  return out;
}

// ---- khối Markdown theo từng dòng ----
const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const SEP_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

function mdLine(line: string, tbl: number): { spans: Span[]; tbl: number } {
  const S = (text: string, cls: string): Span => ({ text, cls });
  let m: RegExpExecArray | null;
  if ((m = /^(#{1,6})(\s+)(.*)$/.exec(line))) return { spans: [S(m[1] ?? '', 'mk h'), S(m[2] ?? '', ''), ...inline(m[3] ?? '', 'h')], tbl: 0 };
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return { spans: [S(line, 'hr')], tbl: 0 };
  if ((m = /^((?:\s*>)+\s?)(.*)$/.exec(line))) return { spans: [S(m[1] ?? '', 'qm'), ...inline(m[2] ?? '', 'q')], tbl: 0 };
  if ((m = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\](?=\s))?(.*)$/.exec(line))) {
    const done = m[4] && /x/i.test(m[4]);
    return { spans: [S(m[1] ?? '', ''), S(m[2] ?? '', 'li'), S(m[3] ?? '', ''), ...(m[4] ? [S(m[4], done ? 'task-done' : 'task-open')] : []), ...inline(m[5] ?? '', done ? 'done' : '')], tbl: 0 };
  }
  if ((m = /^(\[\^[^\]\n]+\]:)(.*)$/.exec(line))) return { spans: [S(m[1] ?? '', 'ref'), ...inline(m[2] ?? '', '')], tbl: 0 };
  if (/^\s*\|/.test(line) || (tbl > 0 && line.includes('|'))) {
    if (SEP_ROW.test(line)) return { spans: [S(line, 'tbs')], tbl: tbl + 1 };
    const base = tbl === 0 ? 'tbh' : '';
    const parts = line.split(/(\|)/);
    return { spans: parts.flatMap((p) => (p === '|' ? [S(p, 'tbl')] : inline(p, base))), tbl: tbl + 1 };
  }
  return { spans: inline(line, ''), tbl: 0 };
}

export function tokenizeLines(src: string): Span[][] {
  const lines = src.split('\n');
  const out: Span[][] = [];
  let fm: 'none' | 'in' | 'done' = lines[0] !== undefined && /^---[ \t]*$/.test(lines[0]) ? 'in' : 'none';
  let fence: { mark: string; fam: Fam } | null = null;
  let tbl = 0;
  lines.forEach((line, n) => {
    const S = (text: string, cls: string): Span => ({ text, cls });
    if (fm === 'in') {
      if (n > 0 && /^---[ \t]*$/.test(line)) { fm = 'done'; out.push([S(line, 'fmk')]); return; }
      if (n === 0) { out.push([S(line, 'fmk')]); return; }
      const m = /^(\s*[\w.-]+)(:)(.*)$/.exec(line);
      out.push(m ? [S(m[1] ?? '', 'fmk'), S(m[2] ?? '', 'mk'), S(m[3] ?? '', 'fmv')] : [S(line, 'fmv')]);
      return;
    }
    if (fence) {
      const close = FENCE.exec(line);
      if (close && (close[2] ?? '')[0] === fence.mark[0] && (close[2] ?? '').length >= fence.mark.length && (close[3] ?? '').trim() === '') { fence = null; out.push([S(line, 'cf')]); return; }
      out.push(fence.fam === 'md' ? mdLine(line, 0).spans : codeSpans(line, fence.fam));
      return;
    }
    const f = FENCE.exec(line);
    if (f) {
      const info = (f[3] ?? '');
      const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      fence = { mark: f[2] ?? '', fam: FAM[lang] ?? '' };
      tbl = 0;
      out.push([S((f[1] ?? '') + (f[2] ?? ''), 'cf'), ...(info ? [S(info, 'lang')] : [])]);
      return;
    }
    const r = mdLine(line, tbl);
    tbl = r.tbl;
    out.push(r.spans);
  });
  return out.map((l) => (l.length ? l : [{ text: '', cls: '' }]));
}

/** Một dòng token, phần ngoài [from, to) (cột UTF-16 của dòng) thêm lớp `sd`. Cắt trên chữ gốc rồi mới escape, không bao giờ cắt giữa `&amp;`. */
function sentenceTokens(spans: Span[], from: number, to: number): string {
  let o = 0, out = '';
  for (const sp of spans) {
    const t = sp.text, a = o, b = o + t.length; o = b;
    const lo = Math.min(Math.max(from, a), b), hi = Math.min(Math.max(to, a), b);
    const cut = (x: number, y: number, dim: boolean) => {
      const piece = t.slice(x - a, y - a); if (!piece) return;
      const cls = [sp.cls, dim ? 'sd' : ''].filter(Boolean).join(' ');
      out += cls ? `<span class="${cls}">${esc(piece)}</span>` : esc(piece);
    };
    cut(a, lo, true); cut(lo, hi, false); cut(hi, b, true);
  }
  return out;
}

/**
 * Câu đang viết trong đoạn chứa dòng `ln` (1-based), con trỏ ở cột `col` (1-based, UTF-16 như textarea).
 * Trả về, theo từng dòng của đoạn, khoảng cột [từ, đến) thuộc câu đó. Biên câu: dấu . ! ? … (kèm nháy/ngoặc đóng) rồi khoảng trắng, hoặc xuống dòng.
 */
export function sentenceMarks(src: string, ln: number, col: number): Map<number, [number, number]> | undefined {
  const lines = src.split('\n');
  if ((lines[ln - 1] ?? '').trim() === '') return undefined;
  const [a, b] = paragraphRange(src, ln);
  const base: number[] = [];
  let P = '';
  for (let i = a; i <= b; i++) { if (i > a) P += '\n'; base.push(P.length); P += lines[i - 1] ?? ''; }
  const caret = (base[ln - a] ?? 0) + Math.max(0, col - 1);
  const starts = [0];
  const re = /[.!?…]+["'”’)\]]*\s+|\n/g;
  for (let m = re.exec(P); m; m = re.exec(P)) starts.push(m.index + m[0].length);
  let si = 0;
  for (let i = 0; i < starts.length; i++) if ((starts[i] ?? 0) <= caret) si = i;
  const s0 = starts[si] ?? 0, e0 = starts[si + 1] ?? P.length;
  const out = new Map<number, [number, number]>();
  for (let i = a; i <= b; i++) {
    const lb = base[i - a] ?? 0, len = (lines[i - 1] ?? '').length;
    const lo = Math.max(s0, lb), hi = Math.min(e0, lb + len);
    out.set(i, lo < hi ? [lo - lb, hi - lb] : [0, 0]);
  }
  return out;
}

/** HTML cho một đoạn dòng [from, to) (0-based). Dòng ngoài `keep` = [a, b] (1-based) thêm `dz` (làm mờ trong zen). */
export function renderLines(tokens: Span[][], from: number, to: number, keep?: [number, number], levels?: Uint8Array, sent?: Map<number, [number, number]>): string {
  const rows: string[] = [];
  for (let i = Math.max(0, from); i < Math.min(tokens.length, to); i++) {
    const dim = keep && (i + 1 < keep[0] || i + 1 > keep[1]);
    const mark = sent?.get(i + 1);
    const inner = mark ? sentenceTokens(tokens[i] ?? [], mark[0], mark[1]) : (tokens[i] ?? []).map((s) => (s.cls ? `<span class="${s.cls}">${esc(s.text)}</span>` : esc(s.text))).join('');
    const lv = dim && levels ? levels[i] ?? 3 : 0;
    rows.push(`<span class="l${dim ? ' dz' : ''}${lv > 1 ? ' d' + lv : ''}">${inner}</span>`);
  }
  return rows.join('\n');
}

/** Toàn bộ văn bản, kết thúc bằng một `\n` để cao bằng textarea. */
export function highlightHtml(src: string, keep?: [number, number]): string {
  const t = tokenizeLines(src);
  return renderLines(t, 0, t.length, keep) + '\n';
}

/** Đoạn (khối dòng không trống) chứa dòng `ln` (1-based). Dòng trống thì chỉ chính dòng đó. */
export function paragraphRange(src: string, ln: number): [number, number] {
  const lines = src.split('\n');
  const blank = (i: number) => (lines[i - 1] ?? '').trim() === '';
  if (blank(ln)) return [ln, ln];
  let a = ln, b = ln;
  while (a > 1 && !blank(a - 1)) a--;
  while (b < lines.length && !blank(b + 1)) b++;
  return [a, b];
}

/** Khoảng cách (số đoạn, tối đa 3) từ đoạn chứa dòng `ln` tới từng dòng: 1 là đoạn liền kề, dùng để mờ dần theo độ xa. Chỉ số theo dòng 0-based. */
export function paragraphLevels(src: string, ln: number): Uint8Array {
  const lines = src.split('\n');
  const id = new Int32Array(lines.length);
  let n = -1, inP = false;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '') { inP = false; id[i] = n; continue; }
    if (!inP) { n++; inP = true; }
    id[i] = n;
  }
  const a = id[Math.min(Math.max(ln, 1), lines.length) - 1] ?? 0;
  const out = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i++) out[i] = Math.min(3, Math.max(1, Math.abs((id[i] ?? 0) - a)));
  return out;
}
