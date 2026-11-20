/**
 * Phần thuần dùng chung cho bản xem của vault (worker) và site xuất ra: cắt một mục theo heading hoặc một khối `^id`,
 * nhận diện ảnh, kiểm byte ảnh và kiểm SVG. Không DOM, không IndexedDB.
 */
import { plainHeading, slugify } from '../studio/slug';

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEAD = /^ {0,3}(#{1,6})[ \t]+(.*)$/;

/** Chữ của heading ATX: bỏ dấu cách cuối và chuỗi `#` đóng. Làm bằng code (regex lười kiểu `(.*?)[ \t]*#*[ \t]*$` quay lui bậc ba trên dòng nhiều tab). */
export function headText(s: string): string {
  let e = s.length;
  while (e > 0 && (s[e - 1] === ' ' || s[e - 1] === '\t')) e--;
  let h = e;
  while (h > 0 && s[h - 1] === '#') h--;
  if (h < e && (h === 0 || s[h - 1] === ' ' || s[h - 1] === '\t')) { e = h; while (e > 0 && (s[e - 1] === ' ' || s[e - 1] === '\t')) e--; }
  return s.slice(0, e);
}

/** Gọi `fn(i, line)` cho mọi dòng ngoài khối code rào. */
function eachOutsideFence(lines: string[], fn: (i: number, line: string) => boolean | void): void {
  let fence = '';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const f = FENCE.exec(raw);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; continue; }
    if (fn(i, raw) === true) return;
  }
}

/**
 * Mục bắt đầu ở heading `heading` (so theo chữ thuần không phân biệt hoa thường, hoặc theo id) tới trước heading kế tiếp
 * cùng cấp hoặc cao hơn; kèm chính dòng heading. Không có thì `null`.
 */
export function sectionOf(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const want = plainHeading(heading).toLowerCase();
  const wantId = heading.trim().toLowerCase();
  let start = -1, level = 0, end = lines.length;
  eachOutsideFence(lines, (i, raw) => {
    const h = HEAD.exec(raw);
    if (!h) return false;
    const lv = (h[1] ?? '').length;
    if (start < 0) {
      const text = plainHeading(headText(h[2] ?? ''));
      if (text.toLowerCase() === want || slugify(text) === wantId) { start = i; level = lv; }
      return false;
    }
    if (lv <= level) { end = i; return true; }
    return false;
  });
  if (start < 0) return null;
  return lines.slice(start, end).join('\n').replace(/\n+$/, (m) => (end < lines.length ? m : ''));
}

const BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s/;

/** Khối kết thúc bằng ` ^id`: mục danh sách thì chỉ dòng đó, còn lại là cả đoạn (tới dòng trống). Bỏ dấu `^id`. */
export function blockOf(body: string, id: string): string | null {
  const lines = body.split(/\r?\n/);
  let at = -1;
  eachOutsideFence(lines, (i, raw) => { if (BLOCK_ID.exec(raw)?.[1] !== id) return false; at = i; return true; });
  if (at < 0) return null;
  const strip = (s: string) => s.replace(BLOCK_ID, '');
  const line = lines[at] ?? '';
  if (LIST_ITEM.test(line)) return strip(line);
  let a = at;
  const blank = (i: number) => (lines[i] ?? '').trim() === '';
  while (a > 0 && !blank(a - 1) && !LIST_ITEM.test(lines[a] ?? '')) a--;
  return [...lines.slice(a, at), strip(line)].join('\n');
}

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
const extOf = (p: string): string => { const b = p.slice(p.lastIndexOf('/') + 1); const i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };

export const isImagePath = (p: string): boolean => extOf(p) in TYPES;
export const imageTypeOf = (p: string): string => TYPES[extOf(p)] ?? 'application/octet-stream';

/** Phần sau `|` của `![[ảnh|…]]`: `300` hoặc `300x200` là kích thước (px), còn lại là chữ thay thế. */
export function embedSize(s: string | undefined): { width?: number; height?: number; alt?: string } {
  if (s === undefined) return {};
  const m = /^\s*(\d{1,4})(?:\s*x\s*(\d{1,4}))?\s*$/.exec(s);
  if (!m) return { alt: s };
  const width = Number(m[1]);
  return m[2] ? { width, height: Number(m[2]) } : { width };
}

