import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VARS } from '../src/lib/studio/export';

// Canh các luật của hệ thống thiết kế Quiet Pro.
// Chỉ đọc file bằng node:fs: không DOM, không build.

const SRC = join(__dirname, '..', 'src');
const styles = (name: string) => readFileSync(join(SRC, 'styles', name), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?|astro)$/.test(n)) out.push(p);
  }
  return out;
}
const ALL = walk(SRC);

/** Thân khối `{…}` đầu tiên bắt đầu bằng `selector`. */
function block(css: string, selector: string, from = 0): string {
  const i = css.indexOf(selector, from);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j);
  }
  return '';
}

const ROLE_TOKENS = [
  'bg', 'side', 'surface', 'ink', 'body', 'sub', 'dim', 'line', 'line2', 'hover',
  'accent', 'accent-bg', 'on-accent', 'link', 'link-h',
  'err', 'err-bg', 'warn', 'warn-bg', 'ok', 'ok-bg', 'scrim',
  'code-bg', 'code-fg', 'code-line', 'code-label', 'code-btn', 'code-hover', 'shadow-hard',
];
const REMOVED = ['post-orange', 'post-green', 'post-blue', 'accent-ink', 'strong', 'mute', 'rail', 'rail2', 'zcard', 'hl-blue', 'hl-green'];
const has = (css: string, name: string) => new RegExp(`--${name}\\s*:`).test(css);

describe('tokens', () => {
  const tokens = styles('tokens.css');
  const light = block(tokens, ':root {');
  const dark = block(tokens, ':root[data-theme=dark]');

  it('có đủ token vai trò ở cả hai theme', () => {
    for (const t of ROLE_TOKENS) {
      expect(has(light, t), `thiếu --${t} ở theme sáng`).toBe(true);
      expect(has(dark, t), `thiếu --${t} ở theme tối`).toBe(true);
    }
  });

  it('accent xanh mực (hue 255)', () => {
    expect(tokens).toContain('--accent:oklch(0.47 0.13 255)');
    expect(tokens).toContain('--accent:oklch(0.76 0.11 255)');
  });

  it('color-scheme theo theme để điều khiển gốc đúng màu', () => {
    expect(light).toMatch(/color-scheme\s*:\s*light/);
    expect(dark).toMatch(/color-scheme\s*:\s*dark/);
  });

  it('không còn token đã xoá ở bất kỳ file nào trong src/', () => {
    const hits: string[] = [];
    for (const f of ALL) {
      const text = readFileSync(f, 'utf8');
      for (const t of REMOVED) if (new RegExp(`--${t}(?![a-z0-9-])`).test(text)) hits.push(`${f.slice(SRC.length + 1)}: --${t}`);
    }
    expect(hits).toEqual([]);
  });

  it('không còn cam làm màu nhấn (hex cũ, hue 30–59)', () => {
    const hits: string[] = [];
    for (const f of ALL) {
      const text = readFileSync(f, 'utf8');
      if (/c8552d|a33a14|c2562a/i.test(text)) hits.push(f.slice(SRC.length + 1));
      if (f.endsWith('.css') && /oklch\(\s*[0-9.]+\s+[0-9.]+\s+(3\d|4\d|5\d)(\.\d+)?[\s)/]/.test(text) && !f.endsWith('print.css')) hits.push(f.slice(SRC.length + 1) + ' (oklch hue 30–59)');
    }
    expect(hits).toEqual([]);
  });
});

describe('export HTML đứng riêng', () => {
  it('VARS đủ cho mọi biến md-doc.css dùng, và không chứa token đã xoá', () => {
    const used = [...styles('md-doc.css').matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]!);
    const missing = [...new Set(used)].filter((v) => !VARS.includes(v));
    expect(missing).toEqual([]);
    expect(VARS.filter((v) => REMOVED.includes(v))).toEqual([]);
  });
});

