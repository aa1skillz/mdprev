import { describe, expect, it } from 'vitest';
import { seamCenter } from '../src/lib/studio/seam';

const split = { left: 0, width: 1000 };

describe('seamCenter', () => {
  it('Split 50% không panel: giữa vùng', () => { expect(seamCenter(split, 0.5, 'split', 0)).toBe(500); });
  it('Split 30%: theo tỉ lệ', () => { expect(seamCenter(split, 0.3, 'split', 0)).toBe(300); });
  it('Split có panel 260: tỉ lệ tính trên phần còn lại', () => { expect(seamCenter(split, 0.5, 'split', 260)).toBe(630); });
  it('tỉ lệ được kẹp trong [0.25, 0.75]', () => {
    expect(seamCenter(split, 0.1, 'split', 0)).toBe(250);
    expect(seamCenter(split, 0.9, 'split', 0)).toBe(750);
  });
  it('Edit và Read: tâm vùng nội dung bên phải panel, bỏ qua tỉ lệ', () => {
    expect(seamCenter(split, 0.3, 'src', 260)).toBe(630);
    expect(seamCenter(split, 0.3, 'pv', 0)).toBe(500);
  });
  it('tôn trọng toạ độ trái của vùng', () => { expect(seamCenter({ left: 100, width: 800 }, 0.5, 'split', 0)).toBe(500); });
  it('panel phải (inspector) thu hẹp vùng nội dung ở Edit và Read', () => {
    expect(seamCenter(split, 0.5, 'src', 0, 300)).toBe(350);
    expect(seamCenter(split, 0.5, 'pv', 260, 300)).toBe(480);
  });
  it('Split có panel phải: tỉ lệ tính trên phần còn lại', () => {
    expect(seamCenter(split, 0.5, 'split', 0, 300)).toBe(350);
  });
});

