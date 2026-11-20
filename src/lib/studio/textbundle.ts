/**
 * TextPack (.textpack): zip của thư mục `<tên>.textbundle/` gồm `info.json`, `text.md`, `assets/` (textbundle.org, v2).
 * Ảnh dán trong studio (`asset:<id>`) thành `assets/<id>`; nhập lại thì ngược lại. Phần thuần, không DOM.
 */
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

export interface PackAsset { path: string; type: string; data: Uint8Array }
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
const MAX_TOTAL = 64 * 1024 * 1024; // giới hạn sau giải nén: một file độc không làm đầy bộ nhớ

export const typeOfPath = (p: string): string | undefined => TYPES[(/\.([a-z0-9]+)$/i.exec(p)?.[1] ?? '').toLowerCase()];

export function buildTextPack(md: string, name: string, assets: { id: string; data: Uint8Array }[]): Uint8Array {
  const dir = (name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'untitled') + '.textbundle/';
  const info = { version: 2, type: 'net.daringfireball.markdown', transient: false, creatorIdentifier: 'space.mdprev' };
  const files: Zippable = {
    [dir + 'info.json']: strToU8(JSON.stringify(info, null, 2)),
    [dir + 'text.md']: strToU8(md.replace(/\(asset:([a-z0-9]+\.[a-z0-9]+)/g, '(assets/$1')),
  };
  for (const a of assets) files[dir + 'assets/' + a.id] = [a.data, { level: 0 }]; // ảnh đã nén sẵn
  return zipSync(files);
}

/** Null nếu không phải TextPack (không có text.* cạnh info.json hay ở gốc) hoặc quá lớn. */
export function parseTextPack(bytes: Uint8Array): { md: string; assets: PackAsset[] } | null {
  let files: Record<string, Uint8Array>;
  let total = 0;
  try {
    files = unzipSync(bytes, { filter: (f) => { total += f.originalSize; return total <= MAX_TOTAL && !f.name.endsWith('/'); } });
  } catch { return null; }
  if (total > MAX_TOTAL) return null;
  const names = Object.keys(files).filter((n) => !n.startsWith('__MACOSX/'));
  const text = names.filter((n) => /(^|\/)text\.(md|markdown|txt)$/i.test(n)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (!text) return null;
  const root = text.slice(0, text.lastIndexOf('/') + 1);
  let md: string;
  try { md = new TextDecoder('utf-8', { fatal: true }).decode(files[text]); } catch { return null; }
  const assets: PackAsset[] = [];
  for (const n of names) {
    if (!n.startsWith(root + 'assets/')) continue;
    const type = typeOfPath(n);
    if (type) assets.push({ path: n.slice(root.length), type, data: files[n]! });
  }
  return { md, assets };
}
