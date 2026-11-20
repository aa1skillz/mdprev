import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/lib/skills/frontmatter';

describe('parseFrontmatter', () => {
  it('đọc frontmatter cơ bản, thân và dòng bắt đầu của thân', () => {
    const r = parseFrontmatter('---\nname: a\n---\nhi');
    expect(r.data).toEqual({ name: 'a' });
    expect(r.body).toBe('hi');
    expect(r.bodyStartLine).toBe(4);
    expect(r.error).toBeUndefined();
  });

  it('chịu BOM và CRLF', () => {
    const r = parseFrontmatter('\uFEFF---\r\nname: a\r\ndescription: x\r\n---\r\nhello\r\nworld');
    expect(r.data).toEqual({ name: 'a', description: 'x' });
    expect(r.body).toBe('hello\nworld');
    expect(r.bodyStartLine).toBe(5);
  });

  it('không có frontmatter: data null, không lỗi, thân là cả file', () => {
    const r = parseFrontmatter('# Title\n\ntext');
    expect(r.data).toBeNull();
    expect(r.body).toBe('# Title\n\ntext');
    expect(r.bodyStartLine).toBe(1);
    expect(r.error).toBeUndefined();
  });

  it('khối --- không đóng: data null kèm thông báo lỗi, không ném', () => {
    const r = parseFrontmatter('---\nname: a\nno end');
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/not closed|unterminated/i);
    expect(r.bodyStartLine).toBe(1);
  });

  it('YAML sai: data null kèm lỗi, không ném; thân vẫn là phần sau dấu đóng', () => {
    const r = parseFrontmatter('---\nname: [oops\n---\nbody');
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
    expect(r.body).toBe('body');
    expect(r.bodyStartLine).toBe(4);
  });

  it('frontmatter không phải bản đồ (danh sách, chuỗi) bị coi là lỗi', () => {
    expect(parseFrontmatter('---\n- a\n- b\n---\nx').error).toMatch(/mapping/i);
    expect(parseFrontmatter('---\njust text\n---\nx').error).toMatch(/mapping/i);
  });

  it('frontmatter rỗng cho data là {}', () => {
    const r = parseFrontmatter('---\n---\nbody');
    expect(r.data).toEqual({});
    expect(r.body).toBe('body');
  });
});
