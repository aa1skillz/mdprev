import type { TokenLevels, Vfs } from './types';
import { filesOfSkill } from './vfs';

/** Ước lượng thô: một token ≈ 4 ký tự. Số thật phụ thuộc mô hình; luôn hiển thị là "ước lượng". */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** Ba mức tải của một skill (spec: metadata luôn nạp, SKILL.md khi kích hoạt, file kèm khi cần). */
export function tokenLevels(vfs: Vfs, dir: string, fm: Record<string, unknown> | null): TokenLevels {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const always = fm ? estimateTokens(str(fm['name']) + str(fm['description'])) : 0;
  const skillPath = dir === '' ? 'SKILL.md' : dir + '/SKILL.md';
  const trigger = estimateTokens(vfs.get(skillPath)?.text ?? '');
  let all = 0;
  for (const f of filesOfSkill(vfs, dir)) if (f.text !== undefined) all += estimateTokens(f.text);
  return { always, trigger, all };
}
