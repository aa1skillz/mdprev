/** Wikilink kiểu Obsidian: tách `[[…]]` khỏi Markdown và phân giải tên note về đường dẫn thật. Thuần chuỗi, không phụ thuộc DOM. */
export interface WikiRef { target: string; heading?: string | undefined; alias?: string | undefined; embed: boolean; line: number; raw: string }

/** Tách phần trong `[[…]]`: `target#heading|alias`. `\|` (thoát trong bảng) được coi như `|`. */
export function parseWikiInner(inner: string): { target: string; heading?: string | undefined; alias?: string | undefined } | null {
  const s = inner.replace(/\\\|/g, '|');
  const bar = s.indexOf('|');
  const left = (bar < 0 ? s : s.slice(0, bar)).trim();
  const alias = bar < 0 ? undefined : s.slice(bar + 1).trim() || undefined;
  const hash = left.indexOf('#');
  const target = (hash < 0 ? left : left.slice(0, hash)).trim();
  const heading = hash < 0 ? undefined : left.slice(hash + 1).trim() || undefined;
  if (!target && !heading) return null;
  return { target, heading, alias };
}

/** Nguồn regex dùng chung cho quét dòng và plugin remark. */
export const WIKI_RE_SRC = String.raw`(!?)\[\[([^\[\]\r\n]+?)\]\]`;

export function findWikilinks(md: string): WikiRef[] {
  const out: WikiRef[] = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  if (/^---[ \t]*$/.test(lines[0] ?? '')) {
    const end = lines.findIndex((l, n) => n > 0 && /^---[ \t]*$/.test(l));
    if (end > 0) i = end + 1; // bỏ front matter
  }
  let fence = '';
  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; continue; }
    if (!raw.includes('[[')) continue;
    const line = raw.replace(/(`+)[^\n]*?\1/g, (m) => ' '.repeat(m.length)); // che code nội dòng
    const re = new RegExp(WIKI_RE_SRC, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const p = parseWikiInner(m[2] ?? '');
      if (!p) continue;
      out.push({ ...p, embed: m[1] === '!', line: i + 1, raw: raw.slice(m.index, m.index + m[0].length) });
    }
  }
  return out;
}

const MD_EXT = /\.(md|markdown)$/i;

/** Khoá so khớp của note: đường dẫn chữ thường, bỏ đuôi .md/.markdown. */
export function noteKey(path: string): string {
  return path.replace(MD_EXT, '').toLowerCase();
}

/** Đích có đuôi file không phải Markdown (ảnh, pdf…): không nằm trong vault, chỉ khớp theo tên file. */
export function isFileTarget(target: string): boolean {
  const t = target.trim();
  return !MD_EXT.test(t) && /\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(t.slice(t.lastIndexOf('/') + 1));
}

const base = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export function buildResolver(paths: string[]): (target: string, from?: string) => string | null {
  const sorted = [...paths].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)); // ngắn trước, hoà thì theo abc
  const notes = sorted.filter((p) => MD_EXT.test(p)).map((p) => ({ path: p, id: noteKey(p) }));
  const byBase = new Map<string, string[]>(); // basename (thường, không đuôi) -> đường dẫn
  for (const n of notes) {
    const b = base(n.id);
    const a = byBase.get(b);
    if (a) a.push(n.path); else byBase.set(b, [n.path]);
  }
  const files = new Map<string, string[]>(); // basename thường của mọi file -> đường dẫn
  for (const p of sorted) {
    const b = base(p).toLowerCase();
    const a = files.get(b);
    if (a) a.push(p); else files.set(b, [p]);
  }
  const pick = (c: string[] | undefined, from?: string): string | null => {
    if (!c || !c.length) return null;
    if (from !== undefined && c.length > 1) {
      const d = dirOf(from).toLowerCase();
      const same = c.find((p) => dirOf(p).toLowerCase() === d);
      if (same) return same;
    }
    return c[0] ?? null; // c đã sắp ngắn trước rồi abc
  };
  const asNote = (t: string, from?: string): string | null => {
    const id = noteKey(t);
    if (id.includes('/')) return pick(notes.filter((n) => n.id === id || n.id.endsWith('/' + id)).map((n) => n.path), from);
    return pick(byBase.get(id), from);
  };
  return (target, from) => {
    const t = target.trim().replace(/^\/+/, '');
    if (!t) return null;
    if (MD_EXT.test(t)) return asNote(t, from);
    if (isFileTarget(t)) { // có đuôi file khác .md: tìm trong mọi đường dẫn
      const tl = t.toLowerCase();
      const c = files.get(base(tl));
      const hit = c ? pick(tl.includes('/') ? c.filter((p) => ('/' + p.toLowerCase()).endsWith('/' + tl)) : c, from) : null;
      if (hit) return hit;
    }
    return asNote(t, from); // tên có dấu chấm (vd "v1.2") vẫn có thể là note
  };
}
