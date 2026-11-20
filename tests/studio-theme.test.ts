import { describe, expect, it } from 'vitest';
import { GALLERY, sanitizeTheme, themeExportCss, themeStyle } from '../src/lib/studio/theme';

describe('theme sanitizer (link themes are untrusted)', () => {
  it('keeps allowed tokens with valid colors, fonts and sizes', () => {
    expect(sanitizeTheme({ accent: '#1a4fa0', ink: 'rgb(10, 20, 30)', body: 'hsl(20 10% 30%)', paper: 'oklch(0.97 0.01 90)', font: 'serif', size: '18px', measure: '720px' }))
      .toEqual({ accent: '#1a4fa0', ink: 'rgb(10, 20, 30)', body: 'hsl(20 10% 30%)', paper: 'oklch(0.97 0.01 90)', font: 'serif', size: '18px', measure: '720px' });
  });
  it('drops unknown keys and anything that could load or inject CSS', () => {
    const bad = {
      accent: 'url(https://evil.example/x)', ink: 'red;background:url(x)', body: '#fff}body{color:red', sub: '@import "x"', dim: 'expression(alert(1))',
      line: '\\23 fff', line2: 'var(--x)', hover: 'rgb(1,2,3) url(x)', font: "'Comic Sans'", size: '999px', measure: '10px', evil: '#000', 'code-bg': 'image-set(x)',
    };
    expect(sanitizeTheme(bad)).toEqual({});
  });
  it('rejects non-objects and non-string values', () => {
    expect(sanitizeTheme(null)).toEqual({});
    expect(sanitizeTheme('x')).toEqual({});
    expect(sanitizeTheme([1])).toEqual({});
    expect(sanitizeTheme({ accent: 5, ink: { a: 1 } })).toEqual({});
  });
  it('accepts named color keywords from a short list only', () => {
    expect(sanitizeTheme({ accent: 'black', ink: 'white', body: 'redd' })).toEqual({ accent: 'black', ink: 'white' });
  });
});

describe('theme output', () => {
  it('turns tokens into CSS custom properties and inline font styles', () => {
    const s = themeStyle({ accent: '#123456', paper: '#fafafa', font: 'mono', size: '15px' });
    expect(s.vars.slice(0, 3)).toEqual([['--paper', '#fafafa'], ['--bg', '#fafafa'], ['--accent', '#123456']]);
    expect(s.vars.slice(3).map(([k]) => k)).toEqual(['--err', '--warn', '--ok']); // màu severity tính theo mặt đọc (668e896)
    expect(s.doc).toEqual({ fontFamily: "'JetBrains Mono', monospace", fontSize: '15px' });
  });
  it('export CSS overrides :root and wins over document styles', () => {
    const css = themeExportCss({ accent: '#123456', font: 'serif', measure: '700px' });
    expect(css).toContain(':root{--accent:#123456;--link:var(--accent)');
    expect(css).toContain('.md-doc,.md-doc[data-doc]{font-family:');
    expect(css).toContain('max-width:700px');
    expect(themeExportCss({})).toBe('');
  });
  it('gallery themes survive the sanitizer unchanged', () => {
    expect(GALLERY.length).toBeGreaterThanOrEqual(4);
    for (const g of GALLERY) expect(sanitizeTheme(g.theme)).toEqual(g.theme);
  });
});

describe('isColor, review vectors', () => {
  it('rejects CSS escapes, comments, nested functions, unicode and long input', async () => {
    const { isColor } = await import('../src/lib/studio/theme');
    for (const v of ['\\75 rl(x)', 'rgb(1/**/2 3)', 'rgb(1 2 calc(3))', 'rgb(1 2 3) ', 'rgb(１ 2 3)', 'rgb(' + '1 '.repeat(40) + ')', 'hsl(1 2% 3% / x)', '#ggg', 'rgb(1 2 3)</style>']) expect(isColor(v.trim() === v ? v : v), v).toBe(false);
    for (const v of ['#abc', '#aabbccdd', 'rgb(1, 2, 3)', 'oklch(0.5 0.1 255 / 0.5)', 'hsl(120deg 50% 50%)']) expect(isColor(v), v).toBe(true);
  });
  it('export CSS cannot close the style element', () => {
    expect(themeExportCss({ accent: '</style><script>x</script>', ink: '#000' })).not.toContain('<');
  });
});
