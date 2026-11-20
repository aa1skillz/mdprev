import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildSite, buildSiteZip, checkVault, imageMap, type SiteImage, type SiteNote } from '../src/lib/vault/site';

const now = new Date('2026-01-02T03:04:05Z');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
const images: SiteImage[] = [
  { path: 'attachments/cat.png', bytes: PNG },
  { path: 'Projects/diagram.svg', bytes: SVG },
  { path: 'ảnh/Mèo Con.PNG', bytes: PNG },
  { path: 'x/dup.png', bytes: PNG },
  { path: 'y/dup.png', bytes: PNG },
];
const notes: SiteNote[] = [
  { path: 'Home.md', text: '# Home\n\n![[cat.png]]\n\n![[cat.png|300]]\n\n![[diagram.svg|120x80]]\n\n![[Mèo Con.PNG|A kitten]]\n\n![alt](attachments/cat.png)\n\n![web](https://example.com/x.png)\n\n![[missing.png]]\n\n![[Guide#Install]]\n\n![[Guide#Nope]]\n\n![[Guide#^tip]]\n' },
  { path: 'Projects/Deep/Note.md', text: '# Deep\n\n![[cat.png]]\n\n![rel](../../attachments/cat.png)\n\n![[dup.png]]\n' },
  { path: 'Guide.md', text: '# Guide\n\nIntro text.\n\n## Install\n\nRun it.\n\n### Sub\n\nMore.\n\n## Use\n\nUse text that should not be embedded.\n\nA tip here ^tip\n' },
];

describe('imageMap', () => {
  it('puts images under assets/img with safe, unique names', () => {
    const m = imageMap(images.map((i) => i.path));
    expect(m.get('attachments/cat.png')).toBe('assets/img/attachments/cat.png');
    expect(m.get('ảnh/Mèo Con.PNG')).toBe('assets/img/anh/meo-con.png');
    expect(new Set(m.values()).size).toBe(images.length);
    expect(m.get('Projects/diagram.svg')).toBe('assets/img/projects/diagram.svg');
  });
});

