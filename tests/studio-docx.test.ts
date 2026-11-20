import { describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import { unzipSync, strFromU8 } from 'fflate';
import { docxBuffer } from '../src/lib/studio/docx';

const MD = `---
title: Ignored front matter
---
# Raft notes

Intro with **bold**, *italic*, ~~gone~~, \`code\` and a [link](https://raft.github.io) and a [jump](#cài-đặt).[^src]

## Cài đặt

1. one
2. two
   - nested
3. three

- [x] done
- [ ] todo

> [!WARNING]
> Careful here.

> plain quote

| Nodes | Quorum |
| ---: | :---: |
| 3 | 2 |
| 5 | 3 |

\`\`\`ts
const x = 1;
const y = 2;
\`\`\`

$$
A(n) = \\sum_k p^k
$$

---

![alt text](asset:abc.png)

[^src]: Ongaro and Ousterhout, 2014.
`;

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

describe('docx', () => {
  it('dựng file Word đọc được: tiêu đề, định dạng chữ, danh sách, bảng, chú thích, link', async () => {
    const buf = await docxBuffer(MD, { image: async (u) => (u === 'asset:abc.png' ? { data: PNG, type: 'png', width: 1, height: 1 } : null) });
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(buf) });
    expect(html).toContain('<h1>');
    expect(html).toMatch(/<h1>(<a id="[^"]+"><\/a>)?Raft notes<\/h1>/);
    expect(html).toMatch(/<h2>(<a id="[^"]+"><\/a>)?Cài đặt<\/h2>/);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<s>gone</s>');
    expect(html).toContain('href="https://raft.github.io"');
    expect(html).toMatch(/<ol><li>one<\/li><li>two<ul><li>nested<\/li><\/ul><\/li><li>three<\/li><\/ol>/);
    expect(html).toContain('☑ done');
    expect(html).toContain('<table>');
    expect(html).toContain('Careful here.');
    expect(html).toContain('Ongaro and Ousterhout, 2014.');
    expect(html).toContain('<img');
    expect(html).not.toContain('Ignored front matter');
  });

  it('XML: style Heading1, bookmark và link nội bộ, footnote thật, căn cột bảng, phông code', async () => {
    const buf = await docxBuffer(MD);
    const files = unzipSync(buf);
    const doc = strFromU8(files['word/document.xml']!);
    expect(doc).toContain('w:pStyle w:val="Heading1"');
    expect(doc).toContain('w:pStyle w:val="Heading2"');
    expect(doc).toMatch(/w:bookmarkStart[^>]*w:name="h2"/);
    expect(doc).toMatch(/w:hyperlink[^>]*w:anchor="h2"/);
    expect(doc).toContain('w:footnoteReference');
    expect(strFromU8(files['word/footnotes.xml']!)).toContain('Ongaro');
    expect(doc).toMatch(/w:jc w:val="(right|end)"/);
    expect(doc).toContain('Consolas');
    expect(doc).toContain('Cambria Math');
    // ảnh không có (không truyền image): ghi chữ thay thế
    expect(doc).toContain('[alt text]');
  });

  it('văn bản rỗng vẫn ra file hợp lệ', async () => {
    const buf = await docxBuffer('');
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(buf) });
    expect(value).toBe('');
  });
});
