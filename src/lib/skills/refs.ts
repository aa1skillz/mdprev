import type { Finding, Vfs } from './types';
import { baseOf, filesOfSkill } from './vfs';

/**
 * Tìm file được SKILL.md nhắc tới mà không có trong skill. Luật đã hiệu chuẩn trên 20 skill thật:
 * - đường dẫn có thư mục và đích liên kết tương đối: so khớp với file trong skill (cho phép khớp theo hậu tố);
 * - tên trần (`thumbnail.py`) chỉ tính khi đứng sau lệnh chạy (`python`, `node`, `bash`, ...), vì nếu không thì
 *   `p5.js`, `your_server.py` và các tên minh hoạ khác gây báo nhầm.
 * Chỉ là `note`: có thể file đó là ví dụ.
 */
const DIR_PATH = /(?<![\w/.\-])(?!\.\.\/)((?:\.\/)?(?:[\w.-]+\/)+[\w.-]+\.(?:md|py|sh|js|ts))\b/g;
const LINK = /\]\(([^)\s#]+)[^)]*\)/g;
const BARE = /\b(?:python3?|node|bash|sh|tsx|deno)\s+(?:-\S+\s+)*([\w-]+\.(?:py|sh|js|ts))\b/g;
const EXAMPLE_NAME = /^(your|my|example|foo|bar|test|app|main)[_-]|^(server|setup|app|main|test)\.(py|js|ts)$/;
const URL_RE = /https?:\/\/\S+/g;

const stripDot = (p: string): string => p.replace(/^(\.\/)+/, '');

export function findMissingRefs(vfs: Vfs, dir: string, body: string, bodyStartLine: number): Finding[] {
  const files = filesOfSkill(vfs, dir).map((f) => f.path.slice(dir === '' ? 0 : dir.length + 1));
  const bases = new Set(files.map(baseOf));
  const hasPath = (p: string): boolean => files.some((f) => f === p || f.endsWith('/' + p));

  const seen = new Map<string, number>(); // đường dẫn thiếu → dòng đầu tiên
  const miss = (p: string, line: number) => { if (!seen.has(p)) seen.set(p, line); };

  body.split('\n').forEach((raw, i) => {
    const line = bodyStartLine + i;
    const text = raw.replace(URL_RE, '');
    for (const m of text.matchAll(DIR_PATH)) {
      const p = stripDot(m[1] as string);
      if (!hasPath(p)) miss(p, line);
    }
    for (const m of text.matchAll(LINK)) {
      const t = m[1] as string;
      if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('/') || t.startsWith('../') || /[<*{]/.test(t)) continue;
      const p = stripDot(t);
      if (!/\.[A-Za-z0-9]+$/.test(p)) continue;
      if (!hasPath(p)) miss(p, line);
    }
    for (const m of text.matchAll(BARE)) {
      const n = m[1] as string;
      if (EXAMPLE_NAME.test(n)) continue;
      if (!bases.has(n)) miss(n, line);
    }
  });

  return [...seen].map(([p, line]) => ({
    id: 'ref.missing',
    severity: 'note' as const,
    title: `Mentioned but not found: ${p}`,
    detail: 'SKILL.md mentions this file, but it is not in the skill. It may be only an example.',
    file: 'SKILL.md',
    line,
  }));
}
