import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildSite, buildSiteZip, checkVault, htmlPathOf, pageMap, type SiteNote } from '../src/lib/vault/site';

const now = new Date('2026-01-02T03:04:05Z');
const vault: SiteNote[] = [
  { path: 'Home.md', text: '# Home\n\nGo to [[Projects/Alpha#Second Step|the steps]] and [[beta]].\n\n![[Beta]]\n\nMissing: [[Ghost]]\n\n<script>alert(1)</script>\n\n[x](Projects/Alpha.md) and [bad](javascript:alert(1))\n' },
  { path: 'Projects/Alpha.md', text: '---\ntitle: Alpha Project\n---\n# Intro\n\nBack to [[Home]] and [[Home#Home]] and [[Beta]]. [rel](../Beta.md#x)\n\n## Second Step\n\n## Second Step\n\n```\n[[not a link]]\n```\n' },
  { path: 'Beta.md', text: 'No heading here. Embeds ![[Home]] and links [[Projects/Alpha]]. Text with `</script>` inside.\n' },
  { path: 'Áreas/Đà Lạt.md', text: '# Đà Lạt\n\nLink [[Alpha]] and $x^2$.\n' },
];

describe('htmlPathOf / pageMap', () => {
  it('slugs each segment and strips diacritics', () => {
    expect(htmlPathOf('Projects/My Note.md')).toBe('projects/my-note.html');
    expect(htmlPathOf('Áreas/Đà Lạt.md')).toBe('areas/da-lat.html');
    expect(htmlPathOf('---.md')).toBe('untitled.html');
  });
  it('resolves collisions deterministically', () => {
    const a = pageMap(['b/My Note.md', 'b/my-note.md', 'b/My_Note.md']);
    const b = pageMap(['b/My_Note.md', 'b/my-note.md', 'b/My Note.md']);
    expect([...a].sort()).toEqual([...b].sort());
    expect(new Set(a.values()).size).toBe(3);
    expect([...a.values()].sort()).toEqual(['b/my-note-2.html', 'b/my-note-3.html', 'b/my-note.html']);
  });
  it('keeps index.html for the home page', () => {
    expect(pageMap(['index.md']).get('index.md')).toBe('index-2.html');
  });
});

describe('checkVault', () => {
  it('reports exactly the broken links', () => {
    const r = checkVault([
      { path: 'a.md', text: '# A\n[[b]] [[b#Nope]] [[b#Yes]] [[gone]] ![[pic.png]] [[#Self]]\n```\n[[code]]\n```\n' },
      { path: 'b.md', text: '## Yes\n' },
    ]);
    expect(r.broken.map((x) => [x.from, x.line, x.target, x.kind])).toEqual([
      ['a.md', 2, 'b#Nope', 'heading'],
      ['a.md', 2, 'gone', 'note'],
      ['a.md', 2, 'pic.png', 'file'],
      ['a.md', 2, '#Self', 'heading'],
    ]);
    expect(r.notes).toBe(2);
    expect(r.links).toBe(6);
  });
});

