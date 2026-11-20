/**
 * Dán HTML thành Markdown. Chỉ chuyển khi nội dung clipboard có cấu trúc thật (tiêu đề, danh sách, liên kết, nhấn mạnh, code, trích dẫn, ảnh, bảng).
 * HTML chỉ gồm div/span có style (VS Code, terminal, ô soạn) thì để trình duyệt dán chữ thường.
 * turndown nạp lười: trang soạn không tải nó cho tới khi cần.
 */

const STRUCT = 'h1,h2,h3,h4,h5,h6,ul,ol,li,a[href],strong,em,i,pre,code,blockquote,img,table';

/** Phân tích và dọn HTML của clipboard; trả null nếu không có gì đáng chuyển. Đồng bộ (phải chạy trong sự kiện paste). */
export function cleanClipboardHtml(html: string): Document | null {
  if (!html || html.length > 2_000_000) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,meta,title,link,noscript,template,svg,iframe').forEach((n) => n.remove());
  // Google Docs bọc mọi thứ trong <b id="docs-internal-guid-…" style="font-weight:normal">
  doc.querySelectorAll('b[id^="docs-internal-guid"]').forEach((b) => b.replaceWith(...Array.from(b.childNodes)));
  // thẻ nhấn mạnh do trình duyệt chèn để nói "không đậm"
  doc.querySelectorAll<HTMLElement>('b,strong').forEach((b) => { if (/font-weight:\s*(normal|400)/i.test(b.getAttribute('style') ?? '')) b.replaceWith(...Array.from(b.childNodes)); });
  return doc.body.querySelector(STRUCT) ? doc : null;
}

/** Kết quả có thật sự là Markdown có cấu trúc không (turndown trả chữ trơn thì dùng chữ gốc). */
export function looksLikeMarkdown(md: string): boolean {
  return /^(#{1,6} |[-*+] |\d+\. |> |```|\|.*\|)/m.test(md) || /\]\([^)]+\)|\*\*[^*]+\*\*|(^|[^*])\*[^*\s][^*]*\*|`[^`]+`|!\[/.test(md);
}

interface Svc { use(p: unknown): void; turndown(n: Node | string): string }
interface Lib { Td: new (o: object) => Svc; gfm: unknown }
let lib: Promise<Lib> | null = null;
function load(): Promise<Lib> {
  lib ??= Promise.all([import('turndown'), import('turndown-plugin-gfm')]).then(([td, g]) => ({ Td: ((td as { default?: unknown }).default ?? td) as Lib['Td'], gfm: ((g as { gfm?: unknown; default?: { gfm?: unknown } }).gfm ?? (g as { default?: { gfm?: unknown } }).default?.gfm) as unknown })).catch((e) => { lib = null; throw e; });
  return lib;
}
/** Gọi sớm (khi ô soạn có focus) để lần dán đầu tiên không bị khựng. */
export function preloadTurndown(): void { load().catch(() => undefined); }

export function tidy(md: string): string {
  return md.replace(/ /g, ' ').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** HTML đã dọn → Markdown, hoặc null nếu kết quả không có cấu trúc Markdown. */
export async function htmlToMarkdown(doc: Document | string): Promise<string | null> {
  const { Td, gfm } = await load();
  const svc = new Td({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---' });
  svc.use(gfm);
  const md = tidy(svc.turndown(typeof doc === 'string' ? doc : doc.body));
  return md && looksLikeMarkdown(md) ? md : null;
}
