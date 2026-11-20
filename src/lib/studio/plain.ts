/** HTML đã dựng -> chữ thường: bỏ ký hiệu Markdown, giữ ngắt đoạn, gạch đầu dòng và hàng bảng. */
const BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'TABLE', 'HR', 'DIV']);
export function htmlToPlain(html: string): string {
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  root.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  root.querySelectorAll('li').forEach((li) => {
    const ol = li.parentElement?.tagName === 'OL';
    li.prepend((ol ? `${[...li.parentElement!.children].indexOf(li) + 1}. ` : '• '));
    li.append('\n');
  });
  root.querySelectorAll('td,th').forEach((c) => c.append('\t'));
  root.querySelectorAll('tr').forEach((r) => r.append('\n'));
  root.querySelectorAll('*').forEach((el) => { if (BLOCK.has(el.tagName)) el.append('\n\n'); });
  return (root.textContent ?? '').replace(/\t\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
