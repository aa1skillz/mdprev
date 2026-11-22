import { describe, expect, it } from 'vitest';
import { MAX_CHARS, MAX_STEPS, breakRun, fitReplay, canRedoLog, canUndoLog, emptyLog, hashText, logOf, pack, record, unpack } from '../src/lib/studio/undo-log';

/** Gõ từng ký tự vào cuối `t` như người dùng. */
const type = (l: ReturnType<typeof emptyLog>, t: string, s: string): string => { for (const ch of s) { const n = t + ch; record(l, t, n, 'insertText'); t = n; } return t; };
const replay = (base: string, steps: { f: number; d: string; i: string }[], n: number) => steps.slice(0, n).reduce((t, s) => t.slice(0, s.f) + s.i + t.slice(s.f + s.d.length), base);

describe('record', () => {
  it('chữ gõ liền kề gộp thành một bước', () => {
    const l = emptyLog(); const t = type(l, 'x', 'hello');
    expect(t).toBe('xhello'); expect(l.steps).toHaveLength(1); expect(l.idx).toBe(1);
    expect(l.steps[0]).toEqual({ f: 1, d: '', i: 'hello' });
  });
  it('Backspace liên tiếp gộp, xen kẽ gõ/xoá thì tách', () => {
    const l = emptyLog(); let t = 'abcdef';
    for (const next of ['abcde', 'abcd', 'abc']) { record(l, t, next, 'deleteContentBackward'); t = next; }
    expect(l.steps).toEqual([{ f: 3, d: 'def', i: '' }]);
    record(l, t, 'abcX', 'insertText');
    expect(l.steps).toHaveLength(2);
  });
  it('dán và lệnh thanh định dạng không gộp với chữ gõ', () => {
    const l = emptyLog(); let t = type(l, '', 'ab');
    record(l, t, t + 'PASTE', 'insertFromPaste'); t += 'PASTE';
    record(l, t, t + 'cd', 'insertText');
    expect(l.steps).toHaveLength(3);
  });
  it('brk: bước đó và chữ gõ kế tiếp đều là bước riêng', () => {
    const l = emptyLog(); let t = type(l, '', 'ab');
    record(l, t, t + '**', 'insertText', true); t += '**';
    t = type(l, t, 'cd');
    expect(l.steps).toHaveLength(3);
  });
  it('IME: các lần sửa chữ đang soạn (Telex) gộp thành một bước', () => {
    const l = emptyLog(); let t = 'x ';
    for (const w of ['v', 'vi', 'vie', 'việ', 'việt']) { const n = 'x ' + w; record(l, t, n, 'insertCompositionText'); t = n; }
    expect(l.steps).toHaveLength(1); expect(l.steps[0]).toEqual({ f: 2, d: '', i: 'việt' });
    record(l, t, 'x ', 'historyUndo'); expect(l.idx).toBe(0);
  });
  it('breakRun cắt mạch gõ (con trỏ nhảy chỗ khác)', () => {
    const l = emptyLog(); let t = type(l, '', 'ab');
    breakRun(l); t = type(l, t, 'cd');
    expect(l.steps).toHaveLength(2);
  });
  it('undo/redo của trình duyệt được nhận ra theo nội dung, dù ngăn xếp gốc gộp khác', () => {
    const l = emptyLog(); let t = type(l, '', 'ab');
    record(l, t, t + 'X', 'insertFromPaste'); t += 'X';
    record(l, t, t + 'Y', 'insertFromPaste'); t += 'Y';
    expect(l.steps).toHaveLength(3);
    record(l, t, 'ab', 'historyUndo'); t = 'ab'; // trình duyệt lùi 2 bước một lúc
    expect(l.idx).toBe(1); expect(l.steps).toHaveLength(3); expect(canRedoLog(l)).toBe(true);
    record(l, t, 'abX', 'historyRedo'); t = 'abX';
    expect(l.idx).toBe(2);
    record(l, t, '', 'historyUndo'); t = '';
    expect(l.idx).toBe(0); expect(canUndoLog(l)).toBe(false);
  });
  it('undo không khớp mốc nào thì coi là sửa mới và xoá redo', () => {
    const l = emptyLog(); let t = type(l, '', 'ab');
    record(l, t, t + 'X', 'insertFromPaste'); t += 'X';
    record(l, t, 'a?', 'historyUndo');
    expect(l.steps.length).toBe(3); expect(l.idx).toBe(3);
  });
  it('sửa mới sau undo bỏ phần redo', () => {
    const l = emptyLog(); let t = type(l, '', 'ab');
    record(l, t, t + 'X', 'insertFromPaste'); t += 'X';
    record(l, t, 'ab', 'historyUndo'); t = 'ab';
    record(l, t, 'abZ', 'insertFromPaste');
    expect(canRedoLog(l)).toBe(false); expect(l.steps).toHaveLength(2);
  });
  it('giới hạn số bước và dung lượng: bỏ bước cũ nhất', () => {
    const l = emptyLog(); let t = '';
    for (let k = 0; k < MAX_STEPS + 30; k++) { record(l, t, t + 'a', 'insertFromPaste'); t += 'a'; }
    expect(l.steps).toHaveLength(MAX_STEPS); expect(l.idx).toBe(MAX_STEPS);
    const big = emptyLog(); const huge = 'x'.repeat(MAX_CHARS + 10);
    record(big, '', huge, 'insertFromPaste');
    expect(big.steps).toHaveLength(0);
  });
});

