import type { SkillReport } from './types';

export interface Verdict { parts: { text: string; em?: boolean }[]; tone: 'ok' | 'attention' }

const count = (n: number, one: string, many: string): string => (n === 1 ? `one ${one}` : `${n} ${many}`);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Câu kết luận đầu báo cáo, sinh từ dữ liệu. Phần cần chú ý được đánh dấu `em`. */
export function verdictFor(s: SkillReport): Verdict {
  if (s.findings.some((f) => f.id === 'spec.frontmatter')) return { parts: [{ text: 'SKILL.md has no valid frontmatter.', em: true }], tone: 'attention' };
  const spec = s.findings.filter((f) => f.id.startsWith('spec.') && f.severity === 'review').length;
  const scripts = s.findings.filter((f) => f.id === 'script.review').length;
  const notes = s.findings.filter((f) => f.severity === 'note').length;
  const parts: Verdict['parts'] = [];
  if (spec > 0) {
    parts.push({ text: `${cap(count(spec, 'problem', 'problems'))} with the spec`, em: true });
    if (scripts > 0) { parts.push({ text: ', and ' }, { text: `${count(scripts, 'script', 'scripts')} worth a read`, em: true }); }
    parts.push({ text: '.' });
    return { parts, tone: 'attention' };
  }
  if (scripts > 0) return { parts: [{ text: 'Well-formed, with ' }, { text: `${count(scripts, 'script', 'scripts')} worth a read`, em: true }, { text: '.' }], tone: 'attention' };
  if (notes > 0) return { parts: [{ text: `Well-formed. ${cap(count(notes, 'note', 'notes'))} below.` }], tone: 'ok' };
  return { parts: [{ text: 'Well-formed. This scan found nothing to review.' }], tone: 'ok' };
}

/** Các dòng quanh `line` (đánh số theo file gốc) để trích vào báo cáo. */
export function excerptOf(text: string | undefined, line: number | undefined, context = 0): { line: number; text: string }[] {
  if (text === undefined || line === undefined) return [];
  const lines = text.split('\n');
  if (line < 1 || line > lines.length) return [];
  const from = Math.max(1, line - context);
  const to = Math.min(lines.length, line + context);
  const raw: { line: number; text: string }[] = [];
  for (let n = from; n <= to; n++) raw.push({ line: n, text: (lines[n - 1] as string).replace(/\r$/, '').replace(/\t/g, '    ') });
  // bỏ phần thụt lề chung để đoạn trích không bị đẩy sang phải
  const indent = Math.min(...raw.filter((l) => l.text.trim() !== '').map((l) => l.text.length - l.text.trimStart().length), Infinity);
  const cut = Number.isFinite(indent) ? indent : 0;
  return raw.map((l) => {
    const t = l.text.slice(cut).trimEnd();
    return { line: l.line, text: t.length > 160 ? t.slice(0, 160) + '…' : t };
  });
}

export function fmtTokens(n: number): string {
  if (n < 1000) return `~${n}`;
  const k = n / 1000;
  return `~${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** Báo cáo dạng Markdown để dán vào issue hay ghi chú. */
export function reportToMarkdown(source: string, r: SkillReport): string {
  const v = verdictFor(r).parts.map((p) => p.text).join('');
  const out: string[] = [
    `# Inspection: ${r.name ?? r.dir}`,
    '',
    `Source: ${source}`,
    '',
    v,
    '',
    `- Always loaded: ${fmtTokens(r.tokens.always)} tokens`,
    `- When the skill triggers: ${fmtTokens(r.tokens.trigger)} tokens`,
    `- All text files: ${fmtTokens(r.tokens.all)} tokens`,
    '',
    `## Findings (${r.findings.length})`,
    '',
  ];
  if (r.findings.length === 0) out.push('No findings.');
  r.findings.forEach((f, i) => {
    const where = f.file ? ` (${f.file}${f.line ? ':' + f.line : ''})` : '';
    out.push(`${i + 1}. **${f.severity.toUpperCase()}** ${f.title}${where}. ${f.detail}`);
  });
  out.push('', '> Static scan of known patterns, not a safety guarantee. Token counts are estimates from character count. Nothing was run.');
  return out.join('\n') + '\n';
}
