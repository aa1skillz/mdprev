/**
 * Theme tài liệu: tập token (màu theo vai trò của tokens.css, phông chọn từ danh sách, cỡ chữ, độ rộng cột) áp lên bản xem,
 * cửa sổ pop-out, bản in và file HTML xuất ra. Theme đi theo link chia sẻ (trường `theme` của payload) nên phía xem coi là
 * dữ liệu không tin cậy: chỉ nhận khoá trong allowlist, giá trị đúng dạng (màu hex/rgb/hsl/oklch, độ dài có đơn vị trong khoảng),
 * từ chối mọi thứ có `url(`, `;`, `{`, `}`, `@`, `expression`, `\`. Không bao giờ dựng chuỗi CSS từ dữ liệu chưa lọc.
 * CSS tuỳ ý của người dùng là chuyện khác: chỉ cục bộ, không vào link (xem ThemeDialog).
 */
import { NEWSPRINT, paperIsDark } from './default-theme';
export type DocTheme = Partial<Record<ThemeKey, string>>;

export const COLOR_KEYS = ['paper', 'ink', 'body', 'sub', 'dim', 'line', 'line2', 'hover', 'accent', 'code-bg', 'code-fg', 'code-label', 'code-line', 'err', 'warn', 'ok'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type ThemeKey = ColorKey | 'font' | 'size' | 'measure';

export const FONTS: Record<string, { label: string; css: string }> = {
  sans: { label: 'Sans (Be Vietnam Pro)', css: "'Be Vietnam Pro', system-ui, sans-serif" },
  serif: { label: 'Serif (Newsreader)', css: "'Newsreader', 'Iowan Old Style', Charter, Georgia, serif" },
  mono: { label: 'Mono (JetBrains Mono)', css: "'JetBrains Mono', monospace" },
  system: { label: 'System', css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
};

const NAMED = new Set(['black', 'white', 'transparent', 'currentcolor']);
const FN = /^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(\s*[-+0-9.%\s,/a-z]*\)$/i;
const FN_OK = new Set(['deg', 'turn', 'rad', 'grad', 'none']); // chữ duy nhất được phép trong hàm màu
const BAD = /url\(|[;{}@\\]|expression|image|var\(|attr\(|env\(/i;

export function isColor(v: string): boolean {
  if (v.length > 64 || BAD.test(v)) return false;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  if (NAMED.has(v.toLowerCase())) return true;
  if (!FN.test(v)) return false;
  const inner = v.slice(v.indexOf('(') + 1, -1);
  return (inner.match(/[a-z]+/gi) ?? []).every((w) => FN_OK.has(w.toLowerCase()));
}
const px = (v: string, lo: number, hi: number) => { const m = /^(\d{1,4}(?:\.\d{1,2})?)px$/.exec(v); return !!m && Number(m[1]) >= lo && Number(m[1]) <= hi; };

/** Lọc theo allowlist từng token. Không ném lỗi: giá trị sai thì bỏ token đó. */
export function sanitizeTheme(input: unknown): DocTheme {
  const out: DocTheme = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if ((COLOR_KEYS as readonly string[]).includes(k)) { if (isColor(s)) out[k as ColorKey] = s; }
    else if (k === 'font') { if (Object.hasOwn(FONTS, s)) out.font = s; }
    else if (k === 'size') { if (px(s, 12, 24)) out.size = s; }
    else if (k === 'measure') { if (px(s, 480, 1400)) out.measure = s; }
  }
  return out;
}

/** Biến CSS (đặt bằng style.setProperty) và kiểu inline cho phần tử .md-doc. Đầu vào phải đã qua sanitizeTheme. */
export function themeStyle(t: DocTheme): { vars: [string, string][]; doc: { fontFamily?: string; fontSize?: string; maxWidth?: string } } {
  const vars: [string, string][] = [];
  for (const k of COLOR_KEYS) {
    const v = t[k];
    if (!v) continue;
    vars.push(['--' + k, v]);
    if (k === 'paper') vars.push(['--bg', v]); // nền của khối code, nút chép… trong bản xem theo trang giấy
  }
  // Màu mức độ (cảnh báo/lỗi/ổn) theo mặt đọc: giấy sáng dùng bản đậm, giấy tối dùng bản sáng, không theo giao diện của app (tránh chữ vàng nhạt trên giấy sáng)
  if (t.paper) {
    const dark = paperIsDark(t.paper);
    const set = (k: 'err' | 'warn' | 'ok', light: string, night: string) => { if (!t[k]) vars.push(['--' + k, dark ? night : light]); };
    set('err', 'oklch(0.5 0.17 27)', 'oklch(0.76 0.13 27)'); set('warn', 'oklch(0.47 0.1 70)', 'oklch(0.8 0.11 80)'); set('ok', 'oklch(0.46 0.1 150)', 'oklch(0.78 0.1 150)');
  }
  const doc: { fontFamily?: string; fontSize?: string; maxWidth?: string } = {};
  if (t.font && FONTS[t.font]) doc.fontFamily = FONTS[t.font]!.css;
  if (t.size) doc.fontSize = t.size;
  if (t.measure) doc.maxWidth = t.measure;
  return { vars, doc };
}

/** Khối CSS thêm vào file HTML xuất ra (sau CSS tài liệu). Rỗng nếu theme rỗng. */
export function themeExportCss(t: DocTheme): string {
  const { vars, doc } = themeStyle(sanitizeTheme(t));
  let css = '';
  if (vars.length) {
    // biến suy ra (link, Shiki) phải khai báo lại để tính theo màu mới
    css += ':root{' + vars.map(([k, v]) => `${k}:${v}`).join(';') + ';--link:var(--accent);--link-h:color-mix(in oklch, var(--accent) 80%, var(--ink))}\n';
  }
  const d = [doc.fontFamily && `font-family:${doc.fontFamily}`, doc.fontSize && `font-size:${doc.fontSize}`, doc.maxWidth && `max-width:${doc.maxWidth}`].filter(Boolean);
  if (d.length) css += `.md-doc,.md-doc[data-doc]{${d.join(';')}}\n`;
  return css;
}

/** Thư viện nhỏ: màu tĩnh, độ tương phản chữ/nhấn trên nền đạt AA. "Default" là không ghi đè gì (theo theme sáng/tối của app). */
export const GALLERY: { id: string; label: string; theme: DocTheme }[] = [
  { id: 'newsprint', label: 'Newsprint', theme: NEWSPRINT },
  { id: 'ivory', label: 'Ivory', theme: { paper: 'oklch(0.988 0.005 90)', ink: 'oklch(0.22 0.01 60)', body: 'oklch(0.32 0.01 60)', sub: 'oklch(0.42 0.01 70)', dim: 'oklch(0.52 0.01 75)', line: 'oklch(0.9 0.008 88)', line2: 'oklch(0.8 0.01 85)', hover: 'oklch(0.94 0.008 88)', accent: 'oklch(0.47 0.13 255)', 'code-bg': 'oklch(0.97 0.005 90)', 'code-fg': 'oklch(0.3 0.01 60)', 'code-label': 'oklch(0.5 0.01 75)', 'code-line': 'oklch(0.9 0.008 88)' } },
  { id: 'sepia', label: 'Sepia', theme: { paper: '#f4ecd8', ink: '#2b2118', body: '#3b2f25', sub: '#5f4f3f', dim: '#6f5e4c', line: '#e2d6bd', line2: '#cdbd9e', hover: '#ece1c8', accent: '#7a2e2e', 'code-bg': '#ede3cc', 'code-fg': '#3b2f25', 'code-label': '#5f4f3f', 'code-line': '#ddd0b4', font: 'serif' } },
  { id: 'slate', label: 'Slate', theme: { paper: '#f6f7f9', ink: '#1b2430', body: '#2b3644', sub: '#4f5d6e', dim: '#5d6b7d', line: '#e1e5eb', line2: '#c5ccd6', hover: '#eceff3', accent: '#2f6f5e', 'code-bg': '#eef1f5', 'code-fg': '#2b3644', 'code-label': '#5d6b7d', 'code-line': '#dde2e9', font: 'system' } },
  { id: 'forest', label: 'Forest', theme: { paper: '#f2f6f0', ink: '#16251b', body: '#25362b', sub: '#4a5e50', dim: '#566a5c', line: '#dce5d8', line2: '#bccab6', hover: '#e8efe4', accent: '#2d6a4f', 'code-bg': '#e8efe4', 'code-fg': '#25362b', 'code-label': '#566a5c', 'code-line': '#d3ddcf', font: 'serif' } },
  { id: 'night', label: 'Night', theme: { paper: '#16181d', ink: '#eceae4', body: '#d6d3cb', sub: '#b0aca2', dim: '#9a968c', line: '#2a2d34', line2: '#3d414a', hover: '#22252b', accent: '#8fb4ff', 'code-bg': '#1d2026', 'code-fg': '#e2dfd8', 'code-label': '#a29e94', 'code-line': '#2c3038', err: '#ff8a80', warn: '#f2c66d', ok: '#8fd19e' } },
];

/** Thứ studio giữ trong state: token gốc (để chia sẻ), biến và kiểu inline (để áp), CSS cho file xuất. */
export interface ThemeState { t: DocTheme; vars: [string, string][]; doc: { fontFamily?: string; fontSize?: string; maxWidth?: string }; css: string }
export function prepare(input: unknown): ThemeState | null {
  const t = sanitizeTheme(input);
  if (!Object.keys(t).length) return null;
  return { t, ...themeStyle(t), css: themeExportCss(t) };
}

// Lưu cục bộ: theme đang dùng, các theme đã lưu (không giới hạn), CSS tuỳ ý (không bao giờ vào link), template của người dùng.
const K = { cur: 'mdprev-doc-theme', saved: 'mdprev-doc-themes', css: 'mdprev-doc-css', tpl: 'mdprev-user-templates' } as const;
const rd = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v === null ? d : (JSON.parse(v) as T); } catch { return d; } };
const wr = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* bị chặn */ } };

export const savedCurrent = (): ThemeState | null => prepare(rd<unknown>(K.cur, null));
export const saveCurrent = (t: DocTheme | null) => wr(K.cur, t && Object.keys(t).length ? sanitizeTheme(t) : null);
export interface SavedTheme { name: string; theme: DocTheme }
export const listSaved = (): SavedTheme[] => rd<unknown[]>(K.saved, []).flatMap((x) => { const o = x as { name?: unknown; theme?: unknown }; return typeof o?.name === 'string' ? [{ name: o.name, theme: sanitizeTheme(o.theme) }] : []; });
export const writeSaved = (l: SavedTheme[]) => wr(K.saved, l);
export interface UserTemplate { name: string; body: string }
export const listTemplates = (): UserTemplate[] => rd<unknown[]>(K.tpl, []).filter((x): x is UserTemplate => typeof (x as UserTemplate)?.name === 'string' && typeof (x as UserTemplate)?.body === 'string');
export const writeTemplates = (l: UserTemplate[]) => wr(K.tpl, l);

/** CSS tuỳ ý: chỉ trong trình duyệt này. Áp cho bản xem (thẻ <style> trong head) và file HTML xuất ra; không vào link chia sẻ, không vào pop-out. */
export const userCss = (): string => { try { return localStorage.getItem(K.css) ?? ''; } catch { return ''; } };
export function setUserCss(css: string): void {
  try { if (css.trim()) localStorage.setItem(K.css, css); else localStorage.removeItem(K.css); } catch { /* bị chặn */ }
  applyUserCss(css);
}
export function applyUserCss(css = userCss()): void {
  let el = document.getElementById('pv-user-css') as HTMLStyleElement | null;
  if (!css.trim()) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'pv-user-css'; document.head.append(el); }
  el.textContent = css; // textContent: không thể thoát khỏi thẻ style
}
export const hasLocalTheme = (): boolean => { try { return localStorage.getItem(K.cur) !== null || localStorage.getItem(K.css) !== null; } catch { return false; } };
