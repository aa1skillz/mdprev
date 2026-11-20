import { describe, expect, it } from 'vitest';
import { findSkills, inspectCollection, inspectSkill } from '../../src/lib/skills/inspect';
import { vfsOf } from './helpers';

const skill = (name: string, desc = 'Does x. Use when y.', body = 'Body.') => `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`;
const ids = (r: { findings: { id: string }[] }) => r.findings.map((f) => f.id);

describe('inspectSkill', () => {
  it('skill sạch không có phát hiện và có đủ thông tin', () => {
    const v = vfsOf({ 'a/SKILL.md': skill('a'), 'a/ref.md': 'hello' });
    const r = inspectSkill(v, 'a');
    expect(r).toMatchObject({ dir: 'a', name: 'a', description: 'Does x. Use when y.', findings: [] });
    expect(r.files.map((f) => f.path)).toEqual(['a/SKILL.md', 'a/ref.md']);
    expect(r.tokens.trigger).toBeGreaterThan(0);
    expect(r.tokens.all).toBeGreaterThanOrEqual(r.tokens.trigger);
  });

  it('gộp spec, tham chiếu hỏng và script review; review đứng trước note', () => {
    const v = vfsOf({
      'a/SKILL.md': skill('WRONG', 'd', 'Run `python scripts/run.py` and see reference/gone.md.'),
      'a/scripts/run.py': 'import subprocess\nsubprocess.run(c, shell=True)\n',
    });
    const r = inspectSkill(v, 'a');
    expect(ids(r)).toEqual(expect.arrayContaining(['spec.name.invalid', 'ref.missing', 'script.review']));
    const sev = r.findings.map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((a, b) => (a === b ? 0 : a === 'review' ? -1 : 1)));
    const sr = r.findings.find((f) => f.id === 'script.review');
    expect(sr).toMatchObject({ file: 'a/scripts/run.py', line: 2 });
    expect(sr?.detail).toContain('shell=True');
  });

  it('script chỉ có note (mạng) hiện trong scripts nhưng không thành phát hiện', () => {
    const v = vfsOf({ 'a/SKILL.md': skill('a'), 'a/scripts/get.py': 'import requests\n' });
    const r = inspectSkill(v, 'a');
    expect(r.findings).toEqual([]);
    expect(r.scripts).toEqual([{ path: 'a/scripts/get.py', findings: [expect.objectContaining({ ruleId: 'net', severity: 'note' })] }]);
  });

  it('SKILL.md quá 5000 token là note theo khuyến nghị của spec', () => {
    const v = vfsOf({ 'a/SKILL.md': skill('a', 'd', 'x'.repeat(20_100)) });
    const f = inspectSkill(v, 'a').findings;
    expect(f.map((x) => x.id)).toEqual(['spec.size.tokens']);
    expect(f[0]?.severity).toBe('note');
  });

  it('flags của file bằng số phát hiện gắn với file đó', () => {
    const v = vfsOf({ 'a/SKILL.md': skill('WRONG'), 'a/x.md': 'ok' });
    const r = inspectSkill(v, 'a');
    expect(r.files.find((f) => f.path === 'a/SKILL.md')?.flags).toBeGreaterThan(0);
    expect(r.files.find((f) => f.path === 'a/x.md')?.flags).toBe(0);
  });

  it('skill ở gốc: dir rỗng, bỏ qua so sánh name với thư mục', () => {
    const r = inspectSkill(vfsOf({ 'SKILL.md': skill('anything'), 'n.md': 'x' }), '');
    expect(r.findings).toEqual([]);
    expect(r.files.map((f) => f.path)).toEqual(['SKILL.md', 'n.md']);
  });

  it('không tính file của skill lồng bên trong', () => {
    const v = vfsOf({ 'a/SKILL.md': skill('a'), 'a/in/SKILL.md': skill('in'), 'a/in/z.md': 'z' });
    expect(inspectSkill(v, 'a').files.map((f) => f.path)).toEqual(['a/SKILL.md']);
  });

  it('SKILL.md hỏng frontmatter vẫn ra báo cáo, không ném', () => {
    const r = inspectSkill(vfsOf({ 'a/SKILL.md': '---\nname: [oops\n---\nbody' }), 'a');
    expect(ids(r)).toContain('spec.frontmatter');
    expect(r.name).toBeNull();
  });
});

describe('inspectCollection', () => {
  it('cộng token mức always của mọi skill', () => {
    const v = vfsOf({ 'x/SKILL.md': skill('x', 'a'.repeat(37)), 'y/SKILL.md': skill('y', 'b'.repeat(37)), 'README.md': 'r' });
    const r = inspectCollection(v);
    expect(r.skills.map((s) => s.dir)).toEqual(['x', 'y']);
    expect(r.alwaysTotal).toBe(r.skills.reduce((n, s) => n + s.tokens.always, 0));
    expect(r.alwaysTotal).toBe(20);
    expect(r.fileCount).toBe(3);
  });
  it('không có skill nào thì skills rỗng nhưng vẫn đếm file', () => {
    const r = inspectCollection(vfsOf({ 'a.md': '1', 'b.md': '2' }));
    expect(r).toEqual({ skills: [], alwaysTotal: 0, fileCount: 2 });
  });
  it('bộ sưu tập lớn (600 skill × 21 file) phân tích dưới 1.5 giây, không phụ thuộc bậc hai vào số skill', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 600; i++) {
      files[`skills/s${i}/SKILL.md`] = skill(`s${i}`, 'd', 'Body see references/a.md');
      for (let j = 0; j < 20; j++) files[`skills/s${i}/references/${j === 0 ? 'a' : 'f' + j}.md`] = 'x'.repeat(100);
    }
    const v = vfsOf(files);
    const t0 = performance.now();
    const r = inspectCollection(v);
    expect(r.skills).toHaveLength(600);
    expect(r.skills[0]!.files).toHaveLength(21);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it('findSkills là danh sách thư mục có SKILL.md', () => {
    expect(findSkills(vfsOf({ 'p/SKILL.md': skill('p'), 'q/n.md': 'x' }))).toEqual(['p']);
  });
});
