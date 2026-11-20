import { describe, expect, it } from 'vitest';
import { fromFiles, type FileLike } from '../../src/lib/skills/import/from-files';

const f = (path: string, content: string | number[]): FileLike => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
  return { path, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
};

describe('fromFiles', () => {
  it('đọc văn bản, giữ tên thư mục đã chọn làm thư mục gốc của skill', async () => {
    const v = await fromFiles([f('my-skill/SKILL.md', '---\nname: my-skill\n---\nx'), f('my-skill/scripts/a.py', 'print(1)')]);
    expect([...v.keys()].sort()).toEqual(['my-skill/SKILL.md', 'my-skill/scripts/a.py']);
    expect(v.get('my-skill/scripts/a.py')?.text).toBe('print(1)');
  });
  it('bỏ .git, node_modules, __MACOSX, .DS_Store và đường dẫn nguy hiểm', async () => {
    const v = await fromFiles([f('s/.git/config', 'x'), f('s/node_modules/a/index.js', 'x'), f('__MACOSX/s/._ok.md', 'x'), f('s/.DS_Store', 'x'), f('../evil.md', 'x'), f('s/ok.md', 'ok')]);
    expect([...v.keys()]).toEqual(['s/ok.md']);
  });
  it('nhị phân (byte NUL) và file quá lớn chỉ được liệt kê', async () => {
    const v = await fromFiles([f('s/a.bin', [1, 0, 2]), f('s/big.md', 'x'.repeat(100)), f('s/s.md', 'y')], { maxFileBytes: 50 });
    expect(v.get('s/a.bin')).toEqual({ path: 's/a.bin', size: 3, binary: true });
    expect(v.get('s/big.md')).toEqual({ path: 's/big.md', size: 100, binary: true });
    expect(v.get('s/s.md')?.text).toBe('y');
  });
  it('quá nhiều file thì ném too-large', async () => {
    const many = Array.from({ length: 20 }, (_, i) => f(`s/f${i}.md`, 'x'));
    await expect(fromFiles(many, { maxEntries: 10 })).rejects.toMatchObject({ code: 'too-large' });
  });
  it('quá tổng dung lượng văn bản thì ném too-large', async () => {
    await expect(fromFiles([f('s/a.md', 'x'.repeat(60)), f('s/b.md', 'y'.repeat(60))], { maxTotalBytes: 100 })).rejects.toMatchObject({ code: 'too-large' });
  });
});
