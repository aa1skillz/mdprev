import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/studio/pipeline';

const html = async (s: string) => (await renderMarkdown(s)).html;

describe('tên miền trần thành link ở bản xem', () => {
  it('example.com và example.net trong câu', async () => {
    const a = await html('Visit example.com now');
    expect(a).toContain('<a href="https://example.com"');
    const b = await html('See example.net here');
    expect(b).toContain('<a href="https://example.net"');
  });
  it('giữ đường dẫn, cổng; bỏ dấu câu cuối câu', async () => {
    expect(await html('Open docs.example.org/a/b?x=1.')).toContain('href="https://docs.example.org/a/b?x=1"');
    expect(await html('Go to example.com, then stop')).toContain('href="https://example.com"');
    expect(await html('(see example.com)')).toContain('href="https://example.com"');
  });
  it('không link tên file, số phiên bản, từ viết tắt', async () => {
    const h = await html('Edit notes.md and v1.2 or e.g. foo.js, run install.sh or main.cc, also a.b');
    expect(h).not.toContain('<a ');
  });
  it('không link trong code, trong link sẵn có, ảnh, email', async () => {
    expect(await html('`example.com`')).not.toContain('<a ');
    expect(await html('```\nexample.com\n```')).not.toContain('<a ');
    expect(await html('[site](https://x.org) and [example.com](https://y.org)')).not.toMatch(/href="https:\/\/example\.com"/);
    expect(await html('mail me@example.com')).not.toContain('href="https://example.com"');
    expect(await html('![example.com](a.png)')).not.toContain('href="https://example.com"');
  });
  it('liên kết ngoài mở tab mới như link thường', async () => {
    expect(await html('example.com')).toContain('target="_blank"');
  });
});
