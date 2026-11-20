/** Kênh sự kiện nhẹ giữa các island (và script), qua window. */
export type BusType =
  | 'key' | 'help' | 'search' | 'search-state' | 'theme' | 'copy-fallback' | 'meow' | 'cat' | 'focus' | 'cd' | 'toast' | 'card' | 'fish' | 'studio' | 'ws-new' | 'theme-system';
export interface BusEvent<T = unknown> { type: BusType; detail?: T | undefined }
const NAME = 'mdprev:bus';
export const emit = <T = unknown>(type: BusType, detail?: T): void => { window.dispatchEvent(new CustomEvent<BusEvent<T>>(NAME, { detail: { type, detail } })); };
export function on<T = unknown>(type: BusType, fn: (detail: T) => void): () => void {
  const h = (e: Event) => { const d = (e as CustomEvent<BusEvent<T>>).detail; if (d.type === type) fn(d.detail as T); };
  window.addEventListener(NAME, h);
  return () => window.removeEventListener(NAME, h);
}
