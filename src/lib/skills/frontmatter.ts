import { parse } from 'yaml';

export interface Frontmatter {
  /** Bản đồ YAML; `null` nếu không có, không đóng, sai cú pháp hoặc không phải bản đồ. */
  data: Record<string, unknown> | null;
  /** Phần Markdown sau frontmatter (xuống dòng đã chuẩn về `\n`). */
  body: string;
  /** Dòng (tính từ 1, theo file gốc) nơi thân bắt đầu. */
  bodyStartLine: number;
  error?: string;
}

/** Tách và đọc frontmatter đầu `SKILL.md`. Không bao giờ ném lỗi. */
export function parseFrontmatter(src: string): Frontmatter {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines[0]?.trimEnd() !== '---') return { data: null, body: text, bodyStartLine: 1 };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trimEnd() === '---') { end = i; break; }
  }
  if (end < 0) return { data: null, body: text, bodyStartLine: 1, error: 'Frontmatter is not closed (missing the second ---).' };
  const body = lines.slice(end + 1).join('\n');
  const bodyStartLine = end + 2;
  const raw = lines.slice(1, end).join('\n');
  if (raw.trim() === '') return { data: {}, body, bodyStartLine };
  try {
    const v: unknown = parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      return { data: null, body, bodyStartLine, error: 'Frontmatter must be a YAML mapping (key: value pairs).' };
    }
    return { data: v as Record<string, unknown>, body, bodyStartLine };
  } catch (e) {
    return { data: null, body, bodyStartLine, error: (e as Error).message.split('\n')[0] ?? 'Invalid YAML.' };
  }
}
