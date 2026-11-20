/** Lịch sử bản chụp tài liệu trong IndexedDB. Mọi hàm đều nuốt lỗi: không có IndexedDB thì tính năng tắt, trang vẫn chạy. */

export interface Snap { id: number; t: number; reason: string; name: string; size: number; lines: number; text: string }

const DB = 'mdprev-md-history';
const STORE = 'snaps';
export const MAX_SNAPS = 20;
export const MAX_SNAP_CHARS = 2_000_000;

let dbp: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
      rq.onsuccess = () => { rq.result.onversionchange = () => rq.result.close(); resolve(rq.result); };
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

const done = (tx: IDBTransaction) => new Promise<boolean>((res) => { tx.oncomplete = () => res(true); tx.onerror = () => res(false); tx.onabort = () => res(false); });
const req = <T,>(r: IDBRequest<T>) => new Promise<T | null>((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });

export async function listSnapshots(): Promise<Snap[] | null> {
  const db = await open(); if (!db) return null;
  try {
    const all = await req(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<Snap[]>);
    return all ? all.sort((x, y) => y.id - x.id) : null;
  } catch { return null; }
}

/** Thêm bản chụp. Bỏ qua nếu rỗng, quá lớn, hoặc giống hệt bản mới nhất. Giữ tối đa MAX_SNAPS bản. */
export async function addSnapshot(text: string, reason: string, name: string): Promise<boolean> {
  if (!text.trim() || text.length > MAX_SNAP_CHARS) return false;
  const db = await open(); if (!db) return false;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const keys = (await req(st.getAllKeys())) as number[] | null;
    if (keys?.length) { const last = await req(st.get(Math.max(...keys)) as IDBRequest<Snap>); if (last?.text === text) return false; }
    st.add({ t: Date.now(), reason, name, size: text.length, lines: text.split('\n').length, text });
    if (keys && keys.length + 1 > MAX_SNAPS) [...keys].sort((x, y) => x - y).slice(0, keys.length + 1 - MAX_SNAPS).forEach((k) => st.delete(k));
    return await done(tx);
  } catch { return false; }
}

export async function deleteSnapshot(id: number): Promise<void> {
  const db = await open(); if (!db) return;
  try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); await done(tx); } catch { /* bỏ qua */ }
}
