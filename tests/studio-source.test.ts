import { describe, expect, it } from 'vitest';
import { fileNameFromUrl, resolveAsset, resolveLink, rewriteHtml, sourceLabel, toRawUrl, toViewUrl } from '../src/lib/studio/source';

const RAW = 'https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md';

describe('toRawUrl', () => {
  it('đổi link blob GitHub sang raw', () => {
    expect(toRawUrl('https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md')).toBe(RAW);
    expect(toRawUrl(' https://github.com/anthropics/skills/raw/main/skills/mcp-builder/SKILL.md ')).toBe(RAW);
  });
  it('giữ URL raw, nhận URL .md ở nơi khác, từ chối còn lại', () => {
    expect(toRawUrl(RAW + '#x')).toBe(RAW);
    expect(toRawUrl('https://example.com/docs/a.md')).toBe('https://example.com/docs/a.md');
    expect(toRawUrl('https://example.com/docs/a.html')).toBeNull();
    expect(toRawUrl('https://github.com/anthropics/skills')).toBeNull();
    expect(toRawUrl('javascript:alert(1)')).toBeNull();
    expect(toRawUrl('not a url')).toBeNull();
  });
});

describe('toViewUrl', () => {
  it('raw -> blob, thư mục -> tree, giữ hash', () => {
    expect(toViewUrl('https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/reference/a.md#h'))
      .toBe('https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/a.md#h');
    expect(toViewUrl('https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/scripts/'))
      .toBe('https://github.com/anthropics/skills/tree/main/skills/mcp-builder/scripts/');
    expect(toViewUrl('https://example.com/a.md')).toBe('https://example.com/a.md');
  });
});

describe('resolveLink', () => {
  it('link .md tương đối: có raw để tải và giữ anchor', () => {
    expect(resolveLink('./reference/node_mcp_server_v2.md#verify-your-server', RAW)).toEqual({
      href: 'https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server_v2.md#verify-your-server',
      md: 'https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/reference/node_mcp_server_v2.md#verify-your-server',
    });
  });
  it('xử lý ../ và file không phải Markdown', () => {
    const base = 'https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/reference/a.md';
    expect(resolveLink('../LICENSE.txt', base)).toEqual({ href: 'https://github.com/anthropics/skills/blob/main/skills/mcp-builder/LICENSE.txt', md: null });
    expect(resolveLink('b.md', base)?.md).toBe('https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/reference/b.md');
  });
  it('bỏ qua anchor, link tuyệt đối, mailto, //host', () => {
    for (const h of ['#top', 'https://x.com/a.md', 'mailto:a@b.c', '//x.com/a.md', '']) expect(resolveLink(h, RAW)).toBeNull();
  });
});

describe('rewriteHtml', () => {
  it('viết lại link và ảnh tương đối, không đụng phần còn lại', () => {
    const out = rewriteHtml('<p><a href="./a.md#x">A</a> <a href="#top">T</a> <a href="https://e.com">E</a> <a href="scripts/">S</a> <img src="img/p.png" alt="p"></p>', RAW);
    expect(out).toContain('href="https://github.com/anthropics/skills/blob/main/skills/mcp-builder/a.md#x" data-md="https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/a.md#x" target="_blank" rel="noopener noreferrer"');
    expect(out).toContain('<a href="#top">');
    expect(out).toContain('<a href="https://e.com">');
    expect(out).toContain('href="https://github.com/anthropics/skills/tree/main/skills/mcp-builder/scripts/" target="_blank" rel="noopener noreferrer"');
    expect(out).toContain('src="https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/img/p.png"');
  });
  it('không có base thì giữ nguyên', () => {
    const h = '<a href="./a.md">A</a>';
    expect(rewriteHtml(h, null)).toBe(h);
  });
});

describe('nhãn', () => {
  it('sourceLabel và fileNameFromUrl', () => {
    expect(sourceLabel(RAW)).toBe('anthropics/skills · skills/mcp-builder/SKILL.md');
    expect(fileNameFromUrl(RAW + '#x')).toBe('SKILL.md');
    expect(resolveAsset('a.png', RAW)).toBe('https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/a.png');
  });
});
