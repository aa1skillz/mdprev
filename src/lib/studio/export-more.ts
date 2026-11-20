/**
 * Lớp nối trình duyệt cho các định dạng xuất nạp lười: EPUB, TextPack, LaTeX; và nhập lại TextPack.
 * Chỉ được import động từ studio khi người dùng bấm (ngân sách JS của core). Hàm của assets/export do studio truyền vào:
 * import tĩnh ở đây làm Rollup tách chúng khỏi chunk của studio thành chunk riêng (tốn thêm byte và một request ở lần tải đầu).
 */
import type * as Assets from './assets';
import { EPUB_CSS, buildEpub, epubBodyFromHtml } from './epub';
import { buildTextPack, parseTextPack } from './textbundle';

export type MoreKind = 'epub' | 'textpack' | 'tex';
export interface MoreOut { name: string; type: string; data: Uint8Array | string; note?: string | undefined }

async function fetchImage(u: string, base: string | null): Promise<{ data: Uint8Array; type: string } | null> {
  const abs = base && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? new URL(u, base).href : u;
  if (!/^https?:/i.test(abs)) return null;
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(abs, { mode: 'cors', credentials: 'omit', signal: ctl.signal });
    if (!r.ok) return null;
    const b = await r.blob();
    return { data: new Uint8Array(await b.arrayBuffer()), type: b.type.split(';')[0]!.trim() };
  } catch { return null; } finally { clearTimeout(tm); }
}

/** randomUUID chỉ có ở nơi an toàn (HTTPS/localhost); bản xem HTTP dùng getRandomValues. */
const uuid = (): string => { const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6]! & 15) | 64; b[8] = (b[8]! & 63) | 128; const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const fmValue = (src: string, key: string): string | undefined => {
  const fm = /^---[ \t]*\n([\s\S]*?)\n---/.exec(src)?.[1];
  const v = fm && new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm)?.[1];
  return v ? v.trim().replace(/^(['"])(.*)\1$/, '$2') : undefined;
};

export interface MoreDeps { cleanHtml: (h: string) => string; inlineAssets: typeof Assets.inlineAssets; assetBlob: typeof Assets.assetBlob; refsIn: typeof Assets.refsIn; mermaidSvg: (source: string) => Promise<string | null> }

export async function exportMore(k: MoreKind, o: { src: string; html: string; title: string; base: string | null; stem: string }, d: MoreDeps): Promise<MoreOut> {
  if (k === 'tex') {
    const { toLatex } = await import('./latex');
    const r = toLatex(o.src, { title: o.title });
    return { name: o.stem + '.tex', type: 'application/x-tex', data: r.tex, note: r.notes.length ? r.notes.join(' · ') : undefined };
  }
  if (k === 'textpack') {
    const ids = [...d.refsIn(o.src)];
    const assets = (await Promise.all(ids.map(async (id) => { const b = await d.assetBlob(id); return b ? { id, data: new Uint8Array(await b.arrayBuffer()) as Uint8Array } : null; }))).filter((a): a is { id: string; data: Uint8Array } => a !== null);
    return { name: o.stem + '.textpack', type: 'application/zip', data: buildTextPack(o.src, o.stem, assets) };
  }
  const html = await d.inlineAssets(d.cleanHtml(o.html));
  const sources = [...o.src.matchAll(/^(`{3,}|~{3,})mermaid[^\n]*\n([\s\S]*?)\n\1[ \t]*$/gm)].map((m) => m[2] ?? '');
  const diagram = async (i: number) => {
    const s = sources[i]; if (s === undefined) return null;
    const { svgForDocx } = await import('./raster');
    const svg = await d.mermaidSvg(s);
    const png = svg ? await svgForDocx(svg) : null;
    return png ? { data: png.data, type: 'image/png' } : null;
  };
  const { body, images, toc } = await epubBodyFromHtml(html, (u) => fetchImage(u, o.base), diagram);
  const lost = (body.match(/<span>\[[^\]]*\]<\/span>/g) ?? []).length;
  // ngôn ngữ sách: front matter `lang:` (vd. vi), mặc định en
  const data = buildEpub({
    title: o.title, lang: /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(fmValue(o.src, 'lang') ?? '') ? fmValue(o.src, 'lang')! : 'en', author: fmValue(o.src, 'author'), id: 'urn:uuid:' + uuid(),
    modified: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), body, css: EPUB_CSS, images, toc,
  });
  return { name: o.stem + '.epub', type: 'application/epub+zip', data, note: lost ? `${lost} image${lost > 1 ? 's' : ''} could not be embedded` : undefined };
}

/** Mở một .textpack: ảnh vào kho ảnh của trình duyệt, `assets/x` thành `asset:<id>`. Null nếu không phải TextPack. */
export async function importTextPack(bytes: Uint8Array, putAsset: typeof Assets.putAsset): Promise<string | null> {
  const p = parseTextPack(bytes);
  if (!p) return null;
  let md = p.md;
  for (const a of p.assets) {
    const id = await putAsset(new Blob([a.data as BlobPart], { type: a.type }), a.path.split('/').pop() ?? 'image');
    if (!id) continue;
    const enc = a.path.split('/').map(encodeURIComponent).join('/');
    for (const ref of new Set([a.path, enc])) md = md.split(`(${ref}`).join(`(asset:${id}`).split(`"${ref}"`).join(`"asset:${id}"`);
  }
  return md;
}
