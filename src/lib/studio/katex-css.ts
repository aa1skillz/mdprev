/** CSS và font KaTeX chỉ được nạp khi tài liệu có công thức (cùng nguồn gốc, không qua CDN). */
export async function ensureKatexCss(doc: Document = document): Promise<void> {
  if (doc.getElementById('katex-css')) return;
  const { default: href } = await import('katex/dist/katex.min.css?url');
  if (doc.getElementById('katex-css')) return;
  const l = doc.createElement('link');
  l.id = 'katex-css';
  l.rel = 'stylesheet';
  l.href = href;
  doc.head.append(l);
}