describe('in', () => {
  it('print.css đặt lại token vai trò trong @media print, gồm bộ chọn theme tối và color-scheme sáng', () => {
    const css = styles('print.css');
    const media = block(css, '@media print');
    expect(media).toContain(':root[data-theme=dark]');
    expect(media).toMatch(/color-scheme\s*:\s*light/);
    for (const t of ['bg', 'surface', 'side', 'ink', 'body', 'sub', 'dim', 'line', 'line2', 'hover', 'accent', 'link', 'link-h', 'code-bg', 'code-fg', 'code-line', 'code-label']) {
      expect(has(media, t), `@media print thiếu --${t}`).toBe(true);
    }
  });
});

// ---- thang chữ ----
const UI_SCALE = [11, 12, 13, 14, 18, 28];
const DISPLAY_SCALE = [22, 34, 46, 56];
const ALLOWED = new Set([...UI_SCALE, ...DISPLAY_SCALE]);
const CHROME_FILES = ['studio.css', 'workspace.css', 'inspect.css', 'site.css', 'popout.css'];
/** Cỡ chữ người dùng chọn hoặc chữ nội dung: không ép về thang của chrome. */
const isContentSelector = (sel: string) => /\.md-doc|\[data-zen\]|\.sl-notes/.test(sel);

/** [selector, thân] của mọi quy tắc phẳng (kể cả bên trong @media). */
function rules(css: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([m[1]!.trim(), m[2]!]);
  return out;
}
/** Mọi cỡ px của `font-size:` và của shorthand `font:` (kể cả trong clamp()); bỏ qua phần line-height sau dấu `/`. */
function fontPx(body: string): number[] {
  const out: number[] = [];
  for (const m of body.matchAll(/(?:^|[;\s])font-size\s*:\s*([^;]+)/g)) for (const n of m[1]!.matchAll(/(?<![/\d.])([0-9.]+)px/g)) out.push(Number(n[1]));
  for (const m of body.matchAll(/(?:^|[;\s])font\s*:\s*([^;]+)/g)) for (const n of m[1]!.matchAll(/(?<![/\d.])([0-9.]+)px/g)) out.push(Number(n[1]));
  return out;
}

describe('thang chữ', () => {
  it('chrome chỉ dùng cỡ trong thang 6+4 bậc', () => {
    const bad: string[] = [];
    for (const f of CHROME_FILES) for (const [sel, body] of rules(styles(f))) {
      if (isContentSelector(sel)) continue;
      for (const px of fontPx(body)) if (!ALLOWED.has(px)) bad.push(`${f}: ${sel.slice(0, 50)} → ${px}px`);
    }
    expect(bad).toEqual([]);
  });

  it('không nửa pixel ở file CSS nào (trừ print.css)', () => {
    const bad: string[] = [];
    for (const f of readdirSync(join(SRC, 'styles')).filter((n) => n.endsWith('.css') && n !== 'print.css')) for (const [sel, body] of rules(styles(f))) {
      for (const px of fontPx(body)) if (!Number.isInteger(px)) bad.push(`${f}: ${sel.slice(0, 50)} → ${px}px`);
    }
    expect(bad).toEqual([]);
  });

  it('tuỳ chọn Zen S/M/L vẫn cho ba cỡ khác nhau ở mỗi mặt chữ', () => {
    const sizes = new Map<string, string>();
    for (const [sel, body] of rules(styles('studio.css'))) {
      const px = /--zfs\s*:\s*([0-9.]+)px/.exec(body)?.[1];
      if (!px || !sel.startsWith('.pv[data-zen]') || sel.includes(' ') || sel.includes('[data-zread]')) continue;
      const face = sel.includes("[data-zface='mono']") ? 'mono' : 'sans';
      const size = /\[data-zsize='([sl])'\]/.exec(sel)?.[1] ?? 'm';
      sizes.set(`${face}-${size}`, px);
    }
    for (const face of ['sans', 'mono']) {
      const three = ['s', 'm', 'l'].map((z) => sizes.get(`${face}-${z}`));
      expect(three.every(Boolean), `thiếu cỡ Zen ${face}`).toBe(true);
      expect(new Set(three).size).toBe(3);
    }
  });
});

