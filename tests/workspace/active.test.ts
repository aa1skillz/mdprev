import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_KEY, getActiveId, newId, setActiveId } from '../../src/lib/workspace/active';

/** Vitest chạy ở môi trường node: dựng localStorage giả bằng stubGlobal. */
const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
afterEach(() => vi.unstubAllGlobals());

describe('active', () => {
  it('khoá', () => expect(ACTIVE_KEY).toBe('mdprev-ws'));
  it('set/get/xoá', () => {
    const s = fakeStorage();
    vi.stubGlobal('localStorage', s);
    expect(getActiveId()).toBeNull();
    setActiveId('abc');
    expect(s.m.get('mdprev-ws')).toBe('abc');
    expect(getActiveId()).toBe('abc');
    setActiveId(null);
    expect(getActiveId()).toBeNull();
  });
  it('localStorage ném lỗi (private mode) → không ném', () => {
    const boom = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(getActiveId()).toBeNull();
    expect(() => setActiveId('x')).not.toThrow();
    expect(() => setActiveId(null)).not.toThrow();
  });
  it('không có localStorage → không ném', () => {
    expect(getActiveId()).toBeNull();
    expect(() => setActiveId('x')).not.toThrow();
  });
  it('newId: dùng randomUUID, có fallback, không trùng', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/);
    vi.stubGlobal('crypto', undefined);
    const a = newId();
    expect(a).toMatch(/^[0-9a-z]+$/);
    expect(newId()).not.toBe(a);
  });
});