describe('buildSite', () => {
  const run = async (baseUrl?: string) => buildSite(vault, { title: 'My <Site>', baseUrl, now });
  it('creates a page per note plus assets', async () => {
    const { files } = await run();
    expect(Object.keys(files).sort()).toEqual(['areas/da-lat.html', 'assets/previews.js', 'assets/site.css', 'assets/site.js', 'beta.html', 'home.html', 'index.html', 'projects/alpha.html']);
    expect(files['index.html']).toContain('My &lt;Site&gt;');
    expect(files['index.html']).toContain('href="projects/alpha.html"');
  });
  it('uses correct relative URLs from nested folders', async () => {
    const { files } = await run();
    const a = files['projects/alpha.html'] ?? '';
    expect(a).toContain('href="../home.html"');
    expect(a).toContain('href="../beta.html#x"'); // link .md thường
    expect(a).toContain('<link rel="stylesheet" href="../assets/site.css">');
    expect(a).toContain('<a href="../index.html">');
    expect(a).toContain('<script src="../assets/previews.js"></script><script src="../assets/site.js"></script>');
    expect(files['home.html']).toContain('<link rel="stylesheet" href="assets/site.css">');
    expect(files['home.html']).toContain('href="projects/alpha.html"');
  });
  it('wikilink anchors match heading ids, duplicate headings get -1', async () => {
    const { files } = await run();
    const a = files['projects/alpha.html'] ?? '';
    expect(a).toContain('<h2 id="second-step">');
    expect(a).toContain('<h2 id="second-step-1">');
    expect(files['home.html']).toContain('href="projects/alpha.html#second-step"');
    expect(files['home.html']).toContain('data-note="projects/alpha.html"');
    expect(files['home.html']).toContain('>the steps</a>');
    expect(a).toContain('href="../home.html#home"');
  });
  it('titles: front matter, first h1, file name', async () => {
    const { files } = await run();
    expect(files['projects/alpha.html']).toContain('<title>Alpha Project · My &lt;Site&gt;</title>');
    expect(files['home.html']).toContain('<title>Home · ');
    expect(files['beta.html']).toContain('<title>Beta · ');
    expect(files['beta.html']).toContain('<h1 class="doc-title">Beta</h1>');
  });
  it('lists backlinks sorted by title', async () => {
    const { files } = await run();
    const a = files['projects/alpha.html'] ?? '';
    const i = a.indexOf('Linked from');
    expect(i).toBeGreaterThan(0);
    const bl = a.slice(i);
    expect(bl.indexOf('>Beta<')).toBeLessThan(bl.indexOf('>Home<'));
    expect(bl).toContain('>Đà Lạt<');
    expect(files['areas/da-lat.html']).not.toContain('Linked from');
  });
  it('renders unresolved links as a muted span', async () => {
    const { files } = await run();
    expect(files['home.html']).toContain('<span class="wl wl-broken" title="Missing note">Ghost</span>');
  });
  it('embeds once and never recurses', async () => {
    const { files } = await run();
    const h = files['home.html'] ?? '';
    expect(h.match(/<aside class="embed">/g)?.length).toBe(1);
    expect(h).toContain('<div class="embed-h"><a href="beta.html" class="wl" data-note="beta.html">Beta</a></div>');
    // Beta nhúng Home: trong Home không có aside lồng, và embed trong Beta cũng chỉ một
    const b = files['beta.html'] ?? '';
    expect(b.match(/<aside class="embed">/g)?.length).toBe(1);
    expect(h.indexOf('<aside class="embed">', h.indexOf('<aside class="embed">') + 1)).toBe(-1);
  });
  it('does not emit raw HTML, unsafe hrefs or wikilinks from code', async () => {
    const { files } = await run();
    const h = files['home.html'] ?? '';
    expect(h).not.toContain('<script>alert');
    expect(h).not.toContain('javascript:');
    expect(files['projects/alpha.html']).toContain('[[not a link]]');
    expect(files['projects/alpha.html']).not.toContain('wl-broken');
    expect(files['areas/da-lat.html']).toContain('$x^2$');
  });
  it('previews.js is safe inside script tags and keyed by page path', async () => {
    const { files } = await run();
    const js = files['assets/previews.js'] ?? '';
    expect(js).not.toContain('</script>');
    expect(js).not.toContain('<');
    const data = JSON.parse(js.replace(/^window\.MDPREV_PREVIEWS = /, '').replace(/;\s*$/, '')) as Record<string, { t: string; x: string }>;
    expect(data['beta.html']?.t).toBe('Beta');
    expect(data['beta.html']?.x).toContain('</script>');
  });
  it('site.js builds the card with textContent only', async () => {
    const { files } = await run();
    expect(files['assets/site.js']).not.toContain('innerHTML');
    expect(files['assets/site.js']).toContain('textContent');
  });
  it('emits sitemap and robots only with baseUrl; OG tags present', async () => {
    const plain = await run();
    expect(plain.files['sitemap.xml']).toBeUndefined();
    expect(plain.files['robots.txt']).toBeUndefined();
    expect(plain.files['home.html']).not.toContain('canonical');
    expect(plain.files['home.html']).toContain('<meta property="og:title" content="Home">');
    expect(plain.files['home.html']).toContain('<meta property="og:type" content="article">');
    expect(plain.files['home.html']).toContain('<meta property="og:description"');
    const withUrl = await run('https://example.com/vault/');
    const sm = withUrl.files['sitemap.xml'] ?? '';
    expect(sm).toContain('<loc>https://example.com/vault/projects/alpha.html</loc><lastmod>2026-01-02</lastmod>');
    expect(sm).toContain('<loc>https://example.com/vault/</loc>');
    expect(withUrl.files['robots.txt']).toContain('Sitemap: https://example.com/vault/sitemap.xml');
    expect(withUrl.files['home.html']).toContain('<link rel="canonical" href="https://example.com/vault/home.html">');
    expect(withUrl.files['home.html']).toContain('og:url');
  });
  it('reports broken links', async () => {
    const { broken } = await run();
    expect(broken.map((b) => b.target)).toEqual(['Ghost']);
  });
});

