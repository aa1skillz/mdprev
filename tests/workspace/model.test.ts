import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Vfs } from '../../src/lib/skills/types';
import { MAX_BYTES, WorkspaceError, addFile, fromVfs, removeFile, renameFile, restoreFile, setText, statusOf, toZip, totalBytes } from '../../src/lib/workspace/model';

const vfs = (): Vfs => new Map([
  ['a/SKILL.md', { path: 'a/SKILL.md', size: 5, binary: false, text: 'hello' }],
  ['a/ref/x.md', { path: 'a/ref/x.md', size: 2, binary: false, text: 'xx' }],
  ['a/logo.png', { path: 'a/logo.png', size: 999, binary: true }],
  ['b/SKILL.md', { path: 'b/SKILL.md', size: 1, binary: false, text: 'b' }],
]);
const mk = () => fromVfs(vfs(), { id: 'i', name: 'n', label: 'l', dir: 'a', now: 1 });
const code = (fn: () => unknown): string | undefined => { try { fn(); } catch (e) { return e instanceof WorkspaceError ? e.code : 'other'; } return undefined; };

describe('fromVfs', () => {
  it('lấy file dưới dir, đường dẫn tương đối, bỏ nhị phân vào skipped', () => {
    const ws = mk();
    expect(ws.files.map((f) => f.path)).toEqual(['SKILL.md', 'ref/x.md']);
    expect(ws.skipped).toEqual([{ path: 'logo.png', size: 999 }]);
    expect(ws.base).toEqual({ 'SKILL.md': 'hello', 'ref/x.md': 'xx' });
    expect(ws.origin).toEqual({ kind: 'skill-copy', label: 'l' });
    expect(ws.createdAt).toBe(1);
  });
  it('không có dir thì lấy tất cả', () => expect(fromVfs(vfs(), { id: 'i', name: 'n', label: 'l', now: 1 }).files).toHaveLength(3));
  it('dir không khớp tiền tố một phần ("a" không khớp "ab/")', () => {
    const v: Vfs = new Map([['ab/f.md', { path: 'ab/f.md', size: 1, binary: false, text: 'q' }]]);
    expect(fromVfs(v, { id: 'i', name: 'n', label: 'l', dir: 'a', now: 1 }).files).toEqual([]);
  });
  it('size tính theo byte UTF-8', () => {
    const v: Vfs = new Map([['f.md', { path: 'f.md', size: 3, binary: false, text: 'é€' }]]);
    expect(fromVfs(v, { id: 'i', name: 'n', label: 'l', now: 1 }).files[0]?.size).toBe(5);
  });
  it('vượt giới hạn → too-big', () => {
    const big = 'x'.repeat(MAX_BYTES + 1);
    const v: Vfs = new Map([['f.md', { path: 'f.md', size: big.length, binary: false, text: big }]]);
    expect(code(() => fromVfs(v, { id: 'i', name: 'n', label: 'l', now: 1 }))).toBe('too-big');
  });
});

describe('sửa file', () => {
  it('setText trả bản mới, không đụng bản cũ', () => {
    const ws = mk();
    const w2 = setText(ws, 'SKILL.md', 'bye!', 5);
    expect(ws.files[0]?.text).toBe('hello');
    expect(w2.files[0]).toEqual({ path: 'SKILL.md', size: 4, text: 'bye!' });
    expect(w2.updatedAt).toBe(5);
    expect(w2.base).toEqual(ws.base);
  });
  it('setText file không có → missing; vượt giới hạn → too-big', () => {
    expect(code(() => setText(mk(), 'nope', 'x', 2))).toBe('missing');
    expect(code(() => setText(mk(), 'SKILL.md', 'x'.repeat(MAX_BYTES + 1), 2))).toBe('too-big');
    expect(totalBytes(setText(mk(), 'SKILL.md', 'x'.repeat(MAX_BYTES - 2), 2))).toBe(MAX_BYTES);
  });
  it('addFile chuẩn hoá đường dẫn và giữ thứ tự', () => {
    const w = addFile(mk(), 'docs\\new.md', 'n', 2);
    expect(w.files.map((f) => f.path)).toEqual(['SKILL.md', 'docs/new.md', 'ref/x.md']);
  });
  it.each(['', '   /', '../x', 'a/../../x', '/abs', 'C:\\x', '..'])('addFile từ chối %j', (p) => {
    const bad = p === '   /' ? 'x/../..' : p;
    expect(code(() => addFile(mk(), bad, 't', 2))).toBe('bad-path');
  });
  it('addFile trùng → exists; quá lớn → too-big', () => {
    expect(code(() => addFile(mk(), 'SKILL.md', 't', 2))).toBe('exists');
    expect(code(() => addFile(mk(), './SKILL.md', 't', 2))).toBe('exists');
    expect(code(() => addFile(mk(), 'big.md', 'x'.repeat(MAX_BYTES + 1), 2))).toBe('too-big');
  });
  it('renameFile', () => {
    const w = renameFile(mk(), 'ref/x.md', 'ref/y.md', 3);
    expect(w.files.map((f) => f.path)).toEqual(['SKILL.md', 'ref/y.md']);
    expect(w.files[1]?.text).toBe('xx');
    expect(code(() => renameFile(mk(), 'ref/x.md', 'SKILL.md', 3))).toBe('exists');
    expect(code(() => renameFile(mk(), 'zzz', 'q', 3))).toBe('missing');
    expect(code(() => renameFile(mk(), 'ref/x.md', '../x', 3))).toBe('bad-path');
    expect(code(() => renameFile(mk(), 'ref/x.md', '/abs', 3))).toBe('bad-path');
  });
  it('renameFile về chính nó: không đổi', () => {
    const ws = mk();
    expect(renameFile(ws, 'SKILL.md', 'SKILL.md', 9)).toBe(ws);
  });
  it('removeFile', () => {
    const w = removeFile(mk(), 'ref/x.md', 4);
    expect(w.files.map((f) => f.path)).toEqual(['SKILL.md']);
    expect(code(() => removeFile(mk(), 'zzz', 4))).toBe('missing');
  });
});

