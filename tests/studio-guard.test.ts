import { describe, expect, it } from 'vitest';
import { blockExternalImages } from '../src/lib/studio/guard';

describe('blockExternalImages', () => {
  it('chặn ảnh http(s) và // , giữ địa chỉ, hiện alt', () => {
    const r = blockExternalImages('<p><img src="https://evil.example/p.png" alt="logo"> and <img src="//cdn.example/x.gif"></p>');
    expect(r.blocked).toBe(2);
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('data-ext-src="https://evil.example/p.png"');
    expect(r.html).toContain('Image blocked: logo');
    expect(r.html).toContain('Image blocked from cdn.example');
  });
  it('không đụng ảnh trong máy hay tương đối', () => {
    const html = '<img src="blob:http://localhost/1" alt="a"><img src="data:image/png;base64,AA" alt="b"><img src="img/x.png" alt="c"><img src="asset:abc" alt="d">';
    expect(blockExternalImages(html)).toEqual({ html, blocked: 0 });
  });
  it('srcset trỏ ra ngoài cũng bị chặn', () => {
    expect(blockExternalImages('<img src="a.png" srcset="https://x.example/a@2x.png 2x" alt="">').blocked).toBe(1);
  });
  it('src giả nằm trong giá trị alt không lừa được bộ lọc', () => {
    const r = blockExternalImages(`<img alt=' src="ok.png"' src="https://evil.example/t.gif">`);
    expect(r.blocked).toBe(1);
    expect(r.html).toContain('data-ext-src="https://evil.example/t.gif"');
  });
  it('alt có ký tự HTML không phá markup', () => {
    const r = blockExternalImages('<img src="https://x.example/a.png" alt="a &amp; b <script>">');
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('a &amp; b &lt;script&gt;');
  });
});
