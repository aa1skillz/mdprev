import { describe, expect, it } from 'vitest';
import { tokenizeLines } from '../src/lib/studio/tokenize';
import { fixTrailing, lint } from '../src/lib/studio/lint';
import { alignTableAt, indentLines, smartEnter, wrapKey } from '../src/lib/studio/edit';
import { expand, findAll, lineStartsOf, locate, replaceAll, replaceOne, segments } from '../src/lib/studio/find';
import { diffLines, myers } from '../src/lib/studio/diff';
import { canShare, decodeShare, encodeShare } from '../src/lib/studio/share';

const rejoin = (src: string) => tokenizeLines(src).map((t) => t.map((s) => s.text).join('')).join('\n');

describe('tokenize: tô màu mới', () => {
  it('giữ nguyên văn bản qua mọi loại khối code', () => {
    const src = [
      '```ts', "const a: number = 1; // note", 'const s = `tpl ${x}` + "str\\"q" + 0x1F;', '```', '```json', '{ "k": "v", "n": 12, "b": true }', '```', '```sh',
      'git commit --amend -m "msg" # c', 'echo $HOME', '```', '```py', 'def f(x): return "a" # c', '```', '```yaml', 'name: x # c', 'on: true', '```', '```html',
      '<div class="a">text</div> <!-- c -->', '```', '```css', 'a { color: red; /* c */ }', '```', '```sql', 'SELECT * FROM t WHERE a = 1 -- c', '```', '```rust', 'fn main() { let x = 1; }', '```',
      '```unknown', 'whatever [x] **y**', '```', '```markdown', '# Heading **b**', '- [x] a', '| a | b |', '|---|---|', '```', '````', '```', '````', '```ts', 'unterminated',
    ].join('\n');
    expect(rejoin(src)).toBe(src);
  });
  it('code: từ khoá, chuỗi, chú thích, số, khoá JSON, cờ lệnh', () => {
    const cls = (src: string, i = 1) => tokenizeLines(src)[i]!.filter((s) => s.cls !== 'cb').map((s) => `${s.cls}:${s.text.trim()}`);
    expect(cls('```ts\nconst x = "a" + 1; // c')).toEqual(['ck:const', 'cs:"a"', 'cn:1', 'cc:// c']);
    expect(cls('```json\n{ "k": "v" }')).toEqual(['cp:"k"', 'cs:"v"']);
    expect(cls('```sh\nls --all # c')).toEqual(['cp:--all', 'cc:# c']);
    expect(cls('```html\n<a href="x">')).toEqual(['ck:<a', 'cs:"x"', 'ck:>']);
    expect(cls('```yaml\nname: x')).toEqual(['cp:name']);
  });
  it('khối ```markdown được tô như Markdown; ngôn ngữ lạ thì một màu', () => {
    const t = tokenizeLines('```markdown\n# Title\n- [x] a\n```\n```zzz\n# not heading\n```');
    expect(t[1]!.map((s) => s.cls)).toContain('mk h');
    expect(t[2]!.map((s) => s.cls)).toContain('task-done');
    expect(t[5]!.map((s) => s.cls)).toEqual(['cb']);
  });
  it('dòng đóng fence là cf; fence 4 backtick không bị đóng bởi 3', () => {
    const t = tokenizeLines('````\n```\n````\nafter');
    expect(t[2]!.map((s) => s.cls)).toEqual(['cf']);
    expect(t[1]!.map((s) => s.cls)).toEqual(['cb']);
    expect(t[3]!.map((s) => s.cls)).toEqual(['']);
  });
  it('inline mới: escape, thẻ HTML, chú thích, tiêu đề bảng, hàng phân cách', () => {
    const cls = (src: string, i = 0) => tokenizeLines(src)[i]!.filter((s) => s.cls).map((s) => `${s.cls}:${s.text}`);
    expect(cls('a \\* b')).toEqual(['esc:\\*']);
    expect(cls('x <b>y</b>')).toEqual(['tag:<b>', 'tag:</b>']);
    expect(cls('see[^1] and')).toEqual(['ref:[^1]']);
    expect(cls('[^1]: note')).toEqual(['ref:[^1]:']);
    const t = tokenizeLines('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(t[0]!.some((s) => s.cls === 'tbh')).toBe(true);
    expect(t[1]!.map((s) => s.cls)).toEqual(['tbs']);
    expect(t[2]!.some((s) => s.cls === 'tbh')).toBe(false);
  });
});

describe('lint: heading trùng theo cùng cha, sửa khoảng trắng', () => {
  it('cùng tên dưới hai mục cha khác nhau thì không báo; cùng cha thì báo', () => {
    expect(lint('# T\n\n## A\n\n### Considerations\n\n## B\n\n### Considerations\n')).toEqual([]);
    expect(lint('# T\n\n## A\n\n### X\n\n### X\n').map((i) => i.message)).toEqual(['Duplicate heading, first on line 5']);
  });
  it('fixTrailing chỉ sửa các dòng bị báo', () => {
    const src = 'a \nb  \nc   \n```\nd   \n```\n';
    expect(fixTrailing(src)).toBe('a\nb  \nc\n```\nd   \n```\n');
    expect(fixTrailing('ok\n')).toBe('ok\n');
  });
});

describe('soạn thông minh', () => {
  it('Enter tiếp tục danh sách, đánh số, task, trích dẫn', () => {
    expect(smartEnter('- a', 3, 3)!.text).toBe('- a\n- ');
    expect(smartEnter('1. a', 4, 4)!.text).toBe('1. a\n2. ');
    expect(smartEnter('  * a', 5, 5)!.text).toBe('  * a\n  * ');
    expect(smartEnter('- [x] a', 7, 7)!.text).toBe('- [x] a\n- [ ] ');
    expect(smartEnter('> q', 3, 3)!.text).toBe('> q\n> ');
    const mid = smartEnter('- ab', 3, 3)!;
    expect(mid.text).toBe('- a\n- b');
    expect(mid.text.slice(mid.start)).toBe('b');
  });
  it('Enter ở mục trống thì thoát; mục lồng nhau thì lùi một cấp', () => {
    expect(smartEnter('- a\n- ', 6, 6)!.text).toBe('- a\n');
    expect(smartEnter('- a\n  - ', 8, 8)!.text).toBe('- a\n- ');
    expect(smartEnter('> q\n> ', 6, 6)!.text).toBe('> q\n');
  });
  it('không can thiệp ngoài danh sách, trong khối code, hay khi có vùng chọn', () => {
    expect(smartEnter('plain', 5, 5)).toBeNull();
    expect(smartEnter('```\n- a', 7, 7)).toBeNull();
    expect(smartEnter('- abc', 3, 5)).toBeNull();
    expect(smartEnter('- a', 1, 1)).toBeNull(); // con trỏ nằm trong dấu đầu dòng
  });
  it('Tab / Shift+Tab: thụt, lùi mục danh sách và vùng chọn nhiều dòng', () => {
    expect(indentLines('- a', 3, 3, 1)!.text).toBe('  - a');
    expect(indentLines('  - a', 5, 5, -1)!.text).toBe('- a');
    expect(indentLines('plain', 2, 2, 1)).toBeNull();
    expect(indentLines('- a', 3, 3, -1)).toBeNull(); // không còn gì để lùi: để Shift+Tab chuyển focus
    const m = indentLines('a\nb\nc', 0, 5, 1)!;
    expect(m.text).toBe('  a\n  b\n  c');
    expect(indentLines('  a\n    b', 0, 9, -1)!.text).toBe('a\n  b');
  });
  it('gõ ký tự lên vùng chọn thì bọc, không bọc khi không chọn (Telex dùng [ ])', () => {
    const r = wrapKey('one two', 4, 7, '*')!;
    expect(r.text).toBe('one *two*');
    expect(r.text.slice(r.start, r.end)).toBe('two');
    expect(wrapKey('x', 0, 1, '[')!.text).toBe('[x]');
    expect(wrapKey('x', 0, 0, '[')).toBeNull();
    expect(wrapKey('x', 0, 1, 'a')).toBeNull();
  });
  it('alignTableAt căn bảng chứa vị trí, trả delta; đã căn thì null', () => {
    const t = '| a | bb |\n|-|-|\n| 1 | 2 |\n\nafter';
    const r = alignTableAt(t, 3)!;
    expect(r.text).toBe('| a   | bb  |\n| --- | --- |\n| 1   | 2   |\n\nafter');
    expect(r.delta).toBe(r.text.length - t.length);
    expect(alignTableAt(r.text, 3)).toBeNull();
    expect(alignTableAt('no table', 2)).toBeNull();
  });
});

describe('find và replace', () => {
  it('tìm thường, phân biệt hoa thường, regex, regex sai', () => {
    expect(findAll('Foo foo FOO', 'foo', { regex: false, caseSensitive: false }).matches.map((m) => m.index)).toEqual([0, 4, 8]);
    expect(findAll('Foo foo FOO', 'foo', { regex: false, caseSensitive: true }).matches.map((m) => m.index)).toEqual([4]);
    expect(findAll('a1 b22', '\\d+', { regex: true, caseSensitive: false }).matches.map((m) => m.length)).toEqual([1, 2]);
    expect(findAll('a.b', '.', { regex: false, caseSensitive: false }).matches.length).toBe(1); // dấu chấm là chữ khi không bật regex
    expect(findAll('x', '(', { regex: true, caseSensitive: false }).error).toBeTruthy();
    expect(findAll('x', '', { regex: false, caseSensitive: false }).matches).toEqual([]);
    expect(findAll('aaa', '^', { regex: true, caseSensitive: false }).matches).toEqual([]); // khớp rỗng bị bỏ
  });
  it('thay một, thay tất cả, $1 và $& chỉ ở chế độ regex', () => {
    const t = 'a1 b2';
    const { matches } = findAll(t, '([a-z])(\\d)', { regex: true, caseSensitive: false });
    expect(replaceAll(t, matches, '$2$1', true)).toBe('1a 2b');
    expect(replaceAll(t, matches, '[$&]', true)).toBe('[a1] [b2]');
    expect(replaceAll(t, matches, '$$', true)).toBe('$ $');
    expect(replaceAll('a.b', findAll('a.b', '.', { regex: false, caseSensitive: false }).matches, '$1', false)).toBe('a$1b');
    const one = replaceOne(t, matches[1]!, 'X', true);
    expect(one.text).toBe('a1 X');
    expect(one.text.slice(one.start, one.end)).toBe('X');
    expect(expand('$9', t, matches[0]!, true)).toBe('');
  });
  it('locate và segments theo dòng, kể cả kết quả nhiều dòng', () => {
    const t = 'ab\ncd\nef';
    const st = lineStartsOf(t);
    expect(st).toEqual([0, 3, 6]);
    expect(locate(st, 4)).toEqual({ line: 1, col: 1 });
    expect(locate(st, 0)).toEqual({ line: 0, col: 0 });
    expect(segments(st, t, { index: 1, length: 6, groups: [] })).toEqual([{ line: 0, col: 1, len: 1 }, { line: 1, col: 0, len: 2 }, { line: 2, col: 0, len: 1 }]);
  });
});

describe('diffLines', () => {
  const d = (a: string, b: string) => diffLines(a.split('\n'), b.split('\n'));
  it('giống nhau thì không có dấu', () => expect(d('a\nb', 'a\nb')).toEqual({ added: [], modified: [], deleted: [] }));
  it('thêm dòng, sửa dòng, xoá dòng', () => {
    expect(d('a\nb', 'a\nx\nb')).toEqual({ added: [2], modified: [], deleted: [] });
    expect(d('a\nb\nc', 'a\nB\nc')).toEqual({ added: [], modified: [2], deleted: [] });
    expect(d('a\nb\nc', 'a\nc')).toEqual({ added: [], modified: [], deleted: [2] });
  });
  it('sửa một dòng thành nhiều dòng: dòng đầu là sửa, còn lại là thêm', () => {
    expect(d('a\nb\nc', 'a\nb1\nb2\nb3\nc')).toEqual({ added: [3, 4], modified: [2], deleted: [] });
  });
  it('thêm ở cuối và xoá ở cuối', () => {
    expect(d('a', 'a\nb\nc')).toEqual({ added: [2, 3], modified: [], deleted: [] });
    expect(d('a\nb', 'a')).toEqual({ added: [], modified: [], deleted: [1] });
  });
  it('myers: áp dãy thao tác lên A luôn ra đúng B (thử ngẫu nhiên)', () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 300; t++) {
      const a = Array.from({ length: Math.floor(rnd() * 12) }, () => String(Math.floor(rnd() * 4)));
      const b = Array.from({ length: Math.floor(rnd() * 12) }, () => String(Math.floor(rnd() * 4)));
      const ops = myers(a, b)!;
      let i = 0; const out: string[] = [];
      for (const op of ops) { if (op === 0) { expect(a[i]).toBe(b[out.length]); out.push(a[i]!); i++; } else if (op < 0) i++; else out.push(b[out.length]!); }
      expect(i).toBe(a.length);
      expect(out).toEqual(b);
    }
  });
  it('tài liệu lớn vẫn nhanh', () => {
    const a = Array.from({ length: 3000 }, (_, i) => 'line ' + i), b = a.slice();
    b[10] = 'changed'; b.splice(1500, 0, 'new'); b.splice(2500, 3);
    const t0 = performance.now();
    const r = diffLines(a, b);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(r.modified).toEqual([11]);
    expect(r.added).toEqual([1501]);
    expect(r.deleted.length).toBe(1);
  });
});

describe('share', () => {
  it('có CompressionStream (Node 22)', () => expect(canShare()).toBe(true));
  it('mã hoá rồi giải mã lại đúng, kể cả tiếng Việt và emoji', async () => {
    const t = '# Tiêu đề\n\nTiếng Việt có dấu, emoji 🙂 và `code`.\n'.repeat(20);
    const p = await encodeShare(t);
    expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(p.length).toBeLessThan(t.length);
    expect(await decodeShare(p)).toBe(t);
  });
  it('payload hỏng hoặc quá lớn thì trả null', async () => {
    expect(await decodeShare('not-valid-@@@')).toBeNull();
    expect(await decodeShare('AAAA')).toBeNull();
    const big = await encodeShare('x'.repeat(500_000));
    expect(await decodeShare(big, 100_000)).toBeNull();
    expect(await decodeShare(big)).toBe('x'.repeat(500_000));
  });
});