describe('statusOf và restoreFile', () => {
  it('ban đầu sạch', () => expect(statusOf(mk()).size).toBe(0));
  it('modified, added, deleted', () => {
    let w = setText(mk(), 'SKILL.md', 'changed', 2);
    w = addFile(w, 'new.md', 'n', 2);
    w = removeFile(w, 'ref/x.md', 2);
    expect(Object.fromEntries(statusOf(w))).toEqual({ 'SKILL.md': 'modified', 'new.md': 'added', 'ref/x.md': 'deleted' });
  });
  it('sửa lại đúng như gốc thì hết modified', () => {
    const w = setText(setText(mk(), 'SKILL.md', 'x', 2), 'SKILL.md', 'hello', 3);
    expect(statusOf(w).size).toBe(0);
  });
  it('đổi tên = deleted + added', () => {
    expect(Object.fromEntries(statusOf(renameFile(mk(), 'ref/x.md', 'ref/y.md', 2)))).toEqual({ 'ref/x.md': 'deleted', 'ref/y.md': 'added' });
  });
  it('restoreFile khôi phục file sửa và file xoá', () => {
    const w = removeFile(setText(mk(), 'SKILL.md', 'zz', 2), 'ref/x.md', 2);
    const r = restoreFile(restoreFile(w, 'SKILL.md', 3), 'ref/x.md', 3);
    expect(statusOf(r).size).toBe(0);
    expect(r.files).toEqual(mk().files);
    expect(r.updatedAt).toBe(3);
  });
  it('restoreFile file mới thêm → missing', () => {
    expect(code(() => restoreFile(addFile(mk(), 'new.md', 'n', 2), 'new.md', 3))).toBe('missing');
  });
});

describe('toZip', () => {
  it('round trip, không rootName', () => {
    const out = unzipSync(toZip(addFile(mk(), 'é.md', 'ü', 2)));
    expect(Object.keys(out).sort()).toEqual(['SKILL.md', 'ref/x.md', 'é.md']);
    expect(strFromU8(out['SKILL.md'] as Uint8Array)).toBe('hello');
    expect(strFromU8(out['é.md'] as Uint8Array)).toBe('ü');
  });
  it('có rootName', () => {
    const out = unzipSync(toZip(mk(), 'my-skill'));
    expect(Object.keys(out).sort()).toEqual(['my-skill/SKILL.md', 'my-skill/ref/x.md']);
  });
  it('workspace rỗng vẫn ra zip hợp lệ', () => {
    expect(Object.keys(unzipSync(toZip(removeFile(removeFile(mk(), 'SKILL.md', 2), 'ref/x.md', 2))))).toEqual([]);
  });
});

describe('file hỏng mã hoá', () => {
  it('file có U+FFFD không được sao chép, vào skipped', () => {
    const vfs = new Map([
      ['SKILL.md', { path: 'SKILL.md', size: 3, binary: false, text: 'ok\n' }],
      ['bad.md', { path: 'bad.md', size: 5, binary: false, text: 'a\uFFFDb' }],
    ]);
    const ws = fromVfs(vfs, { id: 'x', name: 'n', label: 'l', now: 1 });
    expect(ws.files.map((f) => f.path)).toEqual(['SKILL.md']);
    expect(ws.skipped.map((f) => f.path)).toEqual(['bad.md']);
  });
});

