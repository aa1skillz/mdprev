import { describe, expect, it } from 'vitest';
import { resolveTheme, themeForStorageEvent } from '../src/lib/prefs';

describe('resolveTheme', () => {
  it('đã lưu dark thắng hệ điều hành sáng', () => { expect(resolveTheme('dark', false)).toBe('dark'); });
  it('đã lưu light thắng hệ điều hành tối', () => { expect(resolveTheme('light', true)).toBe('light'); });
  it('chưa lưu thì theo hệ điều hành', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });
  it('giá trị lạ hoặc rỗng coi như chưa lưu', () => {
    expect(resolveTheme('', true)).toBe('dark');
    expect(resolveTheme('sepia', false)).toBe('light');
  });
});

describe('themeForStorageEvent', () => {
  it('khoá theme đổi sang dark/light thì áp đúng giá trị đó', () => {
    expect(themeForStorageEvent('mdprev-theme', 'dark', false)).toBe('dark');
    expect(themeForStorageEvent('mdprev-theme', 'light', true)).toBe('light');
  });
  it('khoá theme bị xoá thì quay về theo hệ điều hành', () => {
    expect(themeForStorageEvent('mdprev-theme', null, true)).toBe('dark');
    expect(themeForStorageEvent('mdprev-theme', null, false)).toBe('light');
  });
  it('localStorage.clear() (khoá null) cũng quay về theo hệ điều hành', () => {
    expect(themeForStorageEvent(null, null, true)).toBe('dark');
  });
  it('khoá khác thì bỏ qua', () => {
    expect(themeForStorageEvent('mdprev-md', 'x', true)).toBeNull();
  });
});