describe('generated fixture', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  it('builds a 50+ note vault with exactly 3 broken links in under 3 s', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mdprev-vault-'));
    execFileSync('node', ['tools/make-vault-fixture.mjs', dir]);
    const notes = walk(dir).filter((f) => f.endsWith('.md')).map((f) => ({ path: relative(dir, f).split('\\').join('/'), text: readFileSync(f, 'utf8') }));
    expect(notes.length).toBeGreaterThanOrEqual(50);
    expect(checkVault(notes).broken).toHaveLength(3);
    const t0 = performance.now();
    const r = await buildSiteZip(notes, { title: 'Fixture', now });
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(r.broken).toHaveLength(3);
    expect(r.pages).toBeGreaterThanOrEqual(50);
    const names = Object.keys(unzipSync(r.zip));
    expect(names).toContain('index.html');
    expect(names).toContain('assets/site.css');
    expect(names.every((n) => !n.startsWith('/'))).toBe(true);
  });
});

describe('review follow-ups', () => {
  it('checkVault reports plain [x](missing.md) links, not code or web links', () => {
    const r = checkVault([
      { path: 'A.md', text: '# A\n\n[ok](sub/B.md) [gone](Nope.md#x) [web](https://x.y/a.md)\n\n```\n[code](Missing.md)\n```\n`[inline](Missing2.md)`\n' },
      { path: 'sub/B.md', text: '# B\n\n[up](../A.md) [bad](../../Out.md)\n' },
    ]);
    expect(r.broken).toEqual([
      { from: 'A.md', line: 3, target: 'Nope.md#x', kind: 'note' },
      { from: 'sub/B.md', line: 3, target: '../../Out.md', kind: 'note' },
    ]);
  });
  it('hostile paths, titles and links cannot inject markup or script URLs', async () => {
    const notes: SiteNote[] = [
      { path: 'Evil"<img src=x onerror=1>/A<b>.md', text: '---\ntitle: "</title><script>x()</script>"\n---\n\n[a](javascript:alert(1)) [b](JaVaScRiPt:x) [c](%20javascript:x) [d](data:text/html,x) [e]( java\tscript:x)\n\n[[Other]]\n' },
      { path: 'Other.md', text: '# Other <script>\n\n</script> [[A<b>]]\n' },
    ];
    const { files } = await buildSite(notes, { title: 'S"<i>', baseUrl: 'https://e.x/', now: new Date('2026-01-01') });
    for (const [name, html] of Object.entries(files)) {
      if (name.endsWith('.js') || name.endsWith('.css')) continue;
      expect(html, name).not.toMatch(/<script(?! src="(\.\.\/)*assets\/(previews|site)\.js"><\/script>)/i);
      expect(html, name).not.toMatch(/<img|<b>|<i>|<[^>]*onerror=/i);
      expect(html, name).not.toMatch(/(href|src)="\s*(javascript|data):/i);
    }
    expect(files['assets/previews.js']).not.toContain('</');
  });
});
