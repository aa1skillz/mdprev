import { describe, expect, it } from 'vitest';
import { checkSpec, type SpecInput } from '../../src/lib/skills/spec';

const MD = '---\nname: my-skill\ndescription: Does x. Use when y.\n---\nbody';
const run = (fm: Record<string, unknown> | null, over: Partial<SpecInput> = {}) =>
  checkSpec({ fm, dirName: 'my-skill', skillMd: MD, ...over });
const GOOD = { name: 'my-skill', description: 'Does x. Use when y.' };
const ids = (f: { id: string }[]) => f.map((x) => x.id);

describe('checkSpec: frontmatter, name, description', () => {
  it('skill hợp lệ không có phát hiện', () => expect(run(GOOD)).toEqual([]));

  it('thiếu frontmatter hợp lệ là review, kèm lỗi gốc', () => {
    const f = run(null, { fmError: 'Frontmatter is not closed' });
    expect(ids(f)).toEqual(['spec.frontmatter']);
    expect(f[0]?.severity).toBe('review');
    expect(f[0]?.detail).toContain('not closed');
  });

  it.each(['PDF-Processing', '-pdf', 'pdf-', 'pdf--x', 'a'.repeat(65), 'has space', 'under_score', ''])('name sai %j là review', (name) => {
    const f = run({ ...GOOD, name }, { dirName: '' });
    expect(ids(f)).toContain('spec.name.invalid');
    expect(f.find((x) => x.id === 'spec.name.invalid')?.severity).toBe('review');
  });

  it('name không phải chuỗi hoặc thiếu', () => {
    expect(ids(run({ description: 'x' }, { dirName: '' }))).toContain('spec.name.missing');
    expect(ids(run({ ...GOOD, name: 123 }, { dirName: '' }))).toContain('spec.name.missing');
  });

  it('chữ thường unicode là hợp lệ', () => expect(run({ ...GOOD, name: 'tài-liệu' }, { dirName: 'tài-liệu' })).toEqual([]));

  it('name khác tên thư mục là review; bỏ qua khi thư mục rỗng (skill ở gốc)', () => {
    expect(ids(run({ ...GOOD, name: 'other' }, { dirName: 'my-skill' }))).toContain('spec.name.dir');
    expect(run({ ...GOOD, name: 'other' }, { dirName: '' })).toEqual([]);
  });

  it('thư mục template khác name chỉ là note có nhãn, không phải review', () => {
    const f = run({ ...GOOD, name: 'template-skill' }, { dirName: 'template' });
    expect(ids(f)).toEqual(['spec.name.template']);
    expect(f[0]?.severity).toBe('note');
  });

  it('description thiếu, rỗng hoặc quá 1024 ký tự là review', () => {
    expect(ids(run({ name: 'my-skill' }))).toContain('spec.description.missing');
    expect(ids(run({ ...GOOD, description: '' }))).toContain('spec.description.missing');
    const f = run({ ...GOOD, description: 'x'.repeat(1025) });
    expect(ids(f)).toContain('spec.description.long');
    expect(f.find((x) => x.id === 'spec.description.long')?.detail).toContain('1025');
    expect(run({ ...GOOD, description: 'x'.repeat(1024) })).toEqual([]);
  });

  it('phát hiện về name mang số dòng của khoá trong frontmatter', () => {
    const f = run({ ...GOOD, name: 'Bad' }, { dirName: '', skillMd: '---\nname: Bad\ndescription: x\n---\n' });
    expect(f.find((x) => x.id === 'spec.name.invalid')?.line).toBe(2);
    expect(f.find((x) => x.id === 'spec.name.invalid')?.file).toBe('SKILL.md');
  });
});

describe('checkSpec: trường tuỳ chọn và kích thước', () => {
  it('compatibility quá 500 ký tự hoặc không phải chuỗi là review', () => {
    expect(ids(run({ ...GOOD, compatibility: 'x'.repeat(501) }))).toContain('spec.compatibility');
    expect(ids(run({ ...GOOD, compatibility: 5 }))).toContain('spec.compatibility');
    expect(run({ ...GOOD, compatibility: 'Needs git' })).toEqual([]);
  });

  it('metadata có giá trị không phải chuỗi là note', () => {
    const f = run({ ...GOOD, metadata: { version: 1.0 } });
    expect(ids(f)).toEqual(['spec.metadata']);
    expect(f[0]?.severity).toBe('note');
    expect(run({ ...GOOD, metadata: { version: '1.0' } })).toEqual([]);
  });

  it('allowed-tools dạng danh sách (không phải chuỗi) là note', () => {
    expect(ids(run({ ...GOOD, 'allowed-tools': ['Read', 'Bash'] }))).toEqual(['spec.allowed-tools']);
    expect(run({ ...GOOD, 'allowed-tools': 'Read Bash(git:*)' })).toEqual([]);
  });

  it('trường lạ là note, liệt kê tên', () => {
    const f = run({ ...GOOD, version: '1', author: 'a' });
    expect(ids(f)).toEqual(['spec.unknown-field']);
    expect(f[0]?.severity).toBe('note');
    expect(f[0]?.detail).toContain('version');
    expect(f[0]?.detail).toContain('author');
  });

  it('license được chấp nhận', () => expect(run({ ...GOOD, license: 'MIT' })).toEqual([]));

  it('SKILL.md quá 500 dòng là note theo khuyến nghị của spec', () => {
    const skillMd = MD + '\n'.repeat(500);
    const f = run(GOOD, { skillMd });
    expect(ids(f)).toEqual(['spec.size.lines']);
    expect(f[0]?.severity).toBe('note');
    expect(run(GOOD, { skillMd: MD + '\n'.repeat(400) })).toEqual([]);
  });
});

describe('tên skill sai nhiều chỗ', () => {
  it('báo đủ mọi điều sai trong một câu', () => {
    const f = run({ name: '-My_Skill name--x-', description: 'Does x. Use when y.' });
    const d = f.find((x) => x.id === 'spec.name.invalid')?.detail ?? '';
    for (const re of [/starts or ends with a hyphen/, /two hyphens in a row/, /uppercase letters \(M S\)/, /a space/, /an underscore/]) expect(d).toMatch(re);
  });
  it('một lỗi thì chỉ nói lỗi đó', () => {
    const d = run({ name: 'My-skill', description: 'Does x. Use when y.' }).find((x) => x.id === 'spec.name.invalid')?.detail ?? '';
    expect(d).toMatch(/uppercase letters \(M\)/);
    expect(d).not.toMatch(/starts or ends|two hyphens/);
  });
});
