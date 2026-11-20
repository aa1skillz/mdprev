/** Xuất tài liệu: HTML thân bài sạch, file .html đứng riêng, tên file. */

export const VARS = [
  'bg', 'ink', 'body', 'sub', 'dim', 'line', 'line2', 'hover',
  'code-bg', 'code-fg', 'code-line', 'code-label', 'code-btn', 'code-hover', 'accent', 'link', 'link-h', 'warn', 'err', 'ok',
  'shiki-foreground', 'shiki-background', 'shiki-token-keyword', 'shiki-token-string', 'shiki-token-string-expression',
  'shiki-token-comment', 'shiki-token-constant', 'shiki-token-function', 'shiki-token-parameter', 'shiki-token-punctuation', 'shiki-token-link',
];

/** Bỏ thuộc tính phục vụ giao diện (data-line, nút Copy) khỏi HTML xuất ra. */
export function cleanHtml(html: string): string {
  // KaTeX: bản xuất không kèm CSS/font của KaTeX nên chỉ giữ MathML, bỏ lớp .katex-html (nếu không công thức hiện hai lần).
  if (html.includes('katex-html') && typeof document !== 'undefined') {
    const t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('.katex-html').forEach((n) => n.remove());
    const d = document.createElement('div');
    d.append(t.content);
    html = d.innerHTML;
  }
  return html.replace(/ data-line="\d+"/g, '').replace(/<button[^>]*\bcb-copy\b[^>]*>[\s\S]*?<\/button>/g, '');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Giá trị các biến màu hiện tại (đúng theme và accent đang chọn) dưới dạng khối `:root{…}`. */
export function resolveVars(get: (name: string) => string): string {
  return ':root{' + VARS.map((v) => `--${v}:${get('--' + v).trim()}`).join(';') + '}';
}

export function standaloneHtml(opts: { title: string; bodyHtml: string; css: string; vars: string; docStyle?: string; extra?: string }): string {
  const ds = opts.docStyle && opts.docStyle !== 'default' ? ` data-doc="${esc(opts.docStyle)}"` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
${opts.vars}
html{background:var(--bg)}
body{margin:0;padding:48px 24px 96px;color:var(--body);font-family:'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',sans-serif}
${opts.css.replace(/\/\*[\s\S]*?\*\//g, '').trim()}
.md-doc{margin:0 auto}${opts.extra ? '\n' + opts.extra.replace(/<\/style/gi, '<\\/style').trim() : ''}
</style>
</head>
<body>
<main class="md-doc"${ds}>
${cleanHtml(opts.bodyHtml)}
</main>
</body>
</html>
`;
}

/** Tên file từ tiêu đề đầu tiên (heading 1) hoặc `untitled`. */
export function fileNameOf(src: string, ext = 'md'): string {
  const h = /^#\s+(.+?)\s*#*\s*$/m.exec(src.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(\n|$)/, ''))?.[1] ?? '';
  const slug = h.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'untitled'}.${ext}`;
}

export function titleOf(src: string): string {
  return /^#\s+(.+?)\s*#*\s*$/m.exec(src.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(\n|$)/, ''))?.[1] ?? 'Untitled';
}

export function stats(src: string): { words: number; chars: number; minutes: number } {
  const text = src.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(\n|$)/, '').replace(/```[\s\S]*?```/g, ' ');
  const words = (text.match(/\S+/g) ?? []).length;
  return { words, chars: src.length, minutes: Math.max(1, Math.ceil(words / 200)) };
}
