import { splitLines, type Block } from '../diff/engine';

/** Một cụm thay đổi giữa văn bản gốc (base) và văn bản hiện tại (cur), tính theo dòng. */
export interface Hunk { id: number; a: number; an: number; b: number; bn: number }

export function hunksOf(blocks: Block[]): Hunk[] {
  const out: Hunk[] = [];
  for (const k of blocks) if (k.k === 'chg') out.push({ id: out.length, a: k.a, an: k.an, b: k.b, bn: k.bn });
  return out;
}

/**
 * Hoàn tác một cụm: thay các dòng của `cur` bằng các dòng tương ứng của `base`.
 * Vị trí dòng đổi sau mỗi lần hoàn tác, nên người gọi phải tính lại diff từ đầu trước khi hoàn tác cụm tiếp theo.
 */
export function revertHunk(cur: string, base: string, h: Hunk): { text: string; caret: number } {
  const lines = cur.split('\n');
  const repl = splitLines(base).slice(h.a, h.a + h.an);
  lines.splice(h.b, h.bn, ...repl);
  const text = lines.join('\n');
  let caret = 0;
  for (let i = 0; i < Math.min(h.b, lines.length); i++) caret += lines[i]!.length + 1;
  return { text, caret: Math.min(caret, text.length) };
}
