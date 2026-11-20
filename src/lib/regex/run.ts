/** Chạy một regex JavaScript trên văn bản: danh sách khớp, nhóm, vị trí nhóm (cờ d) và xem trước thay thế. Hàm thuần, chạy được trong worker. */
export interface Match {
  index: number; end: number; text: string;
  groups: (string | undefined)[];
  named: Record<string, string | undefined> | null;
  ranges: ([number, number] | undefined)[] | null;
}
export interface RunResult { matches: Match[]; truncated: boolean; replaced: string; ms: number; error?: string }

const cleanError = (e: unknown) => String((e as Error).message ?? e).replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '').replace(/^Invalid flags supplied to RegExp constructor '.*'$/, 'Invalid flags');

export function compile(p: string, f: string): { re?: RegExp; error?: string } {
  try { return { re: new RegExp(p, f) }; } catch (e) { return { error: cleanError(e) }; }
}

export function runRegex(p: string, f: string, text: string, repl: string, limit = 5000): RunResult {
  const t0 = performance.now();
  const empty = (error?: string): RunResult => ({ matches: [], truncated: false, replaced: text, ms: Math.round(performance.now() - t0), ...(error ? { error } : {}) });
  if (!p) return empty();
  const c = compile(p, f);
  if (!c.re) return empty(c.error);
  const re = new RegExp(p, (f.includes('g') ? f : f + 'g') + (f.includes('d') ? '' : 'd')); // `d` nội bộ để tô từng nhóm; không đổi cờ người dùng thấy và xuất ra
  const unicode = re.unicode || re.unicodeSets;
  const matches: Match[] = [];
  let truncated = false;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const ranges = (m as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices;
    matches.push({
      index: m.index, end: m.index + m[0].length, text: m[0],
      groups: m.slice(1),
      named: m.groups ? { ...m.groups } : null,
      ranges: ranges ? ranges.slice(1) : null,
    });
    if (m[0] === '') { // khớp rỗng: nhích con trỏ để khỏi lặp vô hạn (theo code point khi có cờ u/v)
      const cp = unicode ? text.codePointAt(re.lastIndex) : undefined;
      re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1;
    }
    if (matches.length >= limit) { truncated = true; break; }
    if (re.lastIndex > text.length) break;
  }
  let replaced = text;
  try { replaced = text.replace(c.re, repl); } catch { /* giữ nguyên văn */ }
  return { matches, truncated, replaced, ms: Math.round(performance.now() - t0) };
}
