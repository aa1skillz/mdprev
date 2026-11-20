import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/lib/skills/frontmatter';
import { inspectCollection } from '../../src/lib/skills/inspect';
import { findMissingRefs } from '../../src/lib/skills/refs';
import { scanScript } from '../../src/lib/skills/scan';
import { kindOf, skillDirs } from '../../src/lib/skills/vfs';
import { realSkills } from './helpers';

const real = realSkills();
const d = real ? describe : describe.skip;

/** Luật phải êm trên skill của chính Anthropic. Bỏ qua nếu chưa tải `.cache/skills-real/`. */
d('hiệu chuẩn trên 20 skill thật', () => {
  it('tìm thấy 20 skill', () => expect(skillDirs(real!).length).toBe(20));

  it('tham chiếu hỏng: 0 cảnh báo trên bộ thật', () => {
    const noisy: string[] = [];
    for (const dir of skillDirs(real!)) {
      const fm = parseFrontmatter(real!.get(dir + '/SKILL.md')?.text ?? '');
      for (const f of findMissingRefs(real!, dir, fm.body, fm.bodyStartLine)) noisy.push(`${dir}: ${f.title}`);
    }
    expect(noisy).toEqual([]);
  });

  it('quét script: chỉ with_server.py (shell=True) bị review; còn lại êm', () => {
    const review = new Set<string>();
    let scripts = 0;
    for (const [path, f] of real!) {
      if (kindOf(path) !== 'script' || f.text === undefined) continue;
      scripts++;
      if (scanScript(path, f.text).some((x) => x.severity === 'review')) review.add(path);
    }
    expect(scripts).toBeGreaterThan(60);
    expect([...review]).toEqual(['skills/webapp-testing/scripts/with_server.py']);
  });

  it('cả bộ: 20 skill, chỉ claude-api và webapp-testing có mục review, template chỉ là note', () => {
    const r = inspectCollection(real!);
    expect(r.skills).toHaveLength(20);
    expect(r.alwaysTotal).toBeGreaterThan(2000);
    expect(r.alwaysTotal).toBeLessThan(3000);
    const withReview = r.skills.filter((s) => s.findings.some((f) => f.severity === 'review')).map((s) => s.dir);
    expect(withReview).toEqual(['skills/claude-api', 'skills/webapp-testing']);
    const tpl = r.skills.find((s) => s.dir === 'template');
    expect(tpl?.findings.map((f) => f.id)).toContain('spec.name.template');
    expect(tpl?.findings.some((f) => f.severity === 'review')).toBe(false);
  });
});
