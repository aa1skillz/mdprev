import { describe, expect, it } from 'vitest';
import { dirOf, filesOfSkill, isBinaryBytes, kindOf, normalizePath, skillDirs } from '../../src/lib/skills/vfs';
import { vfsOf } from './helpers';

describe('normalizePath', () => {
  it('bỏ ./ và // thừa', () => expect(normalizePath('./a//b')).toBe('a/b'));
  it('đổi \\ thành /', () => expect(normalizePath('a\\b\\c.md')).toBe('a/b/c.md'));
  it('từ chối .. và đường dẫn tuyệt đối', () => {
    expect(normalizePath('../x')).toBeNull();
    expect(normalizePath('a/../../x')).toBeNull();
    expect(normalizePath('/etc/passwd')).toBeNull();
    expect(normalizePath('C:\\win\\x')).toBeNull();
    expect(normalizePath('')).toBeNull();
  });
});

describe('dirOf, kindOf', () => {
  it('dirOf', () => {
    expect(dirOf('a/b/c.md')).toBe('a/b');
    expect(dirOf('c.md')).toBe('');
  });
  it('kindOf theo tên và đuôi', () => {
    expect(kindOf('x/SKILL.md')).toBe('skill');
    expect(kindOf('x/notes.md')).toBe('doc');
    expect(kindOf('x/run.py')).toBe('script');
    expect(kindOf('x/run.sh')).toBe('script');
    expect(kindOf('x/a.png')).toBe('asset');
    expect(kindOf('x/data.bin')).toBe('other');
  });
});

describe('isBinaryBytes', () => {
  it('có byte NUL trong 8 KB đầu là nhị phân', () => expect(isBinaryBytes(new Uint8Array([104, 105, 0, 33]))).toBe(true));
  it('văn bản thường không phải nhị phân', () => expect(isBinaryBytes(new TextEncoder().encode('print("hi")\n'))).toBe(false));
  it('NUL sau 8 KB không tính', () => {
    const b = new Uint8Array(9000).fill(65);
    b[8500] = 0;
    expect(isBinaryBytes(b)).toBe(false);
  });
});

describe('vfsOf (helper)', () => {
  it('tạo VFile có size và text', () => {
    const v = vfsOf({ 'a.md': 'xyz' });
    expect(v.get('a.md')).toEqual({ path: 'a.md', size: 3, binary: false, text: 'xyz' });
  });
});


describe('skillDirs, filesOfSkill', () => {
  const v = vfsOf({
    'README.md': 'r',
    'skills/a/SKILL.md': 'a',
    'skills/a/scripts/x.py': 'x',
    'skills/a/nested/SKILL.md': 'n',
    'skills/a/nested/y.md': 'y',
    'skills/b/SKILL.md': 'b',
  });
  it('skillDirs: thư mục chứa đúng SKILL.md, sắp xếp', () => {
    expect(skillDirs(v)).toEqual(['skills/a', 'skills/a/nested', 'skills/b']);
  });
  it('skillDirs: skill ở gốc có dir rỗng', () => {
    expect(skillDirs(vfsOf({ 'SKILL.md': 'x', 'a.md': 'y' }))).toEqual(['']);
  });
  it('filesOfSkill: bỏ file của skill lồng bên trong', () => {
    expect(filesOfSkill(v, 'skills/a').map((f) => f.path).sort()).toEqual(['skills/a/SKILL.md', 'skills/a/scripts/x.py']);
  });
  it('filesOfSkill: skill ở gốc lấy cả cây, trừ skill lồng', () => {
    const r = vfsOf({ 'SKILL.md': 'x', 'a.md': 'y', 'sub/SKILL.md': 's', 'sub/z.md': 'z' });
    expect(filesOfSkill(r, '').map((f) => f.path).sort()).toEqual(['SKILL.md', 'a.md']);
  });
});
