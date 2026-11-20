/** Lưu workspace vào IndexedDB. Tra `indexedDB` lười lúc gọi; không có hoặc bị chặn thì reject `storage-unavailable`, không treo. */
import type { Workspace } from './model';

const DB = 'mdprev';
const STORE = 'workspaces';
const unavailable = (): Error => new Error('storage-unavailable');

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!idb) { reject(unavailable()); return; }
    let req: IDBOpenDBRequest;
    try { req = idb.open(DB, 1); } catch { reject(unavailable()); return; }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(unavailable());
    req.onblocked = () => reject(unavailable());
  });
}

let conn: Promise<IDBDatabase> | null = null;
/** Một kết nối dùng chung: mỗi lần ghi không phải mở lại DB (quan trọng khi ghi gấp lúc đóng tab). */
function db(): Promise<IDBDatabase> {
  conn ??= open().then((d) => { d.onclose = () => { conn = null; }; d.onversionchange = () => { d.close(); conn = null; }; return d; }, (e) => { conn = null; throw e; });
  return conn;
}
/** Chỉ cho test: bỏ kết nối đang giữ (mỗi test dùng một IndexedDB giả mới). */
export function resetConnection(): void { conn = null; }

/** Chạy một request trong một transaction trên kết nối dùng chung. */
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      let result: T;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? unavailable());
      tx.onabort = () => reject(tx.error ?? unavailable());
    });
  } catch (e) { if (e instanceof DOMException && e.name === 'InvalidStateError') conn = null; throw e; }
}

export interface WorkspaceSummary { id: string; name: string; updatedAt: number; fileCount: number }

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const all = await run<Workspace[]>('readonly', (s) => s.getAll());
  return all
    .map((w) => ({ id: w.id, name: w.name, updatedAt: w.updatedAt, fileCount: w.files.length }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  return (await run<Workspace | undefined>('readonly', (s) => s.get(id))) ?? undefined;
}
export async function putWorkspace(ws: Workspace): Promise<void> {
  await run('readwrite', (s) => s.put(ws));
}
export async function deleteWorkspace(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

/** id ảnh mà các workspace đang lưu còn dùng: ảnh của vault và ảnh dán (`asset:<id>`) trong chữ của mọi file. */
export async function imageIdsInUse(): Promise<Set<string>> {
  const all = await run<Workspace[]>('readonly', (s) => s.getAll());
  const ids = new Set(all.flatMap((w) => (w.images ?? []).map((i) => i.id)));
  for (const w of all) for (const f of w.files) for (const m of f.text.matchAll(/\(asset:([a-z0-9]+\.[a-z0-9]+)/g)) ids.add(m[1]!);
  return ids;
}
