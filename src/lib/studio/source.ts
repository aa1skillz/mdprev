/**
 * Tài liệu mở từ URL: đổi link GitHub về dạng raw, và viết lại link/ảnh tương đối trong HTML đã dựng
 * để bấm vào `./reference/x.md#anchor` mở đúng tài liệu đó (hoặc trang GitHub nếu không phải Markdown).
 * Chỉ hàm thuần, không đụng DOM, để test được.
 */

const GH = 'github.com';
const RAW = 'raw.githubusercontent.com';
const MD = /\.(md|markdown|mdx?)$/i;

export const isMarkdownPath = (path: string): boolean => MD.test(path);

/** `https://github.com/o/r/blob/ref/path.md` hoặc URL raw hoặc URL .md bất kỳ -> URL raw để fetch. Không hợp lệ thì null. */
export function toRawUrl(input: string): string | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname === GH) {
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
    if (!m || m[1] === '.' || m[1] === '..' || m[2] === '.' || m[2] === '..') return null;
    return `https://${RAW}/${m[1]}/${m[2]}/${m[3]}`;
  }
  if (u.hostname === RAW) return u.origin + u.pathname;
  return isMarkdownPath(u.pathname) ? u.origin + u.pathname + u.search : null;
}

/** URL raw -> trang xem tương ứng trên GitHub (blob cho file, tree cho thư mục kết thúc bằng `/`). Nguồn khác giữ nguyên. */
export function toViewUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { return raw; }
  if (u.hostname !== RAW) return raw;
  const parts = u.pathname.split('/').filter(Boolean); // owner, repo, ref, ...path
  if (parts.length < 3) return raw;
  const [owner, repo, ref, ...rest] = parts;
  const kind = u.pathname.endsWith('/') ? 'tree' : 'blob';
  return `https://${GH}/${owner}/${repo}/${kind}/${ref}${rest.length ? '/' + rest.join('/') : ''}${u.pathname.endsWith('/') && rest.length ? '/' : ''}${u.hash}`;
}

/** Nhãn ngắn của nguồn, vd `anthropics/skills · skills/mcp-builder/SKILL.md`. */
export function sourceLabel(raw: string): string {
  try {
    const u = new URL(raw);
    const p = u.pathname.split('/').filter(Boolean);
    if (u.hostname === RAW && p.length >= 4) return `${p[0]}/${p[1]} · ${p.slice(3).join('/')}`;
    return u.hostname + u.pathname;
  } catch { return raw; }
}

export const fileNameFromUrl = (raw: string): string => {
  try { return decodeURIComponent(new URL(raw).pathname.split('/').filter(Boolean).pop() ?? 'document.md'); } catch { return 'document.md'; }
};

const isRelative = (v: string): boolean => !!v && !v.startsWith('#') && !v.startsWith('//') && !/^[a-z][a-z0-9+.-]*:/i.test(v);

export interface LinkTarget { href: string; md: string | null }

/** Link tương đối so với `base` (URL raw của tài liệu hiện tại): trang để mở và, nếu là Markdown, URL raw để tải vào studio. */
export function resolveLink(href: string, base: string): LinkTarget | null {
  if (!isRelative(href)) return null;
  let abs: URL;
  try { abs = new URL(href, base); } catch { return null; }
  if (abs.protocol !== 'https:' && abs.protocol !== 'http:') return null;
  const md = isMarkdownPath(abs.pathname) ? abs.origin + abs.pathname + abs.search : null;
  return { href: toViewUrl(abs.href), md: md ? md + abs.hash : null };
}

/** Ảnh tương đối -> URL tuyệt đối theo base (raw). */
export function resolveAsset(src: string, base: string): string | null {
  if (!isRelative(src)) return null;
  try { return new URL(src, base).href; } catch { return null; }
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const unattr = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x26;|&amp;/g, '&');

/**
 * Viết lại link và ảnh tương đối trong HTML do pipeline sinh (thuộc tính luôn nháy kép).
 * Link Markdown thêm `data-md="<raw>#anchor"` để studio chặn và tải; mọi link đều có target=_blank để nơi không chặn (pop-out, bản xuất) mở tab mới.
 */
export function rewriteHtml(html: string, base: string | null): string {
  if (!base) return html;
  return html
    .replace(/<a ([^>]*?)href="([^"]*)"([^>]*)>/g, (all, pre: string, href: string, post: string) => {
      const t = resolveLink(unattr(href), base);
      if (!t) return all;
      const extra = (t.md ? ` data-md="${attr(t.md)}"` : '') + ' target="_blank" rel="noopener noreferrer"';
      return `<a ${pre}href="${attr(t.href)}"${extra}${post}>`;
    })
    .replace(/<img ([^>]*?)src="([^"]*)"([^>]*)>/g, (all, pre: string, src: string, post: string) => {
      const r = resolveAsset(unattr(src), base);
      return r ? `<img ${pre}src="${attr(r)}"${post}>` : all;
    });
}
