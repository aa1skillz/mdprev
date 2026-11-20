import { parseFrontmatter } from './frontmatter';
import { findMissingRefs } from './refs';
import { scanScript } from './scan';
import { checkSpec } from './spec';
import { estimateTokens, tokenLevels } from './tokens';
import type { CollectionReport, FileInfo, Finding, ScriptReport, SkillReport, Vfs } from './types';
import { baseOf, filesOfSkill, kindOf, skillDirs } from './vfs';

/** Thư mục chứa `SKILL.md` (`''` nếu ở gốc). */
export const findSkills = skillDirs;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const bySeverity = (a: Finding, b: Finding): number => (a.severity === b.severity ? 0 : a.severity === 'review' ? -1 : 1);

/** Phân tích một skill. Không ném lỗi với đầu vào hỏng: gói mọi vấn đề thành phát hiện. */
export function inspectSkill(vfs: Vfs, dir: string): SkillReport {
  const skillPath = dir === '' ? 'SKILL.md' : `${dir}/SKILL.md`;
  const text = vfs.get(skillPath)?.text ?? '';
  const fm = parseFrontmatter(text);
  // spec.ts và refs.ts ghi `file: 'SKILL.md'`; trong báo cáo mọi đường dẫn là đường dẫn đầy đủ trong Vfs.
  const full = (f: Finding): Finding => (f.file === 'SKILL.md' ? { ...f, file: skillPath } : f);
  const findings: Finding[] = [
    ...checkSpec({ fm: fm.data, fmError: fm.error, dirName: dir === '' ? '' : baseOf(dir), skillMd: text }),
    ...findMissingRefs(vfs, dir, fm.body, fm.bodyStartLine),
  ].map(full);

  const tokens = tokenLevels(vfs, dir, fm.data);
  if (tokens.trigger > 5000) {
    findings.push({
      id: 'spec.size.tokens', severity: 'note', title: 'SKILL.md is large',
      detail: `About ${tokens.trigger} tokens (estimate); the spec recommends under 5000 for the instructions.`, file: skillPath,
    });
  }

  const files = [...filesOfSkill(vfs, dir)].sort((a, b) => (a.path < b.path ? -1 : 1));
  const scripts: ScriptReport[] = [];
  for (const f of files) {
    if (kindOf(f.path) !== 'script' || f.text === undefined) continue;
    const hits = scanScript(f.path, f.text);
    scripts.push({ path: f.path, findings: hits });
    const review = hits.filter((h) => h.severity === 'review');
    if (review.length) {
      findings.push({
        id: 'script.review', severity: 'review', title: `${baseOf(f.path)} is worth a read`,
        detail: [...new Set(review.map((h) => `${h.message} (line ${h.line})`))].join(' '), file: f.path, line: (review[0] as { line: number }).line,
      });
    }
  }
  findings.sort(bySeverity); // sắp ổn định: review trước note, giữ thứ tự gốc trong cùng mức

  const infos: FileInfo[] = files.map((f) => ({
    path: f.path, size: f.size, tokens: f.text === undefined ? 0 : estimateTokens(f.text), kind: kindOf(f.path),
    flags: findings.filter((x) => x.file === f.path).length,
  }));
  return { dir, name: str(fm.data?.['name']), description: str(fm.data?.['description']), findings, tokens, files: infos, scripts };
}

/** Phân tích mọi skill tìm được trong Vfs. */
export function inspectCollection(vfs: Vfs): CollectionReport {
  const skills = findSkills(vfs).map((d) => inspectSkill(vfs, d));
  return { skills, alwaysTotal: skills.reduce((n, s) => n + s.tokens.always, 0), fileCount: vfs.size };
}
