import { describe, expect, it } from 'vitest';
import { renderLines, tokenizeLines } from '../src/lib/studio/tokenize';
import { existsIn, markWikilinks } from '../src/lib/vault/hl';

const join = (l: { text: string }[]) => l.map((s) => s.text).join('');
const doc = ['# Note', 'See [[Alpha]], [[Beta|the beta]], [[Alpha#Intro]] and ![[pic.png|300]].', 'Missing [[Ghost]] here, `[[code]]` stays.', '```', '[[in fence]]', '```', '**bold [[Alpha]]**'].join('\n');

describe('markWikilinks', () => {
  const exists = existsIn(['Alpha.md', 'Beta.md', 'img/pic.png']);
  const out = markWikilinks(tokenizeLines(doc), exists);
  it('never changes the text of any line', () => {
    const src = tokenizeLines(doc);
    out.forEach((l, i) => expect(join(l)).toBe(join(src[i]!)));
  });
  it('marks target, alias and brackets; embeds get wle', () => {
    const l1 = out[1]!;
    expect(l1.find((s) => s.text === 'Alpha')?.cls).toBe('wl');
    expect(l1.find((s) => s.text === 'Beta')?.cls).toBe('wl');
    expect(l1.find((s) => s.text === '|the beta')?.cls).toBe('wla');
    expect(l1.find((s) => s.text === 'Alpha#Intro')?.cls).toBe('wl');
    expect(l1.find((s) => s.text === 'pic.png')?.cls).toBe('wl wle');
    expect(l1.filter((s) => s.cls === 'mk wlm').length).toBe(8);
  });
  it('flags missing targets, ignores code and fences, keeps the base class', () => {
    expect(out[2]!.find((s) => s.text === 'Ghost')?.cls).toBe('wl wlx');
    expect(out[2]!.some((s) => s.text.includes('code') && s.cls.includes('wl'))).toBe(false);
    expect(out[4]!.some((s) => s.cls.includes('wl'))).toBe(false);
    expect(out[6]!.find((s) => s.text === 'Alpha')?.cls).toBe('b wl');
  });
  it('without a vault nothing is flagged as missing', () => {
    const plain = markWikilinks(tokenizeLines('[[Ghost]]'));
    expect(plain[0]!.find((s) => s.text === 'Ghost')?.cls).toBe('wl');
  });
  it('renders to the same characters as the plain highlighter (overlay stays aligned)', () => {
    const strip = (h: string) => h.replace(/<[^>]+>/g, '');
    expect(strip(renderLines(out, 0, out.length))).toBe(strip(renderLines(tokenizeLines(doc), 0, out.length)));
  });
  it('is fast on a 3000-line document', () => {
    const big = Array.from({ length: 3000 }, (_, i) => (i % 3 ? `Line ${i} with [[Alpha]] and [[Ghost ${i}|x]] text.` : `Line ${i} plain text only.`)).join('\n');
    const t = tokenizeLines(big);
    const t0 = performance.now();
    markWikilinks(t, exists);
    expect(performance.now() - t0).toBeLessThan(150);
  });
});
