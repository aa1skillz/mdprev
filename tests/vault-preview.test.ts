import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/studio/pipeline';
import type { VaultCtx } from '../src/lib/vault/preview';

const ctx = (over: Partial<VaultCtx> = {}): VaultCtx => ({
  key: 'k' + Math.random(),
  self: 'Home.md',
  notes: [
    { path: 'Guide.md', text: '---\ntitle: G\n---\n# Guide\n\nIntro.\n\n## Install\n\nRun it.\n\n### Sub\n\nMore.\n\n## Use\n\nNot embedded.\n\nA tip ^tip\n' },
    { path: 'Deep/Other.md', text: '# Other\n\n![[Guide]]\n' },
  ],
  images: [{ path: 'att/cat.png', id: 'abc123.png' }, { path: 'att/Mèo con.webp', id: 'def456.webp' }],
  ...over,
});

describe('vault preview (worker plugin)', () => {
  it('renders links to notes with data-wl and heading ids; broken ones muted', async () => {
    const { html } = await renderMarkdown('# Home\n\nSee [[Guide]], [[Guide#Install|install]] and [[Ghost]] and [[Guide#Nope]].\n', ctx());
    expect(html).toContain('<a href="#" class="wl" data-wl="Guide.md">Guide</a>');
    expect(html).toContain('data-wl="Guide.md" data-wh="install">install</a>');
    expect(html).toMatch(/class="wl wl-broken" title="Missing note">Ghost/);
    expect(html).toMatch(/class="wl wl-broken" title="Missing heading">Guide › Nope/);
  });
  it('turns image embeds and relative Markdown images into asset: images', async () => {
    const { html } = await renderMarkdown('![[cat.png]]\n\n![[cat.png|300]]\n\n![[Mèo con.webp|120x80]]\n\n![x](att/cat.png)\n\n![[nope.png]]\n\n![w](https://example.com/a.png)\n', ctx());
    expect(html).toContain('<img src="asset:abc123.png" alt="cat">');
    expect(html).toContain('<img src="asset:abc123.png" alt="cat" width="300">');
    expect(html).toContain('<img src="asset:def456.webp" alt="Mèo con" width="120" height="80">');
    expect(html).toContain('<img src="asset:abc123.png" alt="x">');
    expect(html).toMatch(/wl-broken" title="Image not in the vault">nope\.png/);
    expect(html).toContain('src="https://example.com/a.png"');
  });
  it('embeds only the section or block, with no data-line or heading ids inside', async () => {
    const { html } = await renderMarkdown('# Home\n\n![[Guide#Install]]\n\n![[Guide#^tip]]\n', ctx());
    expect(html).toContain('Run it.');
    expect(html).toContain('More.');
    expect(html).not.toContain('Not embedded.');
    expect(html).toContain('A tip');
    expect(html).not.toContain('^tip');
    const aside = html.slice(html.indexOf('<aside'));
    expect(aside).not.toContain('data-line');
    expect(aside).not.toMatch(/<h\d id=/);
    expect(html).toContain('<h1 data-line="1" id="home">');
  });
  it('does not recurse: an embed inside an embed becomes a link', async () => {
    const { html } = await renderMarkdown('![[Other]]\n', ctx());
    expect((html.match(/<aside/g) ?? []).length).toBe(1);
    expect(html).toContain('data-wl="Guide.md"');
  });
  it('leaves wikilinks in code alone and still blocks script URLs', async () => {
    const { html } = await renderMarkdown('`[[Guide]]`\n\n```\n[[Guide]]\n```\n\n[x](javascript:alert(1))\n', ctx());
    expect(html).not.toContain('data-wl');
    expect(html).not.toContain('javascript:');
  });
  it('without a vault context, wikilinks stay text (normal documents unchanged)', async () => {
    const { html } = await renderMarkdown('[[Guide]] ![[cat.png]]\n');
    expect(html).toContain('[[Guide]] ![[cat.png]]');
  });
});