describe('lớp ghi đè', () => {
  it('quiet.css đã gộp: file không còn và không nơi nào nhắc tới', () => {
    expect(() => statSync(join(SRC, 'styles', 'quiet.css'))).toThrow();
    const hits = ALL.filter((f) => readFileSync(f, 'utf8').includes('quiet.css')).map((f) => f.slice(SRC.length + 1));
    expect(hits).toEqual([]);
  });
});

// ---- bóng và !important ----
const CSS_FILES = readdirSync(join(SRC, 'styles')).filter((n) => n.endsWith('.css'));
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function splitTop(v: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of v) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; }
  return [...out, cur];
}

describe('bóng và !important', () => {
  it('chỉ bóng cứng: không box-shadow có blur (cho phép viền nổi ≤2px)', () => {
    const bad: string[] = [];
    for (const f of CSS_FILES.filter((n) => n !== 'print.css')) for (const m of stripComments(styles(f)).matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
      if (m[1]!.trim().startsWith('var(')) continue;
      for (const sh of splitTop(m[1]!)) {
        const lengths = sh.replace(/inset/g, '').replace(/(?:color-mix|oklch|rgb|rgba|hsl|var)\((?:[^()]|\([^()]*\))*\)/g, '').match(/-?[0-9.]+(?:px|em|rem|vmax|vmin|vw|vh)?(?![a-z0-9-])/g) ?? [];
        if (lengths.length >= 3 && parseFloat(lengths[2]!) > 2) bad.push(`${f}: ${sh.trim().slice(0, 70)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('component CSS không dùng !important để thắng độ đặc hiệu', () => {
    // md-doc.css: chỉ ghi đè style nội tuyến của SVG Mermaid và nhãn footnotes (không có cách khác để thắng)
    const MERMAID = /^(filter: none|background-color: var\(--bg\)|fill: var\(--bg\)|font-size: 12px|font-family: 'JetBrains Mono', monospace) !important$/;
    const noImp = ['workspace.css', 'site.css', 'md-doc.css'].flatMap((f) => [...stripComments(styles(f)).matchAll(/([a-z-]+\s*:[^;{}]*!important)/g)].map((m) => `${f}: ${m[1]!.trim()}`)).filter((d) => !(d.startsWith('md-doc.css: ') && MERMAID.test(d.slice(12))));
    expect(noImp).toEqual([]);
    const OK = /display\s*:\s*(none|block)|pointer-events|overflow|height|transition|animation|scroll-behavior/;
    const bad: string[] = [];
    for (const f of CSS_FILES.filter((n) => n !== 'print.css')) for (const m of stripComments(styles(f)).matchAll(/([a-z-]+\s*:[^;{}]*!important)/g)) if (!OK.test(m[1]!) && !(f === 'md-doc.css' && MERMAID.test(m[1]!.trim()))) bad.push(`${f}: ${m[1]!.trim()}`);
    expect(bad).toEqual([]);
  });
});

describe('ngữ nghĩa màu', () => {
  const body = (css: string, sel: string) => rules(css).find(([s]) => s === sel)?.[1] ?? '';
  it('chấm "findings" và nhãn review dùng --warn, không dùng accent', () => {
    expect(body(styles('inspect.css'), '.ix-f .fl')).toContain('var(--warn)');
    expect(body(styles('site.css'), '.st-tag')).toContain('var(--warn)');
  });
  it('--shadow-hard là bóng cứng (blur 0)', () => {
    const m = /--shadow-hard\s*:\s*(-?[0-9.]+)px\s+(-?[0-9.]+)px\s+([0-9.]+)(?:px)?\s/.exec(styles('tokens.css'));
    expect(m, 'không đọc được --shadow-hard').not.toBeNull();
    expect(Number(m![3])).toBe(0);
  });
});
