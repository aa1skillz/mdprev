/**
 * Tô wikilink trong ô soạn: hậu xử lý danh sách span của tokenize.ts (nạp lười, chỉ khi workspace là vault hoặc tài liệu
 * có `[[`). Không đổi chữ: ghép các span của một dòng vẫn ra đúng dòng gốc, mỗi span giữ class cũ và thêm class wikilink.
 * Bỏ qua code (nội dòng và khối rào), front matter, URL, thẻ HTML.
 */
import type { Span } from '../studio/tokenize';
import { WIKI_RE_SRC, buildResolver, parseWikiInner } from './wikilink';

const SKIP = /(^|\s)(code|c[bkcsnptf]|fmk|fmv|lang|url|tag|esc)(\s|$)/;

/** Hàm kiểm "đích có tồn tại" cho một vault: `paths` gồm note và ảnh. Đích rỗng (`[[#heading]]`) là chính note đang mở. */
export function existsIn(paths: string[]): (target: string) => boolean {
  const resolve = buildResolver(paths);
  return (t) => !t.trim() || resolve(t) !== null;
}

/** Đánh dấu wikilink trong từng dòng. `exists` không có thì không báo link hỏng (tài liệu thường). */
export function markWikilinks(lines: Span[][], exists?: (target: string) => boolean): Span[][] {
  return lines.map((spans) => {
    let text = '';
    for (const s of spans) text += s.text;
    if (!text.includes('[[')) return spans;
    // ký tự nằm trong span bị bỏ qua (code, URL…) không được là một phần của wikilink
    const blocked = new Uint8Array(text.length);
    let o = 0;
    for (const s of spans) { if (SKIP.test(s.cls)) blocked.fill(1, o, o + s.text.length); o += s.text.length; }
    const regions: { a: number; b: number; cls: string }[] = [];
    const re = new RegExp(WIKI_RE_SRC, 'g');
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const a = m.index, b = a + m[0].length;
      if (blocked.subarray(a, b).some((x) => x)) continue;
      const w = parseWikiInner(m[2] ?? '');
      if (!w) continue;
      const open = (m[1] ?? '') + '[[';
      const inner = m[2] ?? '';
      const bar = inner.search(/\\?\|/);
      const tgtEnd = a + open.length + (bar < 0 ? inner.length : bar);
      const bad = exists && !exists(w.target) ? ' wlx' : '';
      regions.push({ a, b: a + open.length, cls: 'mk wlm' });
      regions.push({ a: a + open.length, b: tgtEnd, cls: 'wl' + bad + (m[1] ? ' wle' : '') });
      if (tgtEnd < b - 2) regions.push({ a: tgtEnd, b: b - 2, cls: 'wla' });
      regions.push({ a: b - 2, b, cls: 'mk wlm' });
    }
    if (!regions.length) return spans;
    // cắt span theo ranh giới vùng, mỗi mảnh giữ class gốc cộng class của vùng chứa nó
    const out: Span[] = [];
    let pos = 0, ri = 0;
    const clsAt = (i: number): string => { while (ri < regions.length && regions[ri]!.b <= i) ri++; const r = regions[ri]; return r && r.a <= i ? r.cls : ''; };
    for (const s of spans) {
      let start = 0;
      const end = s.text.length;
      while (start < end) {
        const abs = pos + start;
        const extra = clsAt(abs);
        // điểm cắt kế tiếp trong span này
        let next = end;
        for (const r of regions) {
          if (r.a > abs && r.a - pos < next) next = r.a - pos;
          if (r.b > abs && r.b - pos < next) next = r.b - pos;
        }
        out.push({ text: s.text.slice(start, next), cls: extra ? (s.cls + ' ' + extra).trim() : s.cls });
        start = next;
      }
      pos += end;
    }
    return out;
  });
}
