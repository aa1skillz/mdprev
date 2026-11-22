/**
 * Kho nhật ký undo (IndexedDB, chỉ ở máy này, không gửi đi đâu). DB RIÊNG `mdprev-md-undo` (không đụng DB tab/lịch sử/workspace
 * nên rollback về bản cũ vẫn an toàn). Khoá = id tab. Bản ghi chứa các đoạn chữ vừa gõ/xoá: xoá khi tab bị gỡ hẳn (`pruneUndo`).
 */
import type { UndoRec } from './undo-log';

const DB = 'mdprev-md-undo', STORE = 'logs';
const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = <T,>(mode: IDBTransactionMode, f: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> => open().then((db) => new Promise<T>((res, rej) => {
  const t = db.transaction(STORE, mode); const rq = f(t.objectStore(STORE));
  t.oncomplete = () => { db.close(); res(rq.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error); };
}));

export const putUndo = (id: string, rec: UndoRec): Promise<unknown> => tx('readwrite', (s) => s.put(rec, id));
export const getUndo = (id: string): Promise<UndoRec | undefined> => tx<UndoRec | undefined>('readonly', (s) => s.get(id) as IDBRequest<UndoRec | undefined>);
export const deleteUndo = (id: string): Promise<unknown> => tx('readwrite', (s) => s.delete(id));
/** Xoá nhật ký của mọi tab không còn trong `keep` (tab đang mở + tab trong ngăn "đóng gần đây"). */
export const pruneUndo = async (keep: Set<string>): Promise<void> => {
  const all = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).catch(() => [] as IDBValidKey[]);
  await Promise.all(all.filter((k) => typeof k === 'string' && !keep.has(k)).map((k) => deleteUndo(k as string).catch(() => undefined)));
};