const starts = (b: Uint8Array, sig: number[], at = 0): boolean => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** Byte đầu khớp với đuôi file (ảnh raster), hoặc SVG an toàn. File đổi đuôi (vd HTML đặt tên .png) bị loại. */
export function safeImageBytes(path: string, b: Uint8Array): boolean {
  switch (extOf(path)) {
    case 'png': return starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && sane(dimsOf(b, 'png'));
    case 'jpg': case 'jpeg': return starts(b, [0xff, 0xd8, 0xff]) && sane(dimsOf(b, 'jpg'));
    case 'gif': return (starts(b, ascii('GIF87a')) || starts(b, ascii('GIF89a'))) && sane(dimsOf(b, 'gif'));
    case 'webp': return starts(b, ascii('RIFF')) && starts(b, ascii('WEBP'), 8) && sane(dimsOf(b, 'webp'));
    case 'avif': return starts(b, ascii('ftyp'), 4);
    case 'svg': return svgProblem(b) === null;
    default: return false;
  }
}

/** Trần số điểm ảnh: ảnh nhỏ về byte nhưng khai kích thước khổng lồ có thể làm cạn bộ nhớ khi giải mã. */
export const MAX_PIXELS = 100_000_000;
const sane = (d: { w: number; h: number } | null): boolean => d === null || (d.w > 0 && d.h > 0 && d.w * d.h <= MAX_PIXELS);
const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => (b[i] ?? 0) * 0x1000000 + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0);

/** Kích thước khai trong phần đầu file (PNG IHDR, GIF, JPEG SOF, WebP). `null` nếu không đọc được (không chặn vì lý do này). */
export function dimsOf(b: Uint8Array, kind: 'png' | 'jpg' | 'gif' | 'webp'): { w: number; h: number } | null {
  if (kind === 'png') return b.length >= 24 ? { w: u32be(b, 16), h: u32be(b, 20) } : null;
  if (kind === 'gif') return b.length >= 10 ? { w: u16le(b, 6), h: u16le(b, 8) } : null;
  if (kind === 'webp') {
    if (b.length < 30) return null;
    const t = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0);
    if (t === 'VP8X') return { w: u24le(b, 24) + 1, h: u24le(b, 27) + 1 };
    if (t === 'VP8L') { const v = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24); return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; }
    if (t === 'VP8 ') return { w: u16le(b, 26) & 0x3fff, h: u16le(b, 28) & 0x3fff };
    return null;
  }
  for (let i = 2; i + 9 < b.length;) { // JPEG: tìm marker SOF0..SOF15 (trừ C4, C8, CC)
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1] ?? 0;
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16be(b, i + 7), h: u16be(b, i + 5) };
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

/**
 * Lý do loại một SVG, hoặc `null` nếu giữ được. Không sửa SVG (sửa dễ sinh lỗi phân tích khác nhau), chỉ giữ hoặc bỏ:
 * bỏ mọi thứ có thể chạy mã hay tải gì từ ngoài khi người dùng mở ảnh trong tab riêng (script, `on…=`, foreignObject,
 * iframe/embed/object, `javascript:`, href ra ngoài, entity khai báo trong DOCTYPE, stylesheet XSL, `@import`, `url(` ra ngoài).
 * Trong trang, ảnh vault luôn hiển thị bằng `<img>` (SVG trong `<img>` không chạy script); kiểm này là lớp thứ hai.
 */
export function svgProblem(b: Uint8Array): string | null {
  if (b.includes(0)) return 'not UTF-8';
  let s: string;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return 'not UTF-8'; }
  if (!/<([^\s<>/:=]+:)?svg[\s>/]/i.test(s)) return 'not an SVG';
  // tiền tố namespace có thể là chữ ngoài ASCII (`<é:script>`): mọi luật nhận tiền tố bất kỳ, và tên thẻ có ký tự ngoài ASCII bị loại
  const P = String.raw`([^\s<>/:="']+:)?`;
  const rules: [RegExp, string][] = [
    [/<\/?[^\s<>/!?]*[^\x00-\x7f]/, 'non-ASCII element name'],
    [new RegExp(`<${P}(script|foreignObject|iframe|embed|object|handler|listener)\\b`, 'i'), 'script or embedded content'],
    [new RegExp(`[\\s"'/]${P}on[a-z]+\\s*=`, 'i'), 'event handler'],
    [/<!ENTITY|<!DOCTYPE[^>]{0,2000}\[/i, 'entity declaration'],
    [/<\?xml-stylesheet/i, 'stylesheet'],
    [/@import|@font-face|image-set|\bsrc\s*\(|\\/i, 'stylesheet import or CSS escape'],
    [/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:|&#/i, 'script link or encoded character'],
    [new RegExp(`\\b${P}href\\s*=\\s*(?!["']?\\s*#)`, 'i'), 'link outside the image'],
    [/url\(\s*(?!["']?\s*(#|data:image\/(png|jpe?g|gif|webp);))/i, 'resource outside the image'],
    [new RegExp(`attributeName\\s*=\\s*["']?\\s*${P}href`, 'i'), 'animated link'],
  ];
  for (const [re, why] of rules) if (re.test(s)) return why;
  return null;
}
