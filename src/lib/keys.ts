/** Phím tắt toàn cục của app: phím đơn (ngoài ô nhập) và ⌘/Ctrl+/ (mở Palette ở mọi nơi, kể cả trong ô soạn). Hàm thuần. */
export type KeyAction = { type: 'search' } | { type: 'help' } | { type: 'theme' } | { type: 'focus' } | { type: 'escape' } | { type: 'none' };

export interface KeyEventLike { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; targetTag?: string }

/** `searchOpen` chặn phím chữ khi Palette đang mở. */
export function handleKey(e: KeyEventLike, searchOpen: boolean): { action: KeyAction; preventDefault: boolean } {
  const none = { action: { type: 'none' } as KeyAction, preventDefault: false };
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === '/') return searchOpen ? none : { action: { type: 'search' }, preventDefault: true };
  if (e.metaKey || e.ctrlKey || e.altKey) return none;
  const tag = e.targetTag;
  if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.key !== 'Escape') return none;
  if (e.key === 'Escape') return { action: { type: 'escape' }, preventDefault: false };
  if (searchOpen) return none;
  const k = e.key.toLowerCase();
  if (e.key === '?') return { action: { type: 'help' }, preventDefault: true };
  if (k === 'd') return { action: { type: 'theme' }, preventDefault: false };
  if (k === 'f') return { action: { type: 'focus' }, preventDefault: false };
  if (k === '/') return { action: { type: 'search' }, preventDefault: true };
  return none;
}
