/**
 * Chặn ảnh từ máy chủ ngoài trong HTML đã dựng (dùng cho tài liệu mở từ link chia sẻ).
 * Tải ảnh ngoài để lộ IP và thời điểm đọc cho chủ máy chủ đó, nên chỉ tải khi người dùng cho phép.
 * Ảnh trong máy (blob:, data:, asset:) và ảnh tương đối không bị đụng tới.
 */
const EXT = /^\s*(?:https?:)?\/\//i;
/** Một thuộc tính: tên, rồi giá trị trong "…", '…' hoặc không ngoặc. Quét tuần tự nên chữ nằm trong giá trị không bị coi là thuộc tính. */
const ATTRS = /\s*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gy;

function attrs(tag: string): Map<string, string> {
  const m = new Map<string, string>();
  const body = tag.replace(/^<img\b/i, '').replace(/\/?>$/, '');
  ATTRS.lastIndex = 0;
  let r: RegExpExecArray | null;
  while (ATTRS.lastIndex < body.length && (r = ATTRS.exec(body))) {
    if (r[0] === '') break;
    const k = r[1]!.toLowerCase();
    if (!m.has(k)) m.set(k, r[2] ?? r[3] ?? r[4] ?? ''); // trình duyệt lấy thuộc tính xuất hiện đầu tiên
  }
  return m;
}
const text = (s: string) => s.replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Thay mọi `<img>` trỏ ra ngoài bằng một ô giữ chỗ (span), giữ địa chỉ trong `data-ext-src`. */
export function blockExternalImages(html: string): { html: string; blocked: number } {
  let blocked = 0;
  const out = html.replace(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
    const a = attrs(tag);
    const src = a.get('src') ?? null;
    const srcset = a.get('srcset') ?? null;
    const ext = (src !== null && EXT.test(src)) || (srcset !== null && srcset.split(',').some((c) => EXT.test(c)));
    if (!ext) return tag;
    blocked++;
    const alt = a.get('alt') ?? '';
    let host = '';
    try { host = new URL(src ?? '', 'https://x.invalid').host; } catch { /* bỏ qua */ }
    const label = alt ? `Image blocked: ${alt}` : `Image blocked${host && host !== 'x.invalid' ? ' from ' + host : ''}`;
    return `<span class="md-img-blocked" role="img" aria-label="${text(label)}" data-ext-src="${text(src ?? '')}">${text(label)}</span>`;
  });
  return { html: out, blocked };
}