describe('pack / unpack', () => {
  it('lùi từ văn bản hiện tại ra đúng văn bản gốc, replay dựng lại đúng cuối nhánh', () => {
    const l = emptyLog(); let t = 'base line\n';
    t = type(l, t, 'hello');
    record(l, t, t + '\n## H', 'insertFromPaste'); t += '\n## H';
    record(l, t, t.replace('hello', 'HELLO'), 'insertReplacementText'); t = t.replace('hello', 'HELLO');
    const final = t;
    record(l, t, t.replace('HELLO', 'hello'), 'historyUndo'); t = t.replace('HELLO', 'hello'); // một bước redo
    const rec = pack(l, t)!;
    const p = unpack(JSON.parse(JSON.stringify(rec)), t)!;
    expect(p).not.toBeNull();
    expect(p.base).toBe('base line\n'); expect(p.idx).toBe(2);
    expect(replay(p.base, p.steps, p.steps.length)).toBe(final);
    expect(replay(p.base, p.steps, p.idx)).toBe(t);
    expect(logOf(p).idx).toBe(2);
  });
  it('văn bản khác với lúc lưu thì bỏ', () => {
    const l = emptyLog(); const t = type(l, 'a', 'bc');
    const rec = pack(l, t);
    expect(unpack(rec, t + '!')).toBeNull();
    expect(unpack(rec, t)).not.toBeNull();
  });
  it('bản lưu hỏng hoặc bước không ăn khớp thì bỏ, không ném lỗi', () => {
    const t = 'abc';
    for (const bad of [null, undefined, 5, {}, { v: 2 }, { v: 1, steps: 'x', idx: 0, h: hashText(t) }, { v: 1, steps: [], idx: 0, h: hashText(t) },
      { v: 1, steps: [{ f: 99, d: 'zz', i: 'q' }], idx: 1, h: hashText(t) }, { v: 1, steps: [{ f: 0, d: '', i: 'ZZ' }], idx: 1, h: hashText(t) },
      { v: 1, steps: [{ f: -1, d: '', i: 'a' }], idx: 1, h: hashText(t) }, { v: 1, steps: [{ f: 0, d: '', i: 'a' }], idx: 3, h: hashText(t) }]) expect(unpack(bad, t)).toBeNull();
  });
  it('không có bước thì không lưu', () => { expect(pack(emptyLog(), 'x')).toBeNull(); });
});

describe('giới hạn replay', () => {
  it('bước quá nặng (nhiều dòng/ký tự) là rào chắn: bỏ nó và mọi bước trước nó', () => {
    const l = emptyLog(); let t = type(l, '', 'ab');
    record(l, t, t + 'x\n'.repeat(80), 'insertFromPaste'); t += 'x\n'.repeat(80);
    expect(l.steps).toHaveLength(0); expect(l.idx).toBe(0);
    t = type(l, t, 'cd');
    expect(l.steps).toHaveLength(1); expect(l.steps[0]!.i).toBe('cd');
  });
  it('fitReplay bỏ bước undo cũ nhất khi tài liệu dài, mốc đầu nhích lên đúng', () => {
    const l = emptyLog(); let t = 'base';
    for (let k = 0; k < 40; k++) { record(l, t, t + `\nrow ${k}`, 'insertFromPaste'); t += `\nrow ${k}`; }
    const p = unpack(pack(l, t), t)!;
    expect(p.steps).toHaveLength(40);
    const f = fitReplay(p, 5000); // ngân sách ~16 đơn vị: mỗi bước 2 đơn vị
    expect(f.steps.length).toBeLessThan(40); expect(f.idx).toBe(f.steps.length);
    expect(replay(f.base, f.steps, f.steps.length)).toBe(t);
    expect(fitReplay(p, 100).steps).toHaveLength(40); // tài liệu ngắn: giữ hết
  });
});
