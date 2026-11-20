import { describe, expect, it } from 'vitest';
import { blockOf, embedSize, imageTypeOf, isImagePath, safeImageBytes, sectionOf, svgProblem } from '../src/lib/vault/embed';

const enc = (s: string) => new TextEncoder().encode(s);

describe('sectionOf', () => {
  const note = [
    '# Title', 'intro', '', '## Setup', 'step one', '', '### Detail', 'deep', '', '```', '## not a heading', '```', '', '## Usage', 'use it', '# Other', 'x',
  ].join('\n');
  it('takes the heading and everything until a heading of the same or higher level', () => {
    expect(sectionOf(note, 'Setup')).toBe(['## Setup', 'step one', '', '### Detail', 'deep', '', '```', '## not a heading', '```', ''].join('\n'));
  });
  it('a deeper heading ends at the next heading of its level or higher', () => {
    expect(sectionOf(note, 'Detail')).toBe(['### Detail', 'deep', '', '```', '## not a heading', '```', ''].join('\n'));
  });
  it('matches case-insensitively, by plain text or by id, and runs to the end', () => {
    expect(sectionOf(note, 'usage')).toBe('## Usage\nuse it');
    expect(sectionOf(note, 'Other')).toBe('# Other\nx');
    expect(sectionOf('## Hello *World*\nbody', 'Hello World')).toBe('## Hello *World*\nbody');
    expect(sectionOf('## Hello World\nbody', 'hello-world')).toBe('## Hello World\nbody');
  });
  it('ignores headings inside fences and returns null when missing', () => {
    expect(sectionOf(note, 'not a heading')).toBeNull();
    expect(sectionOf(note, 'Nope')).toBeNull();
  });
});

describe('blockOf', () => {
  const note = 'para one\ncontinues here ^p1\n\n- item a\n- item b ^li\n- item c\n\n```\nfake ^code\n```\n';
  it('returns the paragraph that ends with ^id, without the marker', () => {
    expect(blockOf(note, 'p1')).toBe('para one\ncontinues here');
  });
  it('returns only the list item for a list block', () => {
    expect(blockOf(note, 'li')).toBe('- item b');
  });
  it('ignores fenced code and unknown ids', () => {
    expect(blockOf(note, 'code')).toBeNull();
    expect(blockOf(note, 'zzz')).toBeNull();
  });
});