describe('site export with images and section embeds', () => {
  it('writes image files and relative <img> at every depth', async () => {
    const { files, binary } = await buildSite(notes, { title: 'S', now }, images);
    expect(Object.keys(binary).sort()).toEqual(['assets/img/anh/meo-con.png', 'assets/img/attachments/cat.png', 'assets/img/projects/diagram.svg', 'assets/img/x/dup.png', 'assets/img/y/dup.png']);
    const home = files['home.html'] ?? '';
    expect(home).toContain('<img src="assets/img/attachments/cat.png" alt="cat"');
    expect(home).toContain('<img src="assets/img/attachments/cat.png" alt="cat" width="300"');
    expect(home).toContain('<img src="assets/img/projects/diagram.svg" alt="diagram" width="120" height="80"');
    expect(home).toContain('<img src="assets/img/anh/meo-con.png" alt="A kitten"');
    expect(home).toContain('<img src="assets/img/attachments/cat.png" alt="alt"');
    expect(home).toContain('src="https://example.com/x.png"');
    expect(home).toContain('missing.png');
    const deep = files['projects/deep/note.html'] ?? '';
    expect(deep).toContain('<img src="../../assets/img/attachments/cat.png" alt="cat"');
    expect(deep).toContain('<img src="../../assets/img/attachments/cat.png" alt="rel"');
    expect(deep).toContain('<img src="../../assets/img/x/dup.png"'); // tên trùng: đường dẫn ngắn nhất, rồi theo abc
  });
  it('embeds only the section under a heading, or one block', async () => {
    const { files } = await buildSite(notes, { title: 'S', now }, images);
    const home = files['home.html'] ?? '';
    const start = home.indexOf('Run it.');
    expect(start).toBeGreaterThan(0);
    expect(home).toContain('More.');
    expect(home).not.toContain('should not be embedded');
    expect(home).toContain('A tip here');
    expect(home).not.toContain('^tip');
    expect(home).toMatch(/wl-broken[^>]*>Guide › Nope/);
  });
  it('reports missing images, headings and blocks as broken; found images are fine', () => {
    const r = checkVault(notes, images.map((i) => i.path));
    expect(r.broken.map((b) => [b.from, b.target, b.kind])).toEqual([
      ['Home.md', 'missing.png', 'file'],
      ['Home.md', 'Guide#Nope', 'heading'],
    ]);
  });
  it('zips images uncompressed next to the pages', async () => {
    const r = await buildSiteZip(notes, { title: 'S', now }, images);
    const z = unzipSync(r.zip);
    expect(z['assets/img/attachments/cat.png']).toEqual(PNG);
    expect(new TextDecoder().decode(z['assets/img/projects/diagram.svg'])).toContain('<svg');
  });
  it('drops an unsafe SVG instead of shipping it', async () => {
    const bad: SiteImage = { path: 'evil.svg', bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') };
    const { binary, files } = await buildSite([{ path: 'a.md', text: '![[evil.svg]]' }], { title: 'S', now }, [bad]);
    expect(Object.keys(binary)).toEqual([]);
    expect(files['a.html']).not.toContain('<img');
  });
  it('hostile image names cannot escape assets/img or inject markup', async () => {
    const odd: SiteImage[] = [{ path: 'a/"><script>x.png', bytes: PNG }, { path: '..png', bytes: PNG }];
    const { files, binary } = await buildSite([{ path: 'n.md', text: '![[a/"><script>x.png]]' }], { title: 'S', now }, odd);
    for (const k of Object.keys(binary)) expect(k.startsWith('assets/img/') && !k.includes('..') && !/[<>"]/.test(k)).toBe(true);
    expect(files['n.html']).not.toContain('<script>x');
  });
});

describe('generated fixture with images (performance)', () => {
  const load = async (scale: number) => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, readdirSync, readFileSync, statSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join, relative } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'mdprev-vimg-'));
    execFileSync('node', ['tools/make-vault-fixture.mjs', dir, '--scale', String(scale), '--images']);
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const all = walk(dir).map((f) => ({ path: relative(dir, f).split('\\').join('/'), f }));
    return {
      notes: all.filter((x) => x.path.endsWith('.md')).map((x) => ({ path: x.path, text: readFileSync(x.f, 'utf8') })),
      images: all.filter((x) => !x.path.endsWith('.md')).map((x) => ({ path: x.path, bytes: new Uint8Array(readFileSync(x.f)) })),
    };
  };
  it('50 notes + 9 images: still exactly 3 broken links, every image exported and referenced', async () => {
    const { notes, images } = await load(1);
    expect(images.length).toBe(9);
    expect(checkVault(notes, images.map((i) => i.path)).broken).toHaveLength(3);
    const { files, binary } = await buildSite(notes, { title: 'F', now }, images);
    expect(Object.keys(binary)).toHaveLength(9);
    const html = Object.values(files).join('\n');
    for (const out of Object.keys(binary)) expect(html).toContain(out.slice('assets/img/'.length));
    expect(files['home.html']).toContain('assets/img/attachments/so-do.svg');
  });
  it('~500 notes + 81 images: checks and builds the zip quickly', async () => {
    const { notes, images } = await load(10);
    expect(notes.length).toBeGreaterThan(450);
    const t0 = performance.now();
    expect(checkVault(notes, images.map((i) => i.path)).broken).toHaveLength(3); // các bộ lặp chỉ thêm note, liên kết hỏng chỉ nằm ở bộ đầu
    const t1 = performance.now();
    const r = await buildSiteZip(notes, { title: 'F', now }, images);
    const t2 = performance.now();
    console.log(`500-note vault: check ${(t1 - t0).toFixed(0)} ms, build zip ${(t2 - t1).toFixed(0)} ms, ${r.pages} pages, ${r.images} images, ${(r.zip.length / 1024).toFixed(0)} KB`);
    expect(r.images).toBe(81);
    expect(t1 - t0).toBeLessThan(2000);
    expect(t2 - t1).toBeLessThan(15000);
  }, 60_000);
});
