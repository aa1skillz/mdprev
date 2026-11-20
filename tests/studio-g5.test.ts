import { describe, expect, it } from 'vitest';
import { tableEnter, tableOp } from '../src/lib/studio/edit';
import { deleteLines, duplicateLines, linkAt, moveLines, moveSection, sections, selectLines, selectNext, swapSection } from '../src/lib/studio/lineops';
import { applySlash, filterSlash, SLASH, slashAt, tocOf } from '../src/lib/studio/slash';
import { altFromName, isImage } from '../src/lib/studio/assets';
import { clock } from '../src/lib/studio/present';
import { applyCompletion, completionAt, completionItems } from '../src/lib/studio/complete';

const sel = (r: { text: string; start: number; end: number }) => r.text.slice(r.start, r.end);

describe('moveLines', () => {
  it('đổi chỗ dòng hiện tại với dòng trên/dưới, con trỏ đi theo', () => {
    const t = 'a\nbb\nc';
    const up = moveLines(t, 3, 3, -1)!;
    expect(up.text).toBe('bb\na\nc');
    expect(up.start).toBe(0 + 1);
    const down = moveLines(t, 3, 3, 1)!;
    expect(down.text).toBe('a\nc\nbb');
    expect(down.text.slice(down.start - 1, down.start + 1)).toBe('bb');
  });
  it('khối nhiều dòng; mép văn bản trả null', () => {
    const r = moveLines('1\n2\n3\n4', 2, 5, 1)!; // chọn từ dòng 2 tới giữa dòng 3
    expect(r.text).toBe('1\n4\n2\n3');
    expect(sel(r)).toBe('2\n3');
    expect(moveLines('a\nb', 0, 0, -1)).toBeNull();
    expect(moveLines('a\nb', 2, 2, 1)).toBeNull();
  });
  it('vùng chọn dừng ở đầu dòng kế thì không kéo dòng đó theo', () => {
    const r = moveLines('x\ny\nz', 0, 2, 1)!;
    expect(r.text).toBe('y\nx\nz');
  });
});

describe('duplicate, delete, select line, select next', () => {
  it('nhân đôi xuống: vùng chọn ở bản mới', () => {
    const r = duplicateLines('a\nb', 0, 1, 1);
    expect(r.text).toBe('a\na\nb');
    expect(r.start).toBe(2);
    expect(duplicateLines('a\nb', 0, 1, -1).start).toBe(0);
  });
  it('xoá dòng giữa và dòng cuối', () => {
    expect(deleteLines('a\nb\nc', 2, 2)).toEqual({ text: 'a\nc', start: 2, end: 2 });
    expect(deleteLines('a\nb\nc', 4, 4)).toEqual({ text: 'a\nb', start: 2, end: 2 });
    expect(deleteLines('only', 1, 1)).toEqual({ text: '', start: 0, end: 0 });
  });
  it('chọn dòng rồi nới thêm', () => {
    const t = 'one\ntwo\nthree';
    const a = selectLines(t, 5, 5);
    expect(sel(a)).toBe('two\n');
    expect(sel(selectLines(t, a.start, a.end))).toBe('two\nthree');
  });
  it('chọn từ, rồi lần xuất hiện kế (vòng lại)', () => {
    const t = 'cat dog cat bird cat';
    const w = selectNext(t, 1, 1)!;
    expect(sel(w)).toBe('cat');
    const n1 = selectNext(t, w.start, w.end)!;
    expect(n1.start).toBe(8);
    const n2 = selectNext(t, n1.start, n1.end)!;
    expect(n2.start).toBe(17);
    expect(selectNext(t, n2.start, n2.end)!.start).toBe(0);
    expect(sel(selectNext('Tiếng Việt', 2, 2)!)).toBe('Tiếng');
    expect(selectNext('a  b', 2, 2)).toBeNull();
  });
});

describe('linkAt', () => {
  const t = 'See [setup](#cài-đặt) and [docs](https://x.dev/a) or <https://y.dev>\n[ref]: ./other.md\nbare https://z.dev/p here';
  it('anchor, url, ngoặc nhọn, định nghĩa, URL trần', () => {
    expect(linkAt(t, 6)).toEqual({ kind: 'anchor', id: 'cài-đặt' });
    expect(linkAt(t, t.indexOf('docs'))).toEqual({ kind: 'url', url: 'https://x.dev/a' });
    expect(linkAt(t, t.indexOf('y.dev'))).toEqual({ kind: 'url', url: 'https://y.dev' });
    expect(linkAt(t, t.indexOf('[ref]') + 2)).toEqual({ kind: 'relative', href: './other.md' });
    expect(linkAt(t, t.indexOf('z.dev'))).toEqual({ kind: 'url', url: 'https://z.dev/p' });
    expect(linkAt(t, 1)).toBeNull();
  });
  it('bỏ scheme lạ', () => {
    expect(linkAt('[x](javascript:alert(1))', 2)).toBeNull();
  });
});

