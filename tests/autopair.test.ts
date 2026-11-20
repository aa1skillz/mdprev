import { describe, expect, it } from 'vitest';
import { autoPair, backPair } from '../src/lib/studio/autopair';

/** Gõ lần lượt các phím vào văn bản có `|` là con trỏ; trả văn bản có `|`. */
const type = (init: string, keys: string): string => {
  let t = init.replace('|', ''), s = init.indexOf('|');
  for (const k of keys) {
    const r = autoPair(t, s, s, k);
    if (r) { t = r.text; s = r.start; } else { t = t.slice(0, s) + k + t.slice(s); s += 1; }
  }
  return t.slice(0, s) + '|' + t.slice(s);
};

describe('tự đóng cặp', () => {
  it('( thành () và nhảy qua ) khi gõ đóng', () => {
    expect(type('|', '(')).toBe('(|)');
    expect(type('|', '(ab)')).toBe('(ab)|');
    expect(type('|', '(a(b)c)')).toBe('(a(b)c)|');
  });
  it('sau ] thì không đóng cặp (liên kết/ảnh có gợi ý đóng riêng)', () => {
    expect(type('[a]|', '(')).toBe('[a](|');
    expect(type('![]|', '(')).toBe('![](|');
  });
  it('không đóng cặp trước chữ (không phá chữ đã có)', () => {
    expect(type('|abc', '(')).toBe('(|abc');
    expect(type('x|y', '"')).toBe('x"|y');
  });
  it('") chỉ là ký tự thường khi không có ( chưa đóng', () => {
    expect(type('a|', ')')).toBe('a)|');
    expect(type('(a) |', ')')).toBe('(a) )|');
  });
  it('dấu nháy kép: mở sau khoảng trắng, không đóng cặp sau chữ', () => {
    expect(type('nói |', '"')).toBe('nói "|"');
    expect(type('nói|', '"')).toBe('nói"|');
    expect(type('|', '"hi"')).toBe('"hi"|');
  });
  it('dấu huyền: `code` và gõ ``` ra đúng ba dấu', () => {
    expect(type('|', '`x`')).toBe('`x`|');
    expect(type('|', '```')).toBe('```|');
  });
  it('không đụng [ ] { } \' * _ (Telex dùng [ ] ; dấu lược trong chữ)', () => {
    for (const k of ['[', ']', '{', '}', "'", '*', '_', '$']) expect(autoPair('|', 0, 0, k)).toBeNull();
    expect(type('don|', "'")).toBe("don'|");
  });
  it('có vùng chọn thì để wrapKey xử lý', () => {
    expect(autoPair('abc', 0, 3, '(')).toBeNull();
  });
  it('Backspace giữa cặp rỗng xoá cả hai; còn lại thì không', () => {
    expect(backPair('()', 1, 1)).toMatchObject({ text: '', start: 0 });
    expect(backPair('a""b', 2, 2)).toMatchObject({ text: 'ab', start: 1 });
    expect(backPair('(a)', 1, 1)).toBeNull();
    expect(backPair('()', 0, 0)).toBeNull();
    expect(backPair('()', 1, 2)).toBeNull();
  });
});
