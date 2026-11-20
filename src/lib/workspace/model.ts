/** Mô hình workspace: bản sao sửa được của một skill. Thuần, không DOM, không IndexedDB; mọi hàm trả đối tượng mới. */
import { strToU8, zipSync } from 'fflate';
import type { Vfs } from '../skills/types';
import { normalizePath } from '../skills/vfs';

/** Tổng dung lượng văn bản tối đa của một workspace. */
export const MAX_BYTES = 10 * 1024 * 1024; // chữ hiện tại; kho còn giữ một bản gốc nên dung lượng lưu tối đa ≈ gấp đôi

/** File văn bản. File nhị phân không mang byte nên không nằm ở đây mà ghi vào `skipped`. */
export interface WsFile { path: string; size: number; text: string }
/** Ảnh của vault: chỉ siêu dữ liệu, byte nằm ở kho ảnh của studio (`lib/studio/assets`, khoá `id`), không trong bản ghi này (bản ghi được ghi lại mỗi lần lưu). */
export interface WsImage { path: string; id: string; size: number; type: string }
export interface Workspace {
  id: string;
  name: string;
  /** `vault`: thư mục/zip Markdown mở để xuất site tĩnh (mục 2), chỉ giữ file Markdown. */
  origin: { kind: 'skill-copy' | 'vault'; label: string };
  createdAt: number;
  updatedAt: number;
  files: WsFile[];
  /** Ảnh chụp văn bản gốc: path → text, để tính trạng thái và diff. */
  base: Record<string, string>;
  /** File nhị phân (hoặc không đọc) của bản gốc: chỉ biết kích thước, không bao giờ giả vờ có nội dung. */
  skipped: { path: string; size: number; reason?: string }[];
  /** Vault: ảnh mang theo (mục ảnh vault). Không có ở bản sao skill. */
  images?: WsImage[];
}

export type WorkspaceErrorCode = 'bad-path' | 'exists' | 'missing' | 'too-big';
export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  constructor(code: WorkspaceErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
  }
}

const enc = new TextEncoder();
const byteLen = (s: string): number => enc.encode(s).length;
const byPath = (a: WsFile, b: WsFile): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function totalBytes(ws: Workspace): number {
  let n = 0;
  for (const f of ws.files) n += f.size;
  return n;
}

/** Ném `too-big` nếu tổng vượt giới hạn; trả lại chính `ws`. */
function guard(ws: Workspace): Workspace {
  if (totalBytes(ws) > MAX_BYTES) throw new WorkspaceError('too-big', `Workspace vượt ${MAX_BYTES / 1024 / 1024} MB`);
  return ws;
}

function cleanPath(p: string): string {
  const n = normalizePath(p);
  if (n === null) throw new WorkspaceError('bad-path', `Đường dẫn không hợp lệ: ${p}`);
  return n;
}
const has = (ws: Workspace, path: string): boolean => ws.files.some((f) => f.path === path);

export function fromVfs(vfs: Vfs, opts: { id: string; name: string; label: string; dir?: string; now: number; kind?: 'skill-copy' | 'vault' }): Workspace {
  const prefix = opts.dir ? opts.dir.replace(/\/+$/, '') + '/' : '';
  const files: WsFile[] = [];
  const skipped: { path: string; size: number }[] = [];
  const base: Record<string, string> = {};
  for (const [p, f] of vfs) {
    if (!p.startsWith(prefix)) continue;
    const rel = p.slice(prefix.length);
    if (!rel) continue;
    // U+FFFD: file không phải UTF-8 đã bị giải mã hỏng; sao chép sẽ làm hỏng nó khi xuất zip nên không sao chép
    if (f.binary || f.text === undefined || f.text.includes('\uFFFD') || (opts.kind === 'vault' && !/\.(md|markdown)$/i.test(rel))) { skipped.push({ path: rel, size: f.size }); continue; }
    files.push({ path: rel, size: byteLen(f.text), text: f.text });
    base[rel] = f.text;
  }
  files.sort(byPath);
  skipped.sort((a, b) => (a.path < b.path ? -1 : 1));
  return guard({ id: opts.id, name: opts.name, origin: { kind: opts.kind ?? 'skill-copy', label: opts.label }, createdAt: opts.now, updatedAt: opts.now, files, base, skipped });
}

export function setText(ws: Workspace, path: string, text: string, now: number): Workspace {
  if (!has(ws, path)) throw new WorkspaceError('missing', `Không có file: ${path}`);
  const files = ws.files.map((f) => (f.path === path ? { path, size: byteLen(text), text } : f));
  return guard({ ...ws, files, updatedAt: now });
}

export function addFile(ws: Workspace, path: string, text: string, now: number): Workspace {
  const p = cleanPath(path);
  if (has(ws, p)) throw new WorkspaceError('exists', `Đã có file: ${p}`);
  const files = [...ws.files, { path: p, size: byteLen(text), text }].sort(byPath);
  return guard({ ...ws, files, updatedAt: now });
}

export function renameFile(ws: Workspace, from: string, to: string, now: number): Workspace {
  const src = ws.files.find((f) => f.path === from);
  if (!src) throw new WorkspaceError('missing', `Không có file: ${from}`);
  const p = cleanPath(to);
  if (p === from) return ws;
  if (has(ws, p)) throw new WorkspaceError('exists', `Đã có file: ${p}`);
  const files = ws.files.map((f) => (f.path === from ? { ...f, path: p } : f)).sort(byPath);
  return guard({ ...ws, files, updatedAt: now });
}

export function removeFile(ws: Workspace, path: string, now: number): Workspace {
  if (!has(ws, path)) throw new WorkspaceError('missing', `Không có file: ${path}`);
  return { ...ws, files: ws.files.filter((f) => f.path !== path), updatedAt: now };
}

/** Đưa file đã sửa hoặc đã xoá về bản gốc. File mới thêm (không có trong base) thì `missing`. */
export function restoreFile(ws: Workspace, path: string, now: number): Workspace {
  const text = ws.base[path];
  if (text === undefined) throw new WorkspaceError('missing', `Không có bản gốc: ${path}`);
  const restored: WsFile = { path, size: byteLen(text), text };
  const files = has(ws, path) ? ws.files.map((f) => (f.path === path ? restored : f)) : [...ws.files, restored].sort(byPath);
  return guard({ ...ws, files, updatedAt: now });
}

export function statusOf(ws: Workspace): Map<string, 'modified' | 'added' | 'deleted'> {
  const out = new Map<string, 'modified' | 'added' | 'deleted'>();
  const seen = new Set<string>();
  for (const f of ws.files) {
    seen.add(f.path);
    const b = ws.base[f.path];
    if (b === undefined) out.set(f.path, 'added');
    else if (b !== f.text) out.set(f.path, 'modified');
  }
  for (const p of Object.keys(ws.base)) if (!seen.has(p)) out.set(p, 'deleted');
  return out;
}

/** Zip các file văn bản hiện tại (không gồm file nhị phân đã bỏ qua). */
export function toZip(ws: Workspace, rootName?: string): Uint8Array {
  const root = rootName ? rootName.replace(/^\/+|\/+$/g, '') + '/' : '';
  const entries: Record<string, Uint8Array> = {};
  for (const f of ws.files) entries[root + f.path] = strToU8(f.text);
  return zipSync(entries);
}
