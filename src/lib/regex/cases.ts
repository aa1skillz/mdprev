/** Bộ ca thử cho một regex: mỗi dòng một chuỗi; dòng bắt đầu bằng `!` là chuỗi KHÔNG được khớp (`\!` để thử chữ `!` ở đầu). */
export interface Case { text: string; expect: boolean }
export interface CaseResult { text: string; expect: boolean; matched: boolean; pass: boolean; at?: number; found?: string }
export interface CasesRun { results: CaseResult[]; error?: string; passed: number }

export function parseCases(src: string): Case[] {
  return src.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '').map((l) => {
    if (l.startsWith('\\!')) return { text: l.slice(1), expect: true };
    if (l.startsWith('!')) return { text: l.slice(1).replace(/^ /, ''), expect: false };
    return { text: l, expect: true };
  });
}

/** `full`: cả chuỗi phải khớp (^(?:mẫu)$); ngược lại chỉ cần có chỗ khớp. Cờ g, y, m bị bỏ vì chúng làm kết quả phụ thuộc trạng thái. */
export function runCases(p: string, f: string, cases: Case[], full: boolean): CasesRun {
  if (!p) return { results: [], passed: 0 };
  let re: RegExp;
  try { const fl = f.replace(/[gy]/g, ''); re = new RegExp(full ? `^(?:${p})$` : p, full ? fl.replace(/m/g, '') : fl); } catch (e) { return { results: [], passed: 0, error: String((e as Error).message).replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '') }; }
  const results = cases.map((c) => {
    const m = re.exec(c.text);
    return { text: c.text, expect: c.expect, matched: !!m, pass: c.expect === !!m, ...(m ? { at: m.index, found: m[0] } : {}) };
  });
  return { results, passed: results.filter((r) => r.pass).length };
}
