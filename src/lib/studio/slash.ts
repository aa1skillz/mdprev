/**
 * Menu `/` ở đầu dòng: gõ `/` trên dòng trống (ngoài khối code) thì hiện danh sách khối để chèn, gõ tiếp để lọc.
 * Hàm thuần: lọc mục và tính văn bản sau khi chèn.
 */
import type { Edit } from './edit';
import { idMaker, plainHeading } from './slug';

export interface SlashItem { id: string; label: string; hint: string; keys: string; body: (ctx: { text: string; today: string; now: string }) => string; caret?: string }

const CARET = '\u0000'; // vị trí con trỏ sau khi chèn (bị bỏ khỏi văn bản)

/** Mục lục từ các heading cấp 2–3 của văn bản (bỏ khối code), link `#id` theo đúng luật id của bản dựng. */
export function tocOf(text: string): string {
  const nextId = idMaker();
  const out: string[] = [];
  let fence = '';
  for (const l of text.split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; continue; }
    if (f) { fence = f[1] ?? ''; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (!h) continue;
    const plain = plainHeading(h[2] ?? '');
    const id = nextId(plain);
    const lv = (h[1] ?? '').length;
    if (lv === 2 || lv === 3) out.push(`${lv === 3 ? '  ' : ''}- [${plain}](#${id})`);
  }
  return out.length ? out.join('\n') : '- ' + CARET;
}

export const SLASH: SlashItem[] = [
  { id: 'h1', label: 'Heading 1', hint: '#', keys: 'h1 heading title', body: () => '# ' + CARET },
  { id: 'h2', label: 'Heading 2', hint: '##', keys: 'h2 heading section', body: () => '## ' + CARET },
  { id: 'h3', label: 'Heading 3', hint: '###', keys: 'h3 heading subsection', body: () => '### ' + CARET },
  { id: 'ul', label: 'Bullet list', hint: '-', keys: 'bullet list ul unordered', body: () => '- ' + CARET },
  { id: 'ol', label: 'Numbered list', hint: '1.', keys: 'numbered list ol ordered', body: () => '1. ' + CARET },
  { id: 'task', label: 'Task list', hint: '[ ]', keys: 'task todo checkbox check', body: () => '- [ ] ' + CARET },
  { id: 'quote', label: 'Quote', hint: '>', keys: 'quote blockquote', body: () => '> ' + CARET },
  { id: 'code', label: 'Code block', hint: '```', keys: 'code block fence snippet', body: () => '```' + CARET + '\n\n```' },
  { id: 'table', label: 'Table', hint: '| |', keys: 'table grid', body: () => '| ' + CARET + 'Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |' },
  { id: 'note', label: 'Note', hint: '[!NOTE]', keys: 'callout note info admonition', body: () => '> [!NOTE]\n> ' + CARET },
  { id: 'tip', label: 'Tip', hint: '[!TIP]', keys: 'callout tip hint admonition', body: () => '> [!TIP]\n> ' + CARET },
  { id: 'important', label: 'Important', hint: '[!IMPORTANT]', keys: 'callout important admonition', body: () => '> [!IMPORTANT]\n> ' + CARET },
  { id: 'warning', label: 'Warning', hint: '[!WARNING]', keys: 'callout warning admonition', body: () => '> [!WARNING]\n> ' + CARET },
  { id: 'caution', label: 'Caution', hint: '[!CAUTION]', keys: 'callout caution danger admonition', body: () => '> [!CAUTION]\n> ' + CARET },
  { id: 'math', label: 'Math block', hint: '$$', keys: 'math equation katex latex formula', body: () => '$$\n' + CARET + '\n$$' },
  { id: 'mermaid', label: 'Diagram', hint: 'mermaid', keys: 'diagram mermaid flowchart chart graph', body: () => '```mermaid\nflowchart LR\n  A[' + CARET + 'Start] --> B[End]\n```' },
  { id: 'image', label: 'Image', hint: '![]()', keys: 'image picture img photo', body: () => '![' + CARET + '](https://)' },
  { id: 'link', label: 'Link', hint: '[]()', keys: 'link url anchor', body: () => '[' + CARET + '](https://)' },
  { id: 'footnote', label: 'Footnote', hint: '[^1]', keys: 'footnote reference note', body: () => '[^1]: ' + CARET },
  { id: 'hr', label: 'Divider', hint: '---', keys: 'divider hr rule separator slide break', body: () => '---\n\n' + CARET },
  { id: 'toc', label: 'Contents', hint: 'from headings', keys: 'toc contents table of contents outline index', body: ({ text }) => tocOf(text) },
  { id: 'notes', label: 'Speaker notes', hint: 'Note: (--- decks)', keys: 'speaker notes presenter slides', body: () => 'Note: ' + CARET },
  { id: 'date', label: 'Date', hint: 'today', keys: 'date today', body: ({ today }) => today + CARET },
  { id: 'time', label: 'Date and time', hint: 'now', keys: 'time datetime now timestamp', body: ({ now }) => now + CARET },
  { id: 'fm', label: 'Front matter', hint: '---', keys: 'front matter yaml frontmatter metadata', body: ({ today }) => '---\ntitle: ' + CARET + '\ndate: ' + today + '\ntags: []\n---\n' },
];

/** Lọc theo chữ gõ sau `/`: khớp đầu nhãn trước, rồi khớp ở bất kỳ từ khoá nào. */
export function filterSlash(q: string, items: SlashItem[] = SLASH): SlashItem[] {
  const k = q.trim().toLowerCase();
  if (!k) return items;
  const starts = items.filter((i) => i.label.toLowerCase().startsWith(k) || i.id.startsWith(k));
  const rest = items.filter((i) => !starts.includes(i) && (i.label.toLowerCase().includes(k) || i.keys.includes(k)));
  return [...starts, ...rest];
}

/** Có đang gõ `/lệnh` ở đầu dòng không: trả vị trí dấu `/` và chữ đã gõ, hoặc null. Không bật trong khối code, sau dấu cách, hay khi trước `/` có chữ. */
export function slashAt(text: string, pos: number): { start: number; q: string } | null {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const before = text.slice(ls, pos);
  const m = /^(\s*)\/([\p{L}\p{N}-]*)$/u.exec(before);
  if (!m) return null;
  if (inFence(text, ls)) return null;
  return { start: ls + (m[1] ?? '').length, q: m[2] ?? '' };
}

function inFence(text: string, lineStart: number): boolean {
  let fence = '';
  for (const l of text.slice(0, lineStart).split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (fence) { if (f && (f[1] ?? '')[0] === fence[0] && (f[1] ?? '').length >= fence.length) fence = ''; }
    else if (f) fence = f[1] ?? '';
  }
  return !!fence;
}

/** Thay `/chữ` (từ `start` tới `pos`) bằng nội dung của mục. Dòng sau con trỏ giữ nguyên. */
export function applySlash(text: string, start: number, pos: number, item: SlashItem, when = new Date()): Edit {
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const now = `${today} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
  let body = item.body({ text, today, now });
  if (!body.includes(CARET)) body += CARET;
  const at = body.indexOf(CARET);
  body = body.replace(CARET, '');
  return { text: text.slice(0, start) + body + text.slice(pos), start: start + at, end: start + at };
}
