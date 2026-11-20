import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffBlocks, makePatch, splitLines, splitRows, unifiedRows, wordDiff } from '../src/lib/diff/engine';

const O = { ignoreSpace: false, ignoreCase: false };
const run = (a: string, b: string, o = O) => { const A = splitLines(a), B = splitLines(b); return { A, B, r: diffBlocks(A, B, o) }; };

/** Áp bản vá thống nhất lên mảng dòng (kiểm tra cả dòng ngữ cảnh và dòng xoá khớp). */
function apply(a: string[], patch: string): string[] {
  const out: string[] = [];
  let ai = 0;
  const lines = patch.split('\n');
  for (let i = 2; i < lines.length; i++) {
    const m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(lines[i] ?? '');
    if (!m) continue;
    const start = Number(m[2]) === 0 ? Number(m[1]) : Number(m[1]) - 1;
    while (ai < start) out.push(a[ai++]!);
    for (i++; i < lines.length && !(lines[i] ?? '').startsWith('@@'); i++) {
      const l = lines[i]!;
      if (l === '') continue;
      if (l[0] === ' ') { expect(a[ai]).toBe(l.slice(1)); out.push(a[ai++]!); }
      else if (l[0] === '-') { expect(a[ai]).toBe(l.slice(1)); ai++; }
      else out.push(l.slice(1));
    }
    i--;
  }
  while (ai < a.length) out.push(a[ai++]!);
  return out;
}

describe('splitLines', () => {
  it('một dấu xuống dòng cuối không sinh dòng rỗng; CRLF được chuẩn hoá', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['']);
    expect(splitLines('a\n\n')).toEqual(['a', '']);
  });
});

describe('diffBlocks', () => {
  it('giống nhau thì một khối eq, không có khối đổi', () => {
    const { r } = run('a\nb\nc', 'a\nb\nc');
    expect(r.blocks).toEqual([{ k: 'eq', a: 0, b: 0, n: 3 }]);
    expect(r.hunks).toBe(0);
  });
  it('thêm, xoá, sửa: đếm và khoảng chỉ số', () => {
    const { r } = run('a\nb\nc\nd', 'a\nB\nc\nx\ny\nd');
    expect(r.blocks).toEqual([
      { k: 'eq', a: 0, b: 0, n: 1 }, { k: 'chg', a: 1, an: 1, b: 1, bn: 1 }, { k: 'eq', a: 2, b: 2, n: 1 }, { k: 'chg', a: 3, an: 0, b: 3, bn: 2 }, { k: 'eq', a: 3, b: 5, n: 1 },
    ]);
    expect(r).toMatchObject({ added: 3, removed: 1, hunks: 2, truncated: false });
  });
  it('rỗng so với có chữ', () => {
    expect(run('', 'x\ny').r).toMatchObject({ added: 2, removed: 0, hunks: 1 });
    expect(run('x\ny', '').r).toMatchObject({ added: 0, removed: 2, hunks: 1 });
    expect(run('', '').r.blocks).toEqual([]);
  });
  it('bỏ qua khoảng trắng và hoa thường khi so (nhưng hiển thị chữ gốc)', () => {
    expect(run('Hello   World\nx', 'hello world\nx', { ignoreSpace: true, ignoreCase: true }).r.hunks).toBe(0);
    expect(run('Hello   World', 'hello world', { ignoreSpace: true, ignoreCase: false }).r.hunks).toBe(1);
    expect(run('a  b', 'a b', O).r.hunks).toBe(1);
  });
  it('quá nhiều khác biệt thì báo truncated và coi như thay toàn bộ', () => {
    const a = Array.from({ length: 2000 }, (_, i) => 'a' + i).join('\n'), b = Array.from({ length: 2000 }, (_, i) => 'b' + i).join('\n');
    const { r } = run(a, b);
    expect(r.truncated).toBe(true);
    expect(r.blocks).toEqual([{ k: 'chg', a: 0, an: 2000, b: 0, bn: 2000 }]);
  });
  it('tệp lớn ít khác biệt vẫn nhanh', () => {
    const A = Array.from({ length: 50_000 }, (_, i) => 'line ' + i), B = A.slice();
    B[100] = 'changed'; B.splice(30_000, 0, 'new'); B.splice(40_000, 5);
    const t0 = performance.now();
    const r = diffBlocks(A, B, O);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(r).toMatchObject({ added: 2, removed: 6, hunks: 3, truncated: false });
  });
});

