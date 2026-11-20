import { describe, expect, it } from 'vitest';
import { handleKey } from '../src/lib/keys';
import { filterCommands, fold, highlight } from '../src/lib/search';

// Chuyển từ cris-blog tests/search.test.ts và tests/keys.test.ts (phần còn áp dụng cho mdprev).

describe('fold', () => {
  it('bỏ dấu, đ thành d, giữ độ dài', () => {
    expect(fold('Đặt tên biến')).toBe('dat ten bien');
    expect(fold('Hôm nay')).toHaveLength('Hôm nay'.length);
  });
});
describe('highlight', () => {
  it('đánh dấu từ khớp không phân biệt dấu', () => {
    const segs = highlight('Cách mình đặt tên', ['dat']);
    expect(segs.find((s) => s.h)?.t).toBe('đặt');
  });
});
describe('filterCommands', () => {
  const cmds = [{ id: 'theme', key: 'dark light sang toi theme', label: 'Đổi giao diện sáng/tối', hint: 'd', desc: '' }, { id: 'help', key: 'help phim tat', label: 'Xem phím tắt', hint: '?', desc: '' }];
  it('lọc theo từ khóa không dấu', () => { expect(filterCommands(cmds, 'sang toi').map((x) => x.cmd.id)).toEqual(['theme']); });
});

const press = (key: string, extra = {}, search = false) => handleKey({ key, ...extra }, search);
describe('phím tắt', () => {
  it('/ mở palette và chặn mặc định; ? mở trợ giúp', () => {
    const r = press('/');
    expect(r.action).toEqual({ type: 'search' }); expect(r.preventDefault).toBe(true);
    expect(press('?').action).toEqual({ type: 'help' });
  });
  it('không kích hoạt khi gõ trong ô nhập, trừ Escape', () => {
    expect(press('d', { targetTag: 'INPUT' }).action.type).toBe('none');
    expect(press('Escape', { targetTag: 'TEXTAREA' }).action.type).toBe('escape');
  });
  it('không kích hoạt với Ctrl/Meta/Alt', () => {
    expect(press('f', { ctrlKey: true }).action.type).toBe('none');
    expect(press('d', { metaKey: true }).action.type).toBe('none');
  });
  it('⌘/Ctrl+/ mở palette ở mọi nơi, kể cả trong ô soạn; không chiếm Alt+/ hay khi palette đang mở', () => {
    for (const m of [{ ctrlKey: true }, { metaKey: true }]) {
      const r = press('/', { ...m, targetTag: 'TEXTAREA' });
      expect(r.action).toEqual({ type: 'search' }); expect(r.preventDefault).toBe(true);
    }
    expect(press('/', { ctrlKey: true, altKey: true }).action.type).toBe('none');
    expect(press('/', { ctrlKey: true }, true).action.type).toBe('none');
  });
  it('khi palette đang mở chỉ Escape có tác dụng', () => {
    expect(press('d', {}, true).action.type).toBe('none');
    expect(press('Escape', {}, true).action.type).toBe('escape');
  });
  it('d đổi theme, f vào zen; phím điều hướng của blog không còn', () => {
    expect(press('d').action.type).toBe('theme');
    expect(press('f').action.type).toBe('focus');
    for (const k of ['h', 'm', 'r', 'u', 'g']) expect(press(k).action.type).toBe('none');
  });
});
