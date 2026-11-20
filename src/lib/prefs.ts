import { KEYS, writeString } from './storage';

export const still = (): boolean => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset['alive'] === 'calm'; } catch { return false; }
};
/** Theme áp dụng: lựa chọn đã lưu ('dark' | 'light') thắng; chưa lưu hoặc giá trị lạ thì theo hệ điều hành. Phải khớp script inline ở layouts/Base.astro. */
export const resolveTheme = (stored: string | null, osDark: boolean): 'dark' | 'light' =>
  stored === 'dark' || stored === 'light' ? stored : osDark ? 'dark' : 'light';
/** Theme áp dụng khi nhận sự kiện `storage` từ tab khác: khoá theme đổi thì theo giá trị mới; khoá bị xoá (newValue null) hoặc `localStorage.clear()` (khoá null) thì theo hệ điều hành; khoá khác thì bỏ qua (null). */
export const themeForStorageEvent = (changedKey: string | null, newValue: string | null, osDark: boolean): 'dark' | 'light' | null =>
  changedKey === null || changedKey === KEYS.theme ? resolveTheme(changedKey === null ? null : newValue, osDark) : null;
export const isDark = (): boolean => document.documentElement.dataset['theme'] === 'dark';
/** Bỏ lựa chọn đã lưu và theo hệ điều hành trở lại (chấm "theo hệ thống" hiện lại). */
export function followSystem(): void {
  try { localStorage.removeItem(KEYS.theme); } catch { /* bỏ qua */ }
  document.documentElement.dataset['theme'] = resolveTheme(null, matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset['themeSource'] = 'system';
}
export function setDark(dark: boolean): void {
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  document.documentElement.dataset['themeSource'] = 'chosen'; // lựa chọn của người dùng: bỏ chấm "theo hệ thống"
  writeString(KEYS.theme, dark ? 'dark' : 'light');
}