describe('images', () => {
  it('knows image paths and types', () => {
    expect(isImagePath('a/b.PNG')).toBe(true);
    expect(isImagePath('x.jpeg')).toBe(true);
    expect(isImagePath('x.avif')).toBe(true);
    expect(isImagePath('x.pdf')).toBe(false);
    expect(isImagePath('x.md')).toBe(false);
    expect(imageTypeOf('a.svg')).toBe('image/svg+xml');
    expect(imageTypeOf('a.jpg')).toBe('image/jpeg');
  });
  it('reads |300 and |300x200 as a size, anything else as alt text', () => {
    expect(embedSize('300')).toEqual({ width: 300 });
    expect(embedSize('300x200')).toEqual({ width: 300, height: 200 });
    expect(embedSize('a cat')).toEqual({ alt: 'a cat' });
    expect(embedSize(undefined)).toEqual({});
    expect(embedSize('99999')).toEqual({ alt: '99999' });
  });
  it('checks magic bytes for raster images', () => {
    expect(safeImageBytes('a.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(safeImageBytes('a.png', enc('<html><script>alert(1)</script>'))).toBe(false);
    expect(safeImageBytes('a.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(safeImageBytes('a.gif', new Uint8Array([...enc('GIF89a'), 1, 0, 1, 0]))).toBe(true);
    expect(safeImageBytes('a.gif', new Uint8Array([...enc('GIF89a'), 0xff, 0xff, 0xff, 0xff]))).toBe(false);
    expect(safeImageBytes('a.webp', enc('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
    expect(safeImageBytes('a.avif', enc('\0\0\0\x1cftypavif'))).toBe(true);
    expect(safeImageBytes('a.svg', enc('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).toBe(true);
  });
});

describe('svgProblem (SVG kept only when it cannot run code or load anything)', () => {
  const ok = (s: string) => expect(svgProblem(enc(s))).toBeNull();
  const bad = (s: string) => expect(svgProblem(enc(s))).not.toBeNull();
  it('accepts plain drawings, gradients and internal references', () => {
    ok('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/><use href="#g"/></svg>');
    ok('<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><circle class="a" r="4"/><animate attributeName="r" to="5"/></svg>');
  });
  it('rejects scripts, event handlers and foreign content', () => {
    bad('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><rect\nONCLICK = "alert(1)"/></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="x"/></foreignObject></svg>');
  });
  it('rejects external and javascript links, entity tricks and stylesheets', () => {
    bad('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="&#106;avascript:alert(1)"><rect/></a></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://tracker.example/p.png"/></svg>');
    bad('<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>');
    bad('<?xml-stylesheet href="evil.xsl" type="text/xsl"?><svg xmlns="http://www.w3.org/2000/svg"/>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="javascript:alert(1)"/></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://x.example/a.css);</style></svg>');
  });
  it('rejects non-UTF-8 encodings and files that are not SVG', () => {
    expect(svgProblem(new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x73, 0x00]))).not.toBeNull();
    bad('<html><body>hi</body></html>');
  });
});

describe('security review follow-ups', () => {
  const bad = (s: string) => expect(svgProblem(enc(s))).not.toBeNull();
  it('non-ASCII namespace prefixes cannot hide script or foreign content', () => {
    bad('<svg xmlns="http://www.w3.org/2000/svg"><é:script xmlns:é="http://www.w3.org/2000/svg">alert(1)</é:script></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><é:foreignObject xmlns:é="http://www.w3.org/2000/svg"/></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><rect é:onclick="alert(1)"/></svg>');
  });
  it('CSS escapes, image-set and font loading are rejected', () => {
    bad('<svg xmlns="http://www.w3.org/2000/svg"><style>svg{background:\\75rl(https://evil/p)}</style></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><rect style="background:image-set(\'https://evil/p\' 1x)"/></svg>');
    bad('<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:x;src:local(x)}</style></svg>');
  });
  it('an href animation is caught even after a > inside an attribute value', () => {
    bad('<svg xmlns="http://www.w3.org/2000/svg"><set x=">" attributeName="href" to="https://evil"/></svg>');
  });
  it('non-ASCII text content is still fine', () => {
    expect(svgProblem(enc('<svg xmlns="http://www.w3.org/2000/svg"><text>Sơ đồ</text></svg>'))).toBeNull();
  });
  it('pathological inputs finish quickly (no regex blow-up)', () => {
    const t0 = performance.now();
    svgProblem(enc('<svg>' + '<set'.repeat(200_000)));
    svgProblem(enc('<svg><!DOCTYPE' + ' x'.repeat(200_000)));
    sectionOf('# ' + '\t'.repeat(20_000) + 'x', 'y');
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it('rejects raster images that declare absurd dimensions', () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    png.set([0, 1, 0, 0, 0, 1, 0, 0], 16); // 65536 x 65536
    expect(safeImageBytes('x.png', png)).toBe(false);
    png.set([0, 0, 1, 0, 0, 0, 1, 0], 16); // 256 x 256
    expect(safeImageBytes('x.png', png)).toBe(true);
    const g = new Uint8Array([...enc('GIF89a'), 0xff, 0xff, 0xff, 0xff]);
    expect(safeImageBytes('x.gif', g)).toBe(false);
    const j = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0xff, 0xff, 0xff, 0xff, 3, 0, 0, 0, 0]);
    expect(safeImageBytes('x.jpg', j)).toBe(false);
  });
  it('ATX headings with closing hashes still match', () => {
    expect(sectionOf('## Setup ##\nbody\n## Next', 'Setup')).toBe('## Setup ##\nbody');
    expect(sectionOf('## C# #\nbody', 'C#')).toBe('## C# #\nbody');
  });
});
