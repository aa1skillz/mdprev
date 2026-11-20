import { describe, expect, it } from 'vitest';
import { buildTree, filterFiles, flatten, kindMark } from '../src/components/inspect/tree';

const f = (path: string, size = 10, binary = false) => ({ path, size, binary });
const FILES = [f('s/SKILL.md'), f('s/LICENSE.txt'), f('s/scripts/b.py'), f('s/scripts/a.py'), f('s/scripts/office/x.py'), f('s/assets/logo.png', 99, true)];

describe('buildTree', () => {
  it('thư mục trước, tên theo thứ tự, đường dẫn tính từ thư mục skill', () => {
    const t = buildTree(FILES, 's');
    expect(t.map((n) => n.name)).toEqual(['assets', 'scripts', 'LICENSE.txt', 'SKILL.md']);
    const scripts = t.find((n) => n.name === 'scripts')!;
    expect(scripts.kind).toBe('dir');
    expect(scripts.children!.map((n) => n.name)).toEqual(['office', 'a.py', 'b.py']);
    expect(t.find((n) => n.name === 'SKILL.md')).toMatchObject({ kind: 'file', path: 's/SKILL.md' });
  });
  it('đếm số file trong thư mục (đệ quy)', () => {
    expect(buildTree(FILES, 's').find((n) => n.name === 'scripts')!.count).toBe(3);
  });
  it('skill ở gốc (dir rỗng)', () => {
    expect(buildTree([f('SKILL.md'), f('a/b.md')], '').map((n) => n.name)).toEqual(['a', 'SKILL.md']);
  });
});

describe('flatten, filterFiles, kindMark', () => {
  it('flatten chỉ tính thư mục đang mở', () => {
    const t = buildTree(FILES, 's');
    const rows = flatten(t, new Set(['s/scripts']));
    expect(rows.map((r) => r.node.name)).toEqual(['assets', 'scripts', 'office', 'a.py', 'b.py', 'LICENSE.txt', 'SKILL.md']);
    expect(rows.find((r) => r.node.name === 'a.py')!.depth).toBe(1);
  });
  it('filterFiles khớp không phân biệt hoa thường trên đường dẫn, trả file (không phải thư mục)', () => {
    expect(filterFiles(FILES, 'S/scripts/A').map((x) => x.path)).toEqual(['s/scripts/a.py']);
    expect(filterFiles(FILES, '').length).toBe(FILES.length);
    expect(filterFiles(FILES, 'zzz')).toEqual([]);
  });
  it('kindMark theo đuôi', () => {
    expect(kindMark('a/SKILL.md', false)).toBe('M↓');
    expect(kindMark('a/x.py', false)).toBe('py');
    expect(kindMark('a/x.sh', false)).toBe('sh');
    expect(kindMark('a/x.ts', false)).toBe('js');
    expect(kindMark('a/x.png', true)).toBe('img');
    expect(kindMark('a/x.bin', true)).toBe('bin');
    expect(kindMark('a/LICENSE', false)).toBe('·');
  });
});
