import { describe, expect, it } from 'vitest';
import { excerptOf, fmtBytes, fmtTokens, reportToMarkdown, verdictFor } from '../../src/lib/skills/report';
import type { Finding, SkillReport } from '../../src/lib/skills/types';

const F = (id: string, severity: 'note' | 'review', extra: Partial<Finding> = {}): Finding => ({ id, severity, title: id, detail: 'd', ...extra });
const R = (findings: Finding[], over: Partial<SkillReport> = {}): SkillReport => ({
  dir: 'skills/x', name: 'x', description: 'd', findings, tokens: { always: 110, trigger: 5159, all: 43000 }, files: [], scripts: [], ...over,
});
const text = (s: SkillReport) => verdictFor(s).parts.map((p) => p.text).join('');
const em = (s: SkillReport) => verdictFor(s).parts.filter((p) => p.em).map((p) => p.text);

describe('verdictFor', () => {
  it('không có gì: Well-formed, nothing flagged', () => {
    expect(text(R([]))).toBe('Well-formed. This scan found nothing to review.');
    expect(verdictFor(R([])).tone).toBe('ok');
  });
  it('chỉ có note', () => {
    expect(text(R([F('a', 'note')]))).toBe('Well-formed. One note below.');
    expect(text(R([F('a', 'note'), F('b', 'note'), F('c', 'note')]))).toBe('Well-formed. 3 notes below.');
  });
  it('một script đáng đọc: nhấn mạnh đúng cụm đó', () => {
    const s = R([F('script.review', 'review')]);
    expect(text(s)).toBe('Well-formed, with one script worth a read.');
    expect(em(s)).toEqual(['one script worth a read']);
    expect(verdictFor(s).tone).toBe('attention');
  });
  it('nhiều script', () => expect(text(R([F('script.review', 'review'), F('script.review', 'review')]))).toBe('Well-formed, with 2 scripts worth a read.'));
  it('vấn đề với spec', () => {
    expect(text(R([F('spec.name.invalid', 'review')]))).toBe('One problem with the spec.');
    expect(text(R([F('spec.name.invalid', 'review'), F('spec.description.long', 'review'), F('script.review', 'review')]))).toBe('2 problems with the spec, and one script worth a read.');
  });
  it('thiếu frontmatter', () => expect(text(R([F('spec.frontmatter', 'review')]))).toBe('SKILL.md has no valid frontmatter.'));
});

describe('excerptOf', () => {
  const t = 'a\nb\nc\nd\ne';
  it('lấy dòng và ngữ cảnh, đánh số theo file gốc', () => {
    expect(excerptOf(t, 3, 1)).toEqual([{ line: 2, text: 'b' }, { line: 3, text: 'c' }, { line: 4, text: 'd' }]);
    expect(excerptOf(t, 1, 1)).toEqual([{ line: 1, text: 'a' }, { line: 2, text: 'b' }]);
  });
  it('bỏ thụt lề chung nhưng giữ thụt lề tương đối; tab đổi thành 4 dấu cách', () => {
    expect(excerptOf('        a\n          b\n        c', 2, 1)).toEqual([{ line: 1, text: 'a' }, { line: 2, text: '  b' }, { line: 3, text: 'c' }]);
    expect(excerptOf('\t\tshell=True,', 1)).toEqual([{ line: 1, text: 'shell=True,' }]);
  });
  it('mặc định chỉ một dòng; cắt dòng quá dài; không có dữ liệu thì rỗng', () => {
    expect(excerptOf(t, 5)).toEqual([{ line: 5, text: 'e' }]);
    expect(excerptOf('x'.repeat(500), 1)[0]?.text.length).toBeLessThanOrEqual(161);
    expect(excerptOf(undefined, 1)).toEqual([]);
    expect(excerptOf(t, undefined)).toEqual([]);
    expect(excerptOf(t, 99)).toEqual([]);
  });
});

describe('fmtTokens, fmtBytes', () => {
  it('fmtTokens', () => {
    expect(fmtTokens(0)).toBe('~0');
    expect(fmtTokens(110)).toBe('~110');
    expect(fmtTokens(5159)).toBe('~5.2k');
    expect(fmtTokens(43000)).toBe('~43k');
    expect(fmtTokens(519886)).toBe('~520k');
  });
  it('fmtBytes', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(900)).toBe('900 B');
    expect(fmtBytes(12 * 1024)).toBe('12 KB');
    expect(fmtBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});

describe('reportToMarkdown', () => {
  it('có tiêu đề, ba mức token, từng phát hiện kèm file:dòng và câu giới hạn', () => {
    const md = reportToMarkdown('github.com/o/r', R([F('script.review', 'review', { title: 'run.py is worth a read', file: 'skills/x/scripts/run.py', line: 7, detail: 'Runs a shell.' })]));
    expect(md).toContain('# Inspection: x');
    expect(md).toContain('github.com/o/r');
    expect(md).toContain('~110');
    expect(md).toContain('~5.2k');
    expect(md).toContain('REVIEW');
    expect(md).toContain('run.py is worth a read');
    expect(md).toContain('skills/x/scripts/run.py:7');
    expect(md).toMatch(/not a safety guarantee/i);
    expect(md).toMatch(/estimates/i);
  });
  it('không có phát hiện thì ghi rõ', () => expect(reportToMarkdown('s', R([]))).toContain('No findings'));
});
