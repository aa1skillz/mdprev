import type { DocTheme } from './theme';

/** Theme mặc định của bản xem: Newsprint (giấy trắng, chữ serif, nhấn xanh). Nằm riêng, rất nhỏ, để dựng đồng bộ ngay lần vẽ đầu, không chớp sang theme khác. */
export const NEWSPRINT: DocTheme = { paper: '#ffffff', ink: '#111111', body: '#1d1d1d', sub: '#474747', dim: '#5c5c5c', line: '#e5e5e5', line2: '#c8c8c8', hover: '#f2f2f2', accent: '#1a4fa0', 'code-bg': '#f5f5f5', 'code-fg': '#1d1d1d', 'code-label': '#5c5c5c', 'code-line': '#e0e0e0', font: 'serif', size: '18px' };

export const isNewsprint = (t: DocTheme): boolean => JSON.stringify(t) === JSON.stringify(NEWSPRINT);

/** Trạng thái dựng sẵn (biến CSS + phông); phần `css` cho file xuất được `prepare` điền sau khi module theme nạp xong. */
export function newsprintState(): { t: DocTheme; vars: [string, string][]; doc: { fontFamily?: string; fontSize?: string; maxWidth?: string }; css: string } {
  const vars: [string, string][] = [];
  for (const [k, v] of Object.entries(NEWSPRINT)) {
    if (k === 'font' || k === 'size' || k === 'measure') continue;
    vars.push(['--' + k, v]);
    if (k === 'paper') vars.push(['--bg', v]);
  }
  vars.push(['--err', 'oklch(0.5 0.17 27)'], ['--warn', 'oklch(0.47 0.1 70)'], ['--ok', 'oklch(0.46 0.1 150)']); // như themeStyle: màu mức độ của giấy sáng
  return { t: NEWSPRINT, vars, doc: { fontFamily: "'Newsreader', 'Iowan Old Style', Charter, Georgia, serif", fontSize: '18px' }, css: '' };
}

/** Nền (paper) của theme có tối không: để sơ đồ Mermaid chọn bảng màu hợp với mặt đọc, không theo giao diện của app. Hiểu #rgb, #rrggbb và oklch(L …). */
export function paperIsDark(paper: string | undefined): boolean | null {
  if (!paper) return null;
  const ok = /^oklch\(\s*([\d.]+)(%?)/i.exec(paper);
  if (ok) { const l = parseFloat(ok[1]!) / (ok[2] ? 100 : 1); return l < 0.55; }
  const hx = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(paper.trim());
  if (hx) {
    const h = hx[1]!.length === 3 ? hx[1]!.replace(/./g, (c) => c + c) : hx[1]!;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
  }
  return null;
}
