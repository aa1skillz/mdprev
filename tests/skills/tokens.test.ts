import { describe, expect, it } from 'vitest';
import { estimateTokens, tokenLevels } from '../../src/lib/skills/tokens';
import { vfsOf } from './helpers';

describe('estimateTokens', () => {
  it('chuỗi rỗng là 0', () => expect(estimateTokens('')).toBe(0));
  it('làm tròn lên', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('tokenLevels', () => {
  const fm = { name: 'pdf', description: 'x'.repeat(37) }; // 3 + 37 = 40 ký tự → 10
  it('always = name + description; trigger = cả SKILL.md; all = mọi file văn bản trong skill', () => {
    const v = vfsOf({ 's/SKILL.md': 'a'.repeat(400), 's/scripts/x.py': 'b'.repeat(40), 's/ref.md': 'c'.repeat(80) });
    expect(tokenLevels(v, 's', fm)).toEqual({ always: 10, trigger: 100, all: 130 });
  });
  it('file nhị phân (không có text) không được tính', () => {
    const v = vfsOf({ 's/SKILL.md': 'a'.repeat(40) });
    v.set('s/img.png', { path: 's/img.png', size: 99999, binary: true });
    expect(tokenLevels(v, 's', fm).all).toBe(10);
  });
  it('không tính file của skill lồng bên trong', () => {
    const v = vfsOf({ 's/SKILL.md': 'a'.repeat(40), 's/in/SKILL.md': 'b'.repeat(4000), 's/in/x.md': 'c'.repeat(4000) });
    expect(tokenLevels(v, 's', fm).all).toBe(10);
  });
  it('thiếu frontmatter thì always là 0, không ném', () => {
    const v = vfsOf({ 's/SKILL.md': 'a'.repeat(40) });
    expect(tokenLevels(v, 's', null)).toEqual({ always: 0, trigger: 10, all: 10 });
  });
  it('skill ở gốc (dir rỗng)', () => {
    const v = vfsOf({ 'SKILL.md': 'a'.repeat(40), 'n.md': 'b'.repeat(40) });
    expect(tokenLevels(v, '', { name: 'n', description: 'dd' })).toEqual({ always: 1, trigger: 10, all: 20 });
  });
});
