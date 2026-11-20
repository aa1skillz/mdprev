/** Workspace đang mở, lưu đồng bộ ở localStorage (đọc được từ script đầu trang). Bị chặn (private mode) thì bỏ qua. */
export const ACTIVE_KEY = 'mdprev-ws';

export function getActiveId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}
export function setActiveId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_KEY); else localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* bị chặn: bỏ qua */ }
}

export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