describe('sections, moveSection, swapSection', () => {
  const doc = '# T\n\n## A\n\na\n\n### A1\n\na1\n\n## B\n\nb\n\n```\n## not\n```\n\n## C\n\nc\n';
  it('mục kết thúc ở heading cùng cấp hoặc cao hơn; bỏ qua khối code', () => {
    const s = sections(doc);
    expect(s.map((x) => [x.line, x.level, x.end])).toEqual([[1, 1, 23], [3, 2, 11], [7, 3, 11], [11, 2, 19], [19, 2, 23]]);
    expect(s[1]!.id).toBe('a');
  });
  it('chuyển A (kèm A1) xuống trước C', () => {
    const r = moveSection(doc, 3, 19)!;
    const heads = r.text.split('\n').filter((l) => /^#+ /.test(l) && l !== '## not');
    expect(heads).toEqual(['# T', '## B', '## C'.replace('C', 'A'), '### A1', '## C']);
    expect(r.text.slice(r.start, r.start + 4)).toBe('## A');
    expect(r.text).toContain('```\n## not\n```');
  });
  it('chuyển C lên trước A; chuyển A về cuối', () => {
    const up = moveSection(doc, 19, 3)!;
    expect(up.text.split('\n').filter((l) => /^#+ /.test(l) && l !== '## not')).toEqual(['# T', '## C', '## A', '### A1', '## B']);
    const end = moveSection(doc, 3, 0)!;
    expect(end.text.split('\n').filter((l) => /^#+ /.test(l) && l !== '## not')).toEqual(['# T', '## B', '## C', '## A', '### A1']);
    expect(end.text.endsWith('a1\n')).toBe(true);
  });
  it('không thả vào chính nó', () => {
    expect(moveSection(doc, 3, 7)).toBeNull();
    expect(moveSection(doc, 4, 11)).toBeNull();
  });
  it('swap với mục anh em', () => {
    const d = swapSection(doc, 3, 1)!;
    expect(d.text.split('\n').filter((l) => /^#+ /.test(l) && l !== '## not')).toEqual(['# T', '## B', '## A', '### A1', '## C']);
    const u = swapSection(doc, 19, -1)!;
    expect(u.text.split('\n').filter((l) => /^#+ /.test(l) && l !== '## not')).toEqual(['# T', '## A', '### A1', '## C', '## B']);
    const last = swapSection(doc, 11, 1)!;
    expect(last.text.split('\n').filter((l) => /^#+ /.test(l) && l !== '## not')).toEqual(['# T', '## A', '### A1', '## C', '## B']);
    expect(swapSection(doc, 3, -1)).toBeNull();
    expect(swapSection(doc, 7, 1)).toBeNull();
  });
});

describe('tableEnter', () => {
  const t = '| a | b |\n| --- | --- |\n| 1 | 2 |';
  it('thêm hàng dưới hàng hiện tại, con trỏ ở ô đầu', () => {
    const r = tableEnter(t, t.length, t.length)!;
    const ls = r.text.split('\n');
    expect(ls).toHaveLength(4);
    expect(ls[3]).toMatch(/^\|\s+\|\s+\|$/);
    expect(r.start).toBe(r.text.lastIndexOf('\n') + 3);
  });
  it('ở hàng tiêu đề thì thêm dưới hàng phân cách', () => {
    const r = tableEnter(t, 3, 3)!;
    expect(r.text.split('\n')[2]).toMatch(/^\|\s+\|\s+\|$/);
  });
  it('hàng cuối trống: bỏ hàng và ra khỏi bảng, chừa một dòng trống', () => {
    const r1 = tableEnter(t, t.length, t.length)!;
    const r2 = tableEnter(r1.text, r1.start, r1.start)!;
    expect(r2.text.split('\n')).toHaveLength(5);
    expect(r2.text.endsWith('|\n\n')).toBe(true);
    expect(r2.start).toBe(r2.text.length);
    const withNext = tableEnter(r1.text + '\nNext', r1.start, r1.start)!;
    expect(withNext.text.endsWith('\n\n\nNext')).toBe(true);
  });
  it('không phải bảng hoặc chưa có hàng phân cách: null', () => {
    expect(tableEnter('plain', 2, 2)).toBeNull();
    expect(tableEnter('| a |', 2, 2)).toBeNull();
  });
});

describe('slash', () => {
  it('chỉ bật ở đầu dòng, ngoài khối code, trước khi có dấu cách', () => {
    expect(slashAt('/', 1)).toEqual({ start: 0, q: '' });
    expect(slashAt('x\n  /tab', 8)).toEqual({ start: 4, q: 'tab' });
    expect(slashAt('a /b', 4)).toBeNull();
    expect(slashAt('/etc/hosts', 10)).toBeNull();
    expect(slashAt('/a b', 4)).toBeNull();
    expect(slashAt('```\n/x', 6)).toBeNull();
    expect(slashAt('```\nx\n```\n/x', 12)).toEqual({ start: 10, q: 'x' });
  });
  it('lọc: khớp đầu nhãn trước, rồi từ khoá', () => {
    expect(filterSlash('tab')[0]!.id).toBe('table');
    expect(filterSlash('callout').map((i) => i.id)).toEqual(['note', 'tip', 'important', 'warning', 'caution']);
    expect(filterSlash('')).toHaveLength(SLASH.length);
    expect(filterSlash('zzz')).toEqual([]);
  });
  it('chèn và đặt con trỏ', () => {
    const it2 = SLASH.find((i) => i.id === 'h2')!;
    const r = applySlash('a\n/h2\nb', 2, 5, it2);
    expect(r.text).toBe('a\n## \nb');
    expect(r.start).toBe(5);
    const code = applySlash('/code', 0, 5, SLASH.find((i) => i.id === 'code')!);
    expect(code.text).toBe('```\n\n```');
    expect(code.start).toBe(3);
    const d = applySlash('/date', 0, 5, SLASH.find((i) => i.id === 'date')!, new Date(2026, 10, 13, 9, 5));
    expect(d.text).toBe('2026-11-13');
  });
  it('mục lục từ h2/h3, đúng id', () => {
    expect(tocOf('# T\n## Một hai\n### `x` sub\n```\n## no\n```\n## Một hai\n')).toBe('- [Một hai](#một-hai)\n  - [x sub](#x-sub)\n- [Một hai](#một-hai-1)');
  });
});

describe('assets, clock', () => {
  it('nhận ảnh đúng loại và cỡ; alt từ tên file', () => {
    expect(isImage({ type: 'image/png', size: 10 })).toBe(true);
    expect(isImage({ type: 'image/tiff', size: 10 })).toBe(false);
    expect(isImage({ type: 'image/png', size: 9 * 1024 * 1024 })).toBe(false);
    expect(altFromName('raft-leader_election.png')).toBe('raft leader election');
    expect(altFromName('image.png')).toBe('image');
  });
  it('đồng hồ', () => {
    expect(clock(0)).toBe('00:00');
    expect(clock(65_000)).toBe('01:05');
    expect(clock(3_725_000)).toBe('1:02:05');
  });
});

describe('tableOp', () => {
  const T = '| Name | Qty |\n| --- | --- |\n| Bơ | 10 |\n| an | 2 |\n| Ă | 100 |';
  const lines = (r: { text: string }) => r.text.split('\n');
  const at = (s: string, needle: string) => s.indexOf(needle) + 1;
  it('thêm/xoá hàng, ở tiêu đề thì thêm dưới phân cách; không xoá được tiêu đề', () => {
    expect(lines(tableOp(T, at(T, 'Bơ'), 'row-above')!)[2]).toMatch(/^\|\s+\|\s+\|$/);
    expect(lines(tableOp(T, at(T, 'Bơ'), 'row-below')!)[3]).toMatch(/^\|\s+\|\s+\|$/);
    expect(lines(tableOp(T, 2, 'row-below')!)[2]).toMatch(/^\|\s+\|\s+\|$/);
    expect(lines(tableOp(T, at(T, 'an'), 'row-del')!)).toHaveLength(4);
    expect(tableOp(T, 2, 'row-del')).toBeNull();
  });
  it('thêm/xoá cột', () => {
    const r = tableOp(T, at(T, 'Qty'), 'col-right')!;
    expect(lines(r)[0]).toMatch(/\| Qty\s+\| Column \|$/);
    expect(r.text.slice(r.start, r.start + 6)).toBe('Column');
    expect(lines(tableOp(T, at(T, 'Qty'), 'col-del')!)[0]).toMatch(/^\| Name \|$/);
    expect(tableOp('| a |\n| --- |\n| 1 |', 2, 'col-del')).toBeNull();
  });
  it('căn cột; bấm lại thì bỏ căn', () => {
    const r = tableOp(T, at(T, 'Qty'), 'align-right')!;
    expect(lines(r)[1]).toMatch(/-:\s*\|$/);
    expect(lines(tableOp(r.text, at(r.text, 'Qty'), 'align-right')!)[1]).not.toContain(':');
    expect(lines(tableOp(T, 2, 'align-center')!)[1]).toMatch(/^\| :-+: \|/);
  });
  it('sắp xếp: số theo giá trị, chữ theo tiếng Việt, tiêu đề đứng yên', () => {
    const q = lines(tableOp(T, at(T, 'Qty'), 'sort-asc')!).slice(2).map((l) => l.split('|')[2]!.trim());
    expect(q).toEqual(['2', '10', '100']);
    const d = lines(tableOp(T, at(T, 'Qty'), 'sort-desc')!).slice(2).map((l) => l.split('|')[2]!.trim());
    expect(d).toEqual(['100', '10', '2']);
    const n = lines(tableOp(T, at(T, 'Name'), 'sort-asc')!);
    expect(n[0]).toMatch(/Name/);
    expect(n.slice(2).map((l) => l.split('|')[1]!.trim())).toEqual(['an', 'Ă', 'Bơ']);
  });
});

describe('completion', () => {
  const heads = [{ id: 'cài-đặt', text: 'Cài đặt', level: 2 }, { id: 'usage', text: 'Usage', level: 2 }];
  const ctx = (text: string) => ({ heads, text, assets: [{ id: 'abc123.png', name: 'raft-diagram.png' }] });
  it('ngữ cảnh: anchor, chú thích, ảnh; bỏ qua code và định nghĩa đầu dòng', () => {
    expect(completionAt('see [x](#ca', 11)).toEqual({ kind: 'anchor', start: 9, q: 'ca' });
    expect(completionAt('word[^', 6)).toEqual({ kind: 'footnote', start: 6, q: '' });
    expect(completionAt('[^', 2)).toBeNull();
    expect(completionAt('![](', 4)).toMatchObject({ kind: 'image', start: 4, q: '', altStart: 2, altEnd: 2 });
    expect(completionAt('`[x](#a', 7)).toBeNull();
    expect(completionAt('```\n[x](#a', 10)).toBeNull();
    expect(completionAt('[x](#a b', 8)).toBeNull();
  });
  it('lọc không dấu', () => {
    const at = completionAt('[x](#cai dat', 12);
    expect(at).toBeNull(); // dấu cách kết thúc ngữ cảnh
    const at2 = completionAt('[x](#cai', 8)!;
    expect(completionItems(at2, ctx('')).map((i) => i.id)).toEqual(['cài-đặt']);
  });
  it('chèn anchor, thêm ) khi chưa có, không nhân đôi khi đã có', () => {
    const t = 'go [x](#us';
    const at = completionAt(t, t.length)!;
    const it = completionItems(at, ctx(t))[0]!;
    const r = applyCompletion(t, at, t.length, it);
    expect(r.text).toBe('go [x](#usage)');
    expect(r.start).toBe(r.text.length);
    const t2 = 'go [x](#us) more';
    const r2 = applyCompletion(t2, completionAt(t2, 10)!, 10, it);
    expect(r2.text).toBe('go [x](#usage) more');
    expect(r2.start).toBe(14);
  });
  it('chú thích và ảnh (điền alt khi trống)', () => {
    const t = 'claim[^\n\n[^src]: The source\n';
    const at = completionAt(t, 7)!;
    const items = completionItems(at, ctx(t));
    expect(items.map((i) => i.label)).toEqual(['^src']);
    expect(applyCompletion(t, at, 7, items[0]!).text.startsWith('claim[^src]\n')).toBe(true);
    const im = '![](';
    const ai = completionAt(im, 4)!;
    const r = applyCompletion(im, ai, 4, completionItems(ai, ctx(im))[0]!, () => 'raft diagram');
    expect(r.text).toBe('![raft diagram](asset:abc123.png)');
    expect(r.start).toBe(r.text.length);
  });
});
