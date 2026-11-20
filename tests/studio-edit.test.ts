import { describe, expect, it } from 'vitest';
import { codeBlock, diffSpan, insertTable, link, linkTo, moveCell, table, toggleLines, tsvToRows, collapseMarker, wrapSel } from '../src/lib/studio/edit';

describe('collapseMarker', () => {
  it('gõ "- " sau dấu Enter đã chèn: giữ một dấu', () => {
    const x = '- tickets\n- -';
    expect(collapseMarker(x, x.length, x.length)?.text).toBe('- tickets\n- ');
  });
  it('không đụng "- - -" hay dòng không đứng sau mục danh sách', () => {
    expect(collapseMarker('para\n- -', 8, 8)).toBeNull();
    expect(collapseMarker('- -', 3, 3)).toBeNull();
  });
});

describe('wrapSel', () => {
  it('vùng chọn gồm ký tự xuống dòng cuối: dấu bọc ôm sát chữ, không đứng một mình', () => {
    const r = wrapSel('Intro\nThis is important.\nNext', 6, 25, '**', '**', 'bold');
    expect(r.text).toBe('Intro\n**This is important.**\nNext');
  });
  it('nhiều dòng: bọc từng dòng, bỏ qua dòng trống', () => {
    expect(wrapSel('a\n\nb', 0, 4, '**', '**', 'x').text).toBe('**a**\n\n**b**');
  });
  it('bọc, chọn nội dung bên trong', () => {
    const r = wrapSel('one two three', 4, 7, '**', '**', 'bold');
    expect(r.text).toBe('one **two** three');
    expect(r.text.slice(r.start, r.end)).toBe('two');
  });
  it('không chọn gì thì chèn chữ mẫu', () => {
    const r = wrapSel('', 0, 0, '*', '*', 'italic');
    expect(r.text).toBe('*italic*');
    expect(r.text.slice(r.start, r.end)).toBe('italic');
  });
  it('đã bọc sẵn thì gỡ', () => {
    const r = wrapSel('one **two** three', 6, 9, '**', '**', 'bold');
    expect(r.text).toBe('one two three');
    expect(r.text.slice(r.start, r.end)).toBe('two');
  });
});

describe('toggleLines', () => {
  it('heading: thêm, đổi cấp, gỡ', () => {
    expect(toggleLines('Hi', 0, 0, 'h2').text).toBe('## Hi');
    expect(toggleLines('## Hi', 3, 3, 'h3').text).toBe('### Hi');
    expect(toggleLines('## Hi', 3, 3, 'h2').text).toBe('Hi');
  });
  it('danh sách số đánh số lại; gỡ khi đã có hết', () => {
    expect(toggleLines('a\nb\nc', 0, 5, 'ol').text).toBe('1. a\n2. b\n3. c');
    expect(toggleLines('1. a\n2. b', 0, 9, 'ol').text).toBe('a\nb');
  });
  it('chỉ đụng dòng chạm vùng chọn, bỏ qua dòng trống', () => {
    expect(toggleLines('x\n\na\n\ny', 3, 3, 'quote').text).toBe('x\n\n> a\n\ny');
    expect(toggleLines('a\n\nb', 0, 4, 'ul').text).toBe('- a\n\n- b');
  });
  it('đổi giữa ul và task không chồng dấu', () => {
    expect(toggleLines('- a', 0, 0, 'task').text).toBe('- [ ] a');
    expect(toggleLines('- [ ] a', 0, 0, 'task').text).toBe('a');
  });
});

describe('khối và link', () => {
  it('code block, bảng, link', () => {
    const c = codeBlock('before\ncmd\nafter', 7, 10);
    expect(c.text).toBe('before\n\n```\ncmd\n```\n\nafter');
    expect(c.text.slice(c.start, c.end)).toBe('cmd');
    const t = table('', 0, 0);
    expect(t.text.slice(t.start, t.end)).toBe('Column 1');
    const l = link('see blog', 4, 8);
    expect(l.text).toBe('see [blog](https://)');
    expect(l.text.slice(l.start, l.end)).toBe('https://');
    expect(linkTo('see blog', 4, 8, 'https://x.dev').text).toBe('see [blog](https://x.dev)');
  });
});

describe('diffSpan (áp sửa đổi qua lịch sử undo gốc)', () => {
  it('trả về đúng đoạn thay đổi', () => {
    expect(diffSpan('one two three', 'one **two** three')).toEqual({ from: 4, aEnd: 7, bEnd: 11 });
    expect(diffSpan('abc', 'abc')).toEqual({ from: 3, aEnd: 3, bEnd: 3 });
    const a = 'hello world', b = 'hello big world';
    const d = diffSpan(a, b);
    expect(a.slice(0, d.from) + b.slice(d.from, d.bEnd) + a.slice(d.aEnd)).toBe(b);
  });
});

describe('bảng', () => {
  const T = '| a | bb |\n| - | - |\n| 1 | 2 |';
  it('Tab căn lại cột rồi chọn ô kế tiếp', () => {
    const r = moveCell(T, 2, 1)!; // đang ở ô "a"
    expect(r.text).toBe('| a   | bb  |\n| --- | --- |\n| 1   | 2   |');
    expect(r.text.slice(r.start, r.end)).toBe('bb');
  });
  it('xuống hàng kế, bỏ qua hàng phân cách', () => {
    const t = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const r = moveCell(t, 8, 1)!; // cuối ô "b" của hàng tiêu đề
    expect(r.text.slice(r.start, r.end)).toBe('1');
  });
  it('ở ô cuối thì thêm hàng mới', () => {
    const t = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const r = moveCell(t, t.length - 3, 1)!;
    expect(r.text.split('\n').length).toBe(4);
    expect(r.text.split('\n')[3]).toMatch(/^\|\s+\|\s+\|$/);
    expect(r.start).toBe(r.text.lastIndexOf('\n') + 3);
  });
  it('Shift+Tab lùi về ô trước', () => {
    const t = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    const r = moveCell(t, t.indexOf('2'), -1)!;
    expect(r.text.slice(r.start, r.end)).toBe('1');
  });
  it('giữ căn lề trong hàng phân cách và dấu | thoát', () => {
    const r = moveCell('| a | b |\n| :-: | --: |\n| x\\|y | 2 |', 2, 1)!;
    expect(r.text.split('\n')[1]).toMatch(/^\| :--: \| --: \|$/);
    expect(r.text).toContain('x\\|y');
  });
  it('ngoài bảng thì null', () => expect(moveCell('plain\ntext', 2, 1)).toBeNull());
  it('tsvToRows và insertTable', () => {
    expect(tsvToRows('plain text')).toBeNull();
    expect(tsvToRows('one\ttwo')).toEqual([['one', 'two']]);
    expect(tsvToRows('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']]);
    const r = insertTable('', 0, 0, [['a', 'b'], ['1', '2']]);
    expect(r.text).toBe('| a   | b   |\n| --- | --- |\n| 1   | 2   |');
    expect(insertTable('x', 1, 1, [['p|q', 'r']]).text).toContain('p\\|q');
  });
});
