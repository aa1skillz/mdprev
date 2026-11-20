/**
 * Ảnh dán hoặc kéo thả vào studio: lưu trong IndexedDB của trình duyệt, tài liệu chỉ ghi `![alt](asset:<id>)`.
 * Bản xem đổi `asset:<id>` thành blob URL; bản xuất HTML và chép HTML/rich text nhúng thẳng dữ liệu (data URI).
 * Không có server nào nhận ảnh. Mọi hàm nuốt lỗi: không có IndexedDB thì không dán ảnh được, trang vẫn chạy.
 */

const DB = 'mdprev-md-assets';
const STORE = 'files';
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

interface Rec { id: string; type: string; name: string; blob: Blob; t: number }

let dbp: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: 'id' }); };
      rq.onsuccess = () => { rq.result.onversionchange = () => rq.result.close(); resolve(rq.result); };
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
const req = <T,>(r: IDBRequest<T>) => new Promise<T | null>((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });

/** Ảnh có được nhận không (đúng loại, không quá lớn). */
export const isImage = (f: { type: string; size: number }): boolean => f.type in EXT && f.size <= MAX_ASSET_BYTES;

/** Chữ thay thế từ tên file: bỏ đuôi, gạch nối/gạch dưới thành dấu cách. Ảnh chụp màn hình không tên thì `image`. */
export function altFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/[[\]()]/g, '').trim();
  return base && base.toLowerCase() !== 'image' ? base : 'image';
}

async function hashId(blob: Blob, type: string): Promise<string> {
  const ext = EXT[type] ?? 'bin';
  try {
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(buf).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('') + '.' + ext;
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
  }
}

/** Lưu ảnh, trả id (cùng nội dung thì cùng id, không lưu hai lần). Null nếu không lưu được. */
export async function putAsset(file: Blob, name: string): Promise<string | null> {
  if (!isImage(file)) return null;
  const db = await open(); if (!db) return null;
  try {
    const id = await hashId(file, file.type);
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, type: file.type, name, blob: file, t: Date.now() } satisfies Rec);
    const ok = await new Promise<boolean>((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); });
    if (ok) urls.set(id, URL.createObjectURL(file));
    return ok ? id : null;
  } catch { return null; }
}

/** Dữ liệu một ảnh đã lưu (cho xuất DOCX). */
export async function assetBlob(id: string): Promise<Blob | null> { return (await getAsset(id))?.blob ?? null; }

async function getAsset(id: string): Promise<Rec | null> {
  const db = await open(); if (!db) return null;
  try { return await req(db.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<Rec>); } catch { return null; }
}

const urls = new Map<string, string>(); // id -> blob URL (sống tới khi đóng trang; cùng origin nên cửa sổ pop-out dùng được)
const ASSET = /src="asset:([a-z0-9]+\.[a-z0-9]+)"/g;
export const idsIn = (html: string): string[] => [...new Set([...html.matchAll(ASSET)].map((m) => m[1]!))];
export const hasAssets = (s: string): boolean => /\]\(asset:|src="asset:/.test(s);

/** Nạp sẵn blob URL cho mọi ảnh `asset:` trong HTML, để `withAssetUrls` sau đó chạy đồng bộ. */
export async function prepareAssets(html: string): Promise<void> {
  if (!html.includes('asset:')) return;
  await Promise.all(idsIn(html).filter((id) => !urls.has(id)).map(async (id) => {
    const r = await getAsset(id);
    if (r) urls.set(id, URL.createObjectURL(r.blob));
  }));
}

/** Đổi `asset:<id>` thành blob URL đã nạp. Ảnh không còn trong trình duyệt này thì giữ nguyên và đánh dấu `data-missing`. */
export function withAssetUrls(html: string): string {
  if (!html.includes('asset:')) return html;
  return html.replace(ASSET, (all, id: string) => { const u = urls.get(id); return u ? `src="${u}" data-asset="${id}"` : `${all} data-missing=""`; });
}

const toDataUri = (blob: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(''); r.readAsDataURL(blob); });

/** Cho bản xuất: thay blob URL (hoặc `asset:`) bằng data URI để file .html hay HTML đã chép đứng riêng được. */
export async function inlineAssets(html: string): Promise<string> {
  const re = /src="(?:blob:[^"]+" data-asset="|asset:)([a-z0-9]+\.[a-z0-9]+)"/g;
  const ids = [...new Set([...html.matchAll(re)].map((m) => m[1]!))];
  if (!ids.length) return html;
  const data = new Map<string, string>();
  await Promise.all(ids.map(async (id) => { const r = await getAsset(id); if (r) data.set(id, await toDataUri(r.blob)); }));
  return html.replace(re, (all, id: string) => { const d = data.get(id); return d ? `src="${d}"` : all; });
}

export interface AssetInfo { id: string; type: string; name: string; size: number; t: number }

/** Mọi ảnh đã lưu (không kèm dữ liệu), mới nhất trước. Null nếu không có IndexedDB. */
export async function listAssets(): Promise<AssetInfo[] | null> {
  const db = await open(); if (!db) return null;
  try {
    const all = await req(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<Rec[]>);
    return (all ?? []).map((r) => ({ id: r.id, type: r.type, name: r.name, size: r.blob.size, t: r.t })).sort((a, b) => b.t - a.t);
  } catch { return null; }
}

/** Blob URL của một ảnh (nạp nếu chưa có), cho ô xem trước trong ngăn Images. */
export async function assetUrl(id: string): Promise<string | null> {
  const u = urls.get(id); if (u) return u;
  const r = await getAsset(id); if (!r) return null;
  const nu = URL.createObjectURL(r.blob); urls.set(id, nu); return nu;
}

/** Xoá ảnh và thu hồi blob URL của chúng. */
export async function deleteAssets(ids: string[]): Promise<boolean> {
  const db = await open(); if (!db || !ids.length) return false;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    ids.forEach((id) => tx.objectStore(STORE).delete(id));
    const ok = await new Promise<boolean>((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); });
    if (ok) ids.forEach((id) => { const u = urls.get(id); if (u) URL.revokeObjectURL(u); urls.delete(id); });
    return ok;
  } catch { return false; }
}

/** id ảnh được nhắc tới trong một văn bản Markdown. */
export const refsIn = (md: string): Set<string> => new Set([...md.matchAll(/\(asset:([a-z0-9]+\.[a-z0-9]+)/g)].map((m) => m[1]!));
