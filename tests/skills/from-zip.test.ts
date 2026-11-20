import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fromZip } from '../../src/lib/skills/import/from-zip';
import { ImportError } from '../../src/lib/skills/types';

const zip = (files: Record<string, string | Uint8Array>): Uint8Array =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
const keys = (v: Map<string, unknown>) => [...v.keys()].sort();

describe('fromZip', () => {
  it('bỏ thư mục bọc ngoài duy nhất (kiểu repo-main/)', () => {
    const v = fromZip(zip({ 'repo-main/a/SKILL.md': 'x', 'repo-main/README.md': 'r' }));
    expect(keys(v)).toEqual(['README.md', 'a/SKILL.md']);
    expect(v.get('README.md')).toEqual({ path: 'README.md', size: 1, binary: false, text: 'r' });
  });

  it('không bỏ khi có nhiều thư mục gốc', () => {
    expect(keys(fromZip(zip({ 'a/SKILL.md': 'x', 'b/SKILL.md': 'y' })))).toEqual(['a/SKILL.md', 'b/SKILL.md']);
  });

  it('bỏ entry có .. hoặc đường dẫn tuyệt đối, không lỗi', () => {
    const v = fromZip(zip({ '../evil.md': 'x', '/abs.md': 'x', 'a/../../b.md': 'x', 'ok.md': 'fine' }));
    expect(keys(v)).toEqual(['ok.md']);
  });

  it('bỏ __MACOSX, .DS_Store, .git, node_modules; thư mục bọc ngoài vẫn được bỏ đúng', () => {
    const v = fromZip(zip({ 's/SKILL.md': 'x', 's/a.md': 'y', '__MACOSX/s/._SKILL.md': 'junk', 's/.DS_Store': 'junk', 's/.git/config': 'junk', 's/node_modules/p/i.js': 'junk' }));
    expect(keys(v)).toEqual(['SKILL.md', 'a.md']);
  });
  it('bỏ qua mục thư mục', () => {
    expect(keys(fromZip(zip({ 'd/': new Uint8Array(0), 'd/a.md': 'x' })))).toEqual(['a.md']);
  });

  it('file nhị phân chỉ ghi kích thước, không giữ nội dung', () => {
    const v = fromZip(zip({ 'a.bin': new Uint8Array([1, 2, 0, 3]) }));
    expect(v.get('a.bin')).toEqual({ path: 'a.bin', size: 4, binary: true });
  });

  it('file .py có byte NUL được coi là nhị phân', () => {
    expect(fromZip(zip({ 'x.py': new Uint8Array([112, 0, 112]) })).get('x.py')?.binary).toBe(true);
  });

  it('file lớn hơn giới hạn chỉ được liệt kê, không đọc', () => {
    const v = fromZip(zip({ 'big.md': 'x'.repeat(100), 'small.md': 'y' }), { maxFileBytes: 50 });
    expect(v.get('big.md')).toEqual({ path: 'big.md', size: 100, binary: true });
    expect(v.get('small.md')?.text).toBe('y');
  });

  it('vượt tổng dung lượng giải nén thì ném too-large', () => {
    expect(() => fromZip(zip({ 'a.md': 'x'.repeat(1000) }), { maxUnzipBytes: 500 })).toThrowError(ImportError);
    try { fromZip(zip({ 'a.md': 'x'.repeat(1000) }), { maxUnzipBytes: 500 }); } catch (e) { expect((e as ImportError).code).toBe('too-large'); }
  });

  it('quá nhiều mục thì ném too-large', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) files[`f${i}.md`] = 'x';
    try { fromZip(zip(files), { maxEntries: 10 }); throw new Error('không ném'); } catch (e) { expect((e as ImportError).code).toBe('too-large'); }
  });

  it('dữ liệu không phải zip thì ném bad-zip', () => {
    try { fromZip(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])); throw new Error('không ném'); } catch (e) { expect((e as ImportError).code).toBe('bad-zip'); }
  });

  it('giải mã UTF-8 (tiếng Việt) đúng', () => {
    expect(fromZip(zip({ 'a.md': 'Tiếng Việt: đường dẫn' })).get('a.md')?.text).toBe('Tiếng Việt: đường dẫn');
  });
});
