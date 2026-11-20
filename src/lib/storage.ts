/** Khóa localStorage có kiểu. Chỉ gọi trong island/script phía trình duyệt, không gọi lúc build. */
export const KEYS = {
  theme: 'mdprev-theme',
  md: 'mdprev-md',
  mdName: 'mdprev-md-name',
  mdPrev: 'mdprev-md-prev',
  mdSpell: 'mdprev-md-spell',
  mdWide: 'mdprev-md-wide',
  mdWrap: 'mdprev-md-wrap',
  mdSplit: 'mdprev-md-split',
  mdSync: 'mdprev-md-sync',
  mdCursor: 'mdprev-md-cursor',
  mdBase: 'mdprev-md-base',
  mdUi: 'mdprev-md-ui',
  insp: 'mdprev-insp',
  inspTab: 'mdprev-insp-tab',
  inspSkill: 'mdprev-insp-skill',
  inspTabSkill: 'mdprev-insp-tab-skill',
  mdZen: 'mdprev-md-zen',
  mdDoc: 'mdprev-md-doc',
  mdAuth: 'mdprev-md-authorship',
  mdExtBlock: 'mdprev-md-extblock',
  inspectRecent: 'mdprev-inspect-recent',
  welcomed: 'mdprev-welcomed',
} as const;
export type StorageKey = (typeof KEYS)[keyof typeof KEYS];

export function readJson<T>(key: StorageKey, fallback: T): T {
  try { const v = localStorage.getItem(key); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
}
export function writeJson(key: StorageKey, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bị chặn: bỏ qua */ }
}
/** Như `writeString` nhưng cho biết có ghi được không (bộ nhớ đầy hoặc bị chặn thì false), để báo người dùng thay vì im lặng mất dữ liệu. */
export function writeStringOk(key: StorageKey, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
export function readString(key: StorageKey): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeString(key: StorageKey, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* bị chặn: bỏ qua */ }
}

export function removeKey(key: StorageKey): void { try { localStorage.removeItem(key); } catch { /* bị chặn: bỏ qua */ } }
