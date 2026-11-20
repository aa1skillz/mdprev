import { describe, expect, it } from 'vitest';
import { applyChange, diffEdit, summarize, type Span } from '../src/lib/studio/authorship';

/** Mô phỏng một chuỗi sửa: mỗi bước là văn bản mới + loại (null = gõ tay). */
function run(steps: [string, Span['k'] | null][]): { text: string; spans: Span[] } {
  let text = '', spans: Span[] = [];
  for (const [next, kind] of steps) { spans = applyChange(spans, text, next, kind); text = next; }
  return { text, spans };
}
const marked = (r: { text: string; spans: Span[] }) => r.spans.map((s) => `${s.k}:${r.text.slice(s.s, s.e)}`);

describe('diffEdit', () => {
  it('finds a single replaced region by common prefix and suffix', () => {
    expect(diffEdit('hello world', 'hello brave world')).toEqual({ at: 6, del: 0, ins: 6 });
    expect(diffEdit('abcdef', 'abXef')).toEqual({ at: 2, del: 2, ins: 1 });
    expect(diffEdit('aaa', 'aaaa')).toEqual({ at: 3, del: 0, ins: 1 });
    expect(diffEdit('same', 'same')).toBeNull();
  });
});

describe('authorship spans', () => {
  it('typing leaves no marks; pasting marks exactly the pasted text', () => {
    const r = run([['Hi ', null], ['Hi PASTED', 'paste'], ['Hi PASTED!', null]]);
    expect(marked(r)).toEqual(['paste:PASTED']);
  });
  it('typing in the middle of pasted text splits the span', () => {
    const r = run([['PASTE', 'paste'], ['PAxSTE', null]]);
    expect(marked(r)).toEqual(['paste:PA', 'paste:STE']);
  });
  it('pasting in the middle of typed text marks only the paste', () => {
    const r = run([['typed text', null], ['typed [P] text', 'paste']]);
    expect(marked(r)).toEqual(['paste:[P] ']);
  });
  it('deleting part of a paste shrinks it; deleting all removes it', () => {
    let r = run([['ab ', null], ['ab PASTE', 'paste'], ['ab PASTE cd', null], ['ab PSTE cd', null]]);
    expect(marked(r)).toEqual(['paste:PSTE']);
    r = run([['ab ', null], ['ab PASTE', 'paste'], ['ab ', null]]);
    expect(r.spans).toEqual([]);
  });
  it('undo of a paste removes the mark (text returns to before)', () => {
    const r = run([['x', null], ['xYY', 'paste'], ['x', null]]);
    expect(r.spans).toEqual([]);
  });
  it('drop and opened text are kinds of their own; adjacent same kinds merge', () => {
    const r = run([['opened', 'import'], ['opened DROP', 'drop'], ['opened DROPMORE', 'drop']]);
    expect(marked(r)).toEqual(['import:opened', 'drop: DROPMORE']);
  });
  it('replacing a selection inside a paste with a paste keeps one span', () => {
    const r = run([['AAAA', 'paste'], ['AABA', 'paste']]);
    expect(marked(r)).toEqual(['paste:AABA']);
  });
  it('summarizes shares of the text', () => {
    const r = run([['typed ', null], ['typed PASTED', 'paste']]);
    expect(summarize(r.spans, r.text.length)).toEqual({ typed: 6, paste: 6, drop: 0, import: 0 });
  });
});
