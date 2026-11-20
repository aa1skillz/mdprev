/** Front matter YAML -> bảng thuộc tính. Tách khỏi pipeline.ts để thư viện YAML chỉ nạp khi tài liệu có front matter. */
import { parse } from 'yaml';
import { cutFrontMatter, type FrontMatter } from './pipeline';

export function fmRows(raw: string): FrontMatter {
  let rows: [string, string][] = [];
  try {
    const data = parse(raw) as unknown;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      rows = Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')]);
    }
  } catch { /* YAML hỏng: vẫn tách phần đầu ra, bảng thuộc tính để trống */ }
  return { rows, raw };
}

/** Tách front matter ở đầu văn bản. `body` giữ nguyên số dòng để `data-line` khớp ô soạn. */
export function splitFrontMatter(src: string): { fm: FrontMatter | null; body: string } {
  const { raw, body } = cutFrontMatter(src);
  return { fm: raw === null ? null : fmRows(raw), body };
}
