import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildTextPack, parseTextPack } from '../src/lib/studio/textbundle';
import { buildEpub, navXhtml } from '../src/lib/studio/epub';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

describe('TextPack', () => {
  it('zips a .textbundle folder with info.json, text.md and assets, rewriting asset: links', () => {
    const z = buildTextPack('# T\n\n![cat](asset:ab12cd.png)\n', 'My notes', [{ id: 'ab12cd.png', data: png }]);
    const files = unzipSync(z);
    expect(Object.keys(files).sort()).toEqual(['My notes.textbundle/assets/ab12cd.png', 'My notes.textbundle/info.json', 'My notes.textbundle/text.md']);
    expect(strFromU8(files['My notes.textbundle/text.md']!)).toBe('# T\n\n![cat](assets/ab12cd.png)\n');
    expect(JSON.parse(strFromU8(files['My notes.textbundle/info.json']!))).toMatchObject({ version: 2, type: 'net.daringfireball.markdown' });
  });
  it('round trips through parseTextPack', () => {
    const z = buildTextPack('# T\n\n![cat](asset:ab12cd.png)\n', 'n', [{ id: 'ab12cd.png', data: png }]);
    const r = parseTextPack(z)!;
    expect(r.md).toBe('# T\n\n![cat](assets/ab12cd.png)\n');
    expect(r.assets).toEqual([{ path: 'assets/ab12cd.png', type: 'image/png', data: png }]);
  });
  it('reads packs made by other apps (files at the zip root, text.markdown)', () => {
    const z = zipSync({ 'info.json': strToU8('{"version":2}'), 'text.markdown': strToU8('hello'), 'assets/a.jpg': png });
    expect(parseTextPack(z)).toEqual({ md: 'hello', assets: [{ path: 'assets/a.jpg', type: 'image/jpeg', data: png }] });
  });
  it('rejects zips without a text file, and garbage', () => {
    expect(parseTextPack(zipSync({ 'a.txt': strToU8('x') }))).toBeNull();
    expect(parseTextPack(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('EPUB', () => {
  const book = () => buildEpub({
    title: 'Tiêu đề & <test>', lang: 'vi', id: 'urn:uuid:1234', modified: '2026-11-17T00:00:00Z', css: 'body{}',
    body: '<h1 id="a">A</h1><p>x</p><h2 id="b">B</h2><svg xmlns="http://www.w3.org/2000/svg"></svg><img src="images/i1.png" alt=""/>',
    images: [{ path: 'images/i1.png', type: 'image/png', data: png }],
    toc: [{ id: 'a', text: 'A', level: 1 }, { id: 'b', text: 'B & C', level: 2 }],
  });
  it('stores mimetype first and uncompressed', () => {
    const z = book();
    expect(strFromU8(z.slice(30, 38))).toBe('mimetype');
    expect(z[8]).toBe(0); // phương thức nén 0 = stored
    expect(strFromU8(z.slice(38, 58))).toBe('application/epub+zip');
  });
  it('has container, opf with nav, modified date, svg property and image items', () => {
    const f = unzipSync(book());
    expect(strFromU8(f['META-INF/container.xml']!)).toContain('full-path="OEBPS/content.opf"');
    const opf = strFromU8(f['OEBPS/content.opf']!);
    expect(opf).toContain('<meta property="dcterms:modified">2026-11-17T00:00:00Z</meta>');
    expect(opf).toContain('<dc:title>Tiêu đề &amp; &lt;test&gt;</dc:title>');
    expect(opf).toContain('<dc:language>vi</dc:language>');
    expect(opf).toContain('href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"');
    expect(opf).toContain('href="text.xhtml" media-type="application/xhtml+xml" properties="svg"');
    expect(opf).toContain('href="images/i1.png" media-type="image/png"');
    expect(f['OEBPS/images/i1.png']).toEqual(png);
    expect(strFromU8(f['OEBPS/text.xhtml']!)).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?>/);
  });
  it('builds a nested nav from heading levels', () => {
    expect(navXhtml('T', 'en', [{ id: 'a', text: 'A', level: 1 }, { id: 'b', text: 'B', level: 2 }, { id: 'c', text: 'C', level: 1 }]))
      .toContain('<ol><li><a href="text.xhtml#a">A</a><ol><li><a href="text.xhtml#b">B</a></li></ol></li><li><a href="text.xhtml#c">C</a></li></ol>');
    expect(navXhtml('T', 'en', [{ id: 'b', text: 'B', level: 2 }, { id: 'c', text: 'C', level: 3 }])).toContain('<ol><li><a href="text.xhtml#b">B</a><ol><li><a href="text.xhtml#c">C</a></li></ol></li></ol>');
    expect(navXhtml('T', 'en', [])).toContain('<ol><li><a href="text.xhtml">T</a></li></ol>');
  });
});
