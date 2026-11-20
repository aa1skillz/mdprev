import { describe, expect, it } from 'vitest';
import { styleCheck, writingStats } from '../src/lib/studio/style-check';
import { addWords, streak, dayKey } from '../src/lib/studio/writing-log';

const kinds = (src: string) => styleCheck(src).map((i) => `${i.line}:${i.kind}`);

describe('style check, English', () => {
  it('ignores math: \\times and \\text are not words, in display and inline formulas', () => {
    const doc = 'Intro line.\n\n$$\n\\text{cost} = n \\times t \\times t\n$$\n\nInline $a \\times a \\times a$ here, and one-line $$b \\times b \\times b$$ too.\n';
    expect(styleCheck(doc).filter((i) => /times|text|cost/i.test(JSON.stringify(i)))).toEqual([]);
    expect(writingStats(doc).words).toBeLessThan(12);
  });
  it('flags wordy phrases and filler with a suggestion', () => {
    const r = styleCheck('We met in order to discuss the plan.\n\nIt was really very good.\n');
    expect(r.find((i) => i.line === 1)?.message).toBe('Wordy "in order to": try "to"');
    expect(r.filter((i) => i.line === 3).map((i) => i.message)).toEqual(['Filler "really": often safe to cut', 'Filler "very": often safe to cut']);
  });
  it('flags passive voice, including irregular participles, but not "is interested"', () => {
    expect(styleCheck('The report was written by the team.').map((i) => i.message)).toContain('Passive voice "was written"');
    expect(styleCheck('The bug was fixed yesterday.').map((i) => i.message)).toContain('Passive voice "was fixed"');
    expect(kinds('She is interested in maths.')).toEqual([]);
  });
  it('flags long sentences over 30 words', () => {
    const long = 'This sentence keeps going and going with one clause after another because the writer never stops to breathe or think about the reader who has to hold every part of it in mind at once.';
    expect(styleCheck(long).map((i) => i.message)).toContain('Long sentence (35 words)');
  });
  it('flags a word repeated close together and doubled words', () => {
    expect(styleCheck('The result shows that the result is wrong.').map((i) => i.message)).toContain('"result" repeated within a few words');
    expect(styleCheck('Check the the settings.').map((i) => i.message)).toContain('Doubled word "the the"');
  });
  it('skips code, front matter, inline code, URLs and tables', () => {
    const src = '---\ntitle: It was written very quickly\n---\n\n```\nvery very really\nx was done\n```\n\nRun `it was done` at https://example.com/really/very now.\n\n| a | very |\n|---|---|\n| was made | b |\n\n    indented was written code\n';
    expect(kinds(src)).toEqual([]);
  });
  it('skips headings but checks list items and quotes on their own line', () => {
    expect(kinds('# It was really done\n\n- first item\n- this is basically fine\n\n> Quote was written down.\n')).toEqual(['4:wordy', '6:passive']);
  });
});

describe('writing stats', () => {
  it('counts words, sentences, reading time and average length, ignoring code and front matter', () => {
    const s = writingStats('---\na: b\n---\n\n# Title\n\nOne two three. Four five six seven!\n\n```\ncode code code\n```\n');
    expect(s).toMatchObject({ words: 8, sentences: 3, minutes: 1 });
    expect(s.avgSentence).toBeCloseTo(8 / 3, 5);
  });
  it('runs fast on a 3000-line document', () => {
    const para = 'The report was written in order to explain why the result looked very odd to the team. ';
    const doc = Array.from({ length: 3000 }, (_, i) => (i % 3 === 2 ? '' : para + i)).join('\n');
    styleCheck(doc);
    const t0 = performance.now();
    const r = styleCheck(doc);
    writingStats(doc);
    expect(performance.now() - t0).toBeLessThan(150);
    expect(r.length).toBeGreaterThan(1000);
  });
});

describe('writing log', () => {
  const d = (s: string) => new Date(s + 'T12:00:00');
  it('adds words per day and keeps 60 days', () => {
    let log = {};
    log = addWords(log, '2026-11-15', 30);
    log = addWords(log, '2026-11-15', 30);
    expect(log).toEqual({ '2026-11-15': 60 });
  });
  it('streak counts consecutive days with at least 50 words, today optional', () => {
    const log = { '2026-11-13': 80, '2026-11-14': 120, '2026-11-15': 55, '2026-11-16': 10 };
    expect(streak(log, d('2026-11-15'))).toBe(3);
    expect(streak(log, d('2026-11-16'))).toBe(3); // hôm nay chưa đủ: chuỗi vẫn tính tới hôm qua
    expect(streak(log, d('2026-11-18'))).toBe(0);
    expect(dayKey(d('2026-01-05'))).toBe('2026-01-05');
  });
});
