/** Cảnh báo Markdown nhẹ, chạy trên văn bản thô. Bỏ qua front-matter và khối code. */
import { idMaker, plainHeading } from './slug';

export interface Issue { line: number; message: string }

export function lint(src: string): Issue[] {
  const issues: Issue[] = [];
  const lines = src.split('\n');
  let i = 0;
  if (/^---[ \t]*$/.test(lines[0] ?? '')) {
    const end = lines.findIndex((l, n) => n > 0 && /^---[ \t]*$/.test(l));
    if (end > 0) i = end + 1;
  }
  let fence = '', fenceLine = 0, prevLevel = 0, h1s = 0;
  const seen = new Map<string, number>();
  const stack: { level: number; text: string }[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const n = i + 1;
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; fenceLine = n; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = (h[1] ?? '').length;
      const text = (h[2] ?? '').toLowerCase();
      if (level === 1 && ++h1s === 2) issues.push({ line: n, message: 'Multiple top-level headings' });
      if (prevLevel && level > prevLevel + 1) issues.push({ line: n, message: `Heading level jumps from h${prevLevel} to h${level}` });
      // trùng tên chỉ tính khi cùng mục cha (như markdownlint "siblings_only"): "Considerations" dưới hai mục khác nhau là bình thường
      while (stack.length && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
      const key = stack.map((x) => x.text).join('>') + '|' + level + '|' + text;
      if (text && seen.has(key)) issues.push({ line: n, message: `Duplicate heading, first on line ${seen.get(key)}` });
      else if (text) seen.set(key, n);
      stack.push({ level, text });
      prevLevel = level;
    }
    const trail = /(\s+)$/.exec(line)?.[1] ?? '';
    if (trail.length > 0 && trail.length !== 2 && line.trim() !== '') issues.push({ line: n, message: 'Trailing whitespace' });
    const bare = line.replace(/`[^`]*`/g, '').replace(/!?\[[^\]]*\]\([^)]*\)/g, '').replace(/<https?:\/\/[^>]+>/g, '');
    const isDef = /^\s{0,3}\[[^\]]+\]:\s/.test(line); // định nghĩa liên kết tham chiếu `[id]: url` là chỗ đúng để viết URL
    if (!isDef && /(^|[\s(])https?:\/\/\S+/.test(bare)) issues.push({ line: n, message: 'Bare URL, wrap it in a link or <angle brackets>' });
    if (/!\[\]\(/.test(line)) issues.push({ line: n, message: 'Image without alt text' });
    if (/\[[^\]]+\]\(\s*\)/.test(line)) issues.push({ line: n, message: 'Link with empty target' });
  }
  if (fence) issues.push({ line: fenceLine, message: 'Code fence is never closed' });
  issues.push(...lintLinks(lines));
  return issues.sort((a, b) => a.line - b.line);
}

/** Số dòng có khoảng trắng thừa cuối dòng (cùng quy tắc với cảnh báo). */
export const trailingCount = (src: string): number => lint(src).filter((i) => i.message === 'Trailing whitespace').length;

/** Xoá khoảng trắng thừa cuối dòng ở đúng các dòng lint báo (giữ hai dấu cách xuống dòng, bỏ qua khối code và front-matter). */
export function fixTrailing(src: string): string {
  const bad = new Set(lint(src).filter((i) => i.message === 'Trailing whitespace').map((i) => i.line));
  if (!bad.size) return src;
  return src.split('\n').map((l, i) => (bad.has(i + 1) ? l.replace(/[ \t]+$/, '') : l)).join('\n');
}

/** Liên kết trong tài liệu: #anchor không có heading, [a][b] thiếu định nghĩa, định nghĩa và chú thích không dùng. Không cần mạng. */
function lintLinks(lines: string[]): Issue[] {
  const out: Issue[] = [];
  let i = 0;
  if (/^---[ \t]*$/.test(lines[0] ?? '')) {
    const end = lines.findIndex((l, n) => n > 0 && /^---[ \t]*$/.test(l));
    if (end > 0) i = end + 1;
  }
  const ids = new Set<string>();
  const nextId = idMaker();
  const defs = new Map<string, number>();
  const usedDefs = new Set<string>();
  const fnDefs = new Map<string, number>();
  const fnUsed = new Set<string>();
  const anchors: { line: number; id: string }[] = [];
  const refs: { line: number; label: string }[] = [];
  const fnRefs: { line: number; label: string }[] = [];
  let fence = '';
  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const n = i + 1;
    const f = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if (h) ids.add(nextId(plainHeading(h[2] ?? '')));
    const line = raw.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
    let m: RegExpExecArray | null;
    const fd = /^\s{0,3}\[\^([^\]]+)\]:/.exec(line);
    if (fd) fnDefs.set((fd[1] ?? '').toLowerCase(), n);
    const ld = !fd ? /^\s{0,3}\[([^\]^][^\]]*)\]:\s*\S/.exec(line) : null;
    if (ld) defs.set((ld[1] ?? '').toLowerCase(), n);
    for (const a of line.matchAll(/\]\(#([^)\s]*)\)/g)) if (a[1]) anchors.push({ line: n, id: a[1] });
    for (m of line.matchAll(/\[\^([^\]]+)\](?!:)/g)) fnRefs.push({ line: n, label: (m[1] ?? '').toLowerCase() });
    for (m of line.matchAll(/\[([^\]]*)\]\[([^\]]*)\]/g)) refs.push({ line: n, label: ((m[2] || m[1]) ?? '').toLowerCase() });
    if (!fd && !ld) for (m of line.matchAll(/\[([^\]^][^\]]*)\](?![([:])/g)) usedDefs.add((m[1] ?? '').toLowerCase());
  }
  for (const a of anchors) {
    let id = a.id;
    try { id = decodeURIComponent(id); } catch { /* giữ nguyên */ }
    if (!ids.has(id) && !ids.has(a.id)) out.push({ line: a.line, message: `Anchor "#${a.id}" not found in this document` });
  }
  for (const r of refs) { usedDefs.add(r.label); if (!defs.has(r.label)) out.push({ line: r.line, message: `Reference [${r.label}] has no definition` }); }
  for (const [label, line] of defs) if (!usedDefs.has(label)) out.push({ line, message: `Definition [${label}] is never used` });
  for (const r of fnRefs) { fnUsed.add(r.label); if (!fnDefs.has(r.label)) out.push({ line: r.line, message: `Footnote [^${r.label}] has no definition` }); }
  for (const [label, line] of fnDefs) if (!fnUsed.has(label)) out.push({ line, message: `Footnote definition [^${label}] is never used` });
  return out;
}