describe('wordDiff', () => {
  const text = (s: { t: string }[]) => s.map((x) => x.t).join('');
  it('đánh dấu đúng từ đổi và giữ nguyên chữ', () => {
    const d = wordDiff('the quick brown fox', 'the slow brown fox');
    expect(text(d.a)).toBe('the quick brown fox');
    expect(text(d.b)).toBe('the slow brown fox');
    expect(d.a.filter((s) => s.w).map((s) => s.t)).toEqual(['quick']);
    expect(d.b.filter((s) => s.w).map((s) => s.t)).toEqual(['slow']);
  });
  it('dấu câu và tiếng Việt', () => {
    const d = wordDiff('Xin chào, thế giới!', 'Xin chào, vũ trụ!');
    expect(d.a.filter((s) => s.w).map((s) => s.t.trim())).toEqual(['thế giới']);
    expect(text(d.b)).toBe('Xin chào, vũ trụ!');
  });
  it('dòng quá dài thì đổi cả dòng', () => {
    const d = wordDiff('x'.repeat(5000), 'y'.repeat(5000));
    expect(d.a).toEqual([{ t: 'x'.repeat(5000), w: true }]);
  });
  it('một bên rỗng', () => {
    expect(wordDiff('', 'abc')).toEqual({ a: [], b: [{ t: 'abc', w: true }] });
  });
});

describe('unifiedRows / splitRows', () => {
  const big = Array.from({ length: 30 }, (_, i) => 'l' + i);
  const b2 = big.slice(); b2[15] = 'X';
  const r = diffBlocks(big, b2, O);
  it('gập các dòng giống nhau xa chỗ đổi, chừa 3 dòng ngữ cảnh mỗi bên', () => {
    const rows = unifiedRows(r.blocks, 3, new Set());
    expect(rows.filter((x) => x.t === 'gap')).toEqual([{ t: 'gap', id: 0, n: 12 }, { t: 'gap', id: 2, n: 11 }]);
    expect(rows.filter((x) => x.t === 'eq').length).toBe(6);
    expect(rows.filter((x) => x.t === 'del' || x.t === 'add').length).toBe(2);
  });
  it('mở một khối gập thì hiện đủ dòng; context rất lớn thì không gập', () => {
    expect(unifiedRows(r.blocks, 3, new Set([0])).filter((x) => x.t === 'gap').length).toBe(1);
    expect(unifiedRows(r.blocks, 1e9, new Set()).some((x) => x.t === 'gap')).toBe(false);
  });
  it('kiểu thống nhất: mọi dòng xoá rồi mọi dòng thêm; dòng cùng vị trí được ghép để tô theo từ', () => {
    const { r: x } = run('a\nb\nc', 'a\nB1\nB2\nc');
    expect(unifiedRows(x.blocks, 3, new Set()).filter((y) => y.t !== 'eq')).toEqual([{ t: 'del', a: 1, pair: 1 }, { t: 'add', b: 1, pair: 1 }, { t: 'add', b: 2 }]);
  });
  it('kiểu hai cột: dòng bị thay đứng cạnh dòng thay thế', () => {
    const { r: x } = run('a\nb\nc', 'a\nB1\nB2\nc');
    expect(splitRows(x.blocks, 3, new Set()).filter((y) => y.t === 'chg')).toEqual([{ t: 'chg', a: 1, b: 1 }, { t: 'chg', b: 2 }]);
  });
});

describe('makePatch', () => {
  it('không khác biệt thì bản vá rỗng', () => expect(makePatch(['a'], ['a'], diffBlocks(['a'], ['a'], O).blocks)).toBe(''));
  it('tiêu đề, hunk và dòng đúng chuẩn', () => {
    const A = ['a', 'b', 'c'], B = ['a', 'x', 'c'];
    expect(makePatch(A, B, diffBlocks(A, B, O).blocks, ['old.txt', 'new.txt'])).toBe('--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+x\n c\n');
  });
  it('áp bản vá của chính nó lên A luôn ra B (thử ngẫu nhiên, nhiều mức ngữ cảnh)', () => {
    let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 150; t++) {
      const A = Array.from({ length: Math.floor(rnd() * 40) }, () => 'l' + Math.floor(rnd() * 12));
      const B = Array.from({ length: Math.floor(rnd() * 40) }, () => 'l' + Math.floor(rnd() * 12));
      const blocks = diffBlocks(A, B, O).blocks;
      for (const ctx of [0, 1, 3]) expect(apply(A, makePatch(A, B, blocks, ['a', 'b'], ctx))).toEqual(B);
    }
  });
  const hasPatch = spawnSync('patch', ['--version']).status === 0;
  it.skipIf(!hasPatch)('GNU patch chấp nhận bản vá và ra đúng B', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diff-'));
    const A = Array.from({ length: 60 }, (_, i) => 'line ' + i), B = A.slice();
    B[3] = 'changed'; B.splice(20, 0, 'inserted'); B.splice(40, 3);
    writeFileSync(join(dir, 'a.txt'), A.join('\n') + '\n');
    writeFileSync(join(dir, 'p.diff'), makePatch(A, B, diffBlocks(A, B, O).blocks, ['a.txt', 'b.txt']));
    execFileSync('patch', ['-s', join(dir, 'a.txt'), join(dir, 'p.diff')]);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe(B.join('\n') + '\n');
  });
});
