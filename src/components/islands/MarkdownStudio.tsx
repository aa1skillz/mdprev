import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { emit, on } from '../../lib/bus';
import { copyText } from '../../lib/clipboard';
import { nrm } from '../../lib/tags';
import { KEYS, readJson, readString, removeKey, writeJson, writeString, writeStringOk } from '../../lib/storage';
import { diffLines } from '../../lib/studio/diff';
import { seamCenter } from '../../lib/studio/seam';
import { alignTableAt, codeBlock, collapseMarker, diffSpan, hr, image, math, toc, indentLines, insertTable, link, linkTo, moveCell, smartEnter, table, tableCellAt, tableEnter, tableOp, tableRangeAt, type TableOp, toggleLines, tsvToRows, wrapKey, wrapSel, type Edit, type LineKind } from '../../lib/studio/edit';
import { deleteLines, duplicateLines, linkAt, moveLines, moveSection, selectLines, selectNext, swapSection } from '../../lib/studio/lineops';
import { applySlash, filterSlash, slashAt, type SlashItem } from '../../lib/studio/slash';
import { applyCompletion, completionAt, completionItems, type CompAt, type CompItem } from '../../lib/studio/complete';
import { altFromName, assetBlob, hasAssets, inlineAssets, isImage, listAssets, prepareAssets, putAsset, refsIn, withAssetUrls } from '../../lib/studio/assets';
import { slideAtLine, splitSlides } from '../../lib/studio/slides';
import { cleanHtml, fileNameOf, resolveVars, standaloneHtml, stats, titleOf } from '../../lib/studio/export';
import { findAll, lineStartsOf, replaceAll, replaceOne, segments, type Match as FindMatch } from '../../lib/studio/find';
import { runInWorker } from '../../lib/regex/regex-client';
import { fixTrailing, lint } from '../../lib/studio/lint';
import type { FrontMatter } from '../../lib/studio/pipeline';
import { POPOUT_CHANNEL, POPOUT_NAME, type PopMsg } from '../../lib/studio/popout';
import { renderInWorker } from '../../lib/studio/render-client';
import { applyTransform, TRANSFORMS, type TransformId } from '../../lib/studio/transform';
import { url } from '../../lib/url';
import { SAMPLE } from '../../lib/studio/sample';
import WelcomeCard from '../WelcomeCard';
import { NEWSPRINT, isNewsprint, newsprintState, paperIsDark } from '../../lib/studio/default-theme';
import { fileNameFromUrl, resolveLink, rewriteHtml, sourceLabel, toRawUrl } from '../../lib/studio/source';
import { blockExternalImages } from '../../lib/studio/guard';
import { paragraphRange, paragraphLevels, renderLines, sentenceMarks, tokenizeLines } from '../../lib/studio/tokenize';
import docCss from '../../styles/md-doc.css?raw';
import { addSnapshot, listSnapshots, type Snap } from '../../lib/studio/history';
import { TEMPLATES } from '../../lib/studio/templates';
import { cleanClipboardHtml, htmlToMarkdown, preloadTurndown } from '../../lib/studio/paste-html';
import { StudioFind } from './StudioFind';
import { StudioHistory } from './StudioHistory';
import { StudioAssets } from './StudioAssets';
import { StudioSlides } from './StudioSlides';
import { SlideView } from './SlideView';
import ZenCards, { DEFAULT_ZPREFS, GOALS, type ZPrefs } from './ZenCards';
import { htmlToPlain } from '../../lib/studio/plain';
import { ensureKatexCss } from '../../lib/studio/katex-css';
import { hasMermaid, mermaidSvgForExport, openMermaidGate, resetMermaidGates, upgradeMermaid, wantAllMermaid } from '../../lib/studio/mermaid';
import GuideLink, { Icon, type IconName } from './icons';
import type { ComponentType } from 'preact';
import type { InspectorTab } from './InspectorPanel';
import { createPortal } from 'preact/compat';
import type { Workspace } from '../../lib/workspace/model';
import type { DocTheme, ThemeState } from '../../lib/studio/theme';
import type { Tracker } from '../../lib/studio/authorship-track';
import { ACTIVE_KEY, getActiveId, setActiveId } from '../../lib/workspace/active';
import { themeForStorageEvent } from '../../lib/prefs';

const isDark = () => document.documentElement.dataset['theme'] === 'dark';

type View = 'split' | 'src' | 'pv';
type Fn = (text: string, s: number, e: number) => Edit;
type Spell = 'off' | 'en';
type DocStyle = 'default' | 'paper' | 'compact';
const DOC_STYLES: DocStyle[] = ['default', 'paper', 'compact'];
const DOC_LABEL: Record<DocStyle, string> = { default: 'Default', paper: 'Paper', compact: 'Compact' };
const DOC_HINT: Record<DocStyle, string> = { default: 'balanced', paper: 'serif, long reads', compact: 'specs, tables' };
const SPELL_LABEL: Record<Spell, string> = { off: 'Off', en: 'English' };
interface Head { id: string; text: string; level: number; line: number }
interface FsHandle { name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }
interface FsWindow { showOpenFilePicker?: (o?: object) => Promise<FsHandle[]>; showSaveFilePicker?: (o?: object) => Promise<FsHandle> }
/** Thẻ nạp lười theo tính năng: chỉ tải module khi mở. */
const XD = { share: () => import('./ShareDialog'), theme: () => import('./ThemeDialog'), site: () => import('./SiteDialog') };
const fsw = () => window as unknown as FsWindow;
const MD_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'], 'application/zip': ['.textpack'] } }];
const isPack = (n: string) => /\.textpack$/i.test(n);

const HL_CHUNK = 64;
const PAD = 16;
const OVERSCAN = 40;
const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); // như toLocaleString('en-US') nhưng không khởi tạo ICU ở lần dựng đầu (~20 ms CPU trên điện thoại)
const lines = (k: LineKind): Fn => (t, s, e) => toggleLines(t, s, e, k);
const wrap = (b: string, a: string, ph: string): Fn => (t, s, e) => wrapSel(t, s, e, b, a, ph);
const typing = (el: EventTarget | null) => { const t = el as HTMLElement | null; return !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable); };
/** Số cột hiển thị của một đoạn đầu dòng: tab nở tới bội của tab-size (2), khớp với `tab-size: 2` của ô soạn. */
const cols = (t: string) => { let c = 0; for (const ch of t) c = ch === '\t' ? c + 2 - (c % 2) : c + 1; return c; };
const lineOf = (text: string, pos: number) => { let n = 1; for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) n++; return n; };

interface Tool { id: string; label: string; title: string; run: Fn; cls?: string; icon?: IconName }
/** Transform thường dùng hiện trong menu ⋯ của thanh nổi; còn lại qua Palette (">transform"). */
const QUICK_TRANSFORMS: TransformId[] = ['sort', 'unique', 'title', 'wrap-80', 'quotes-curly'];
const GROUPS: Tool[][] = [
  [
    { id: 'b', label: 'B', title: 'Bold (Ctrl/⌘+B)', run: wrap('**', '**', 'bold'), cls: 'pv-b', icon: 'bold' },
    { id: 'i', label: 'I', title: 'Italic (Ctrl/⌘+I)', run: wrap('*', '*', 'italic'), icon: 'italic' },
    { id: 's', label: 'S', title: 'Strikethrough', run: wrap('~~', '~~', 'text'), cls: 'pv-s', icon: 'strike' },
    { id: 'code', label: 'code', title: 'Inline code', run: wrap('`', '`', 'code'), icon: 'code' },
  ],
  [
    { id: 'h1', label: 'H1', title: 'Heading 1', run: lines('h1'), icon: 'h1' },
    { id: 'h2', label: 'H2', title: 'Heading 2', run: lines('h2'), icon: 'h2' },
    { id: 'h3', label: 'H3', title: 'Heading 3', run: lines('h3'), icon: 'h3' },
    { id: 'toc', label: 'ToC', title: 'Insert a table of contents', run: (t, s, e) => toc(t, s, e, HEADS_NOW()), icon: 'toc' },
  ],
  [
    { id: 'ul', label: '-', title: 'Bullet list', run: lines('ul'), icon: 'list' },
    { id: 'ol', label: '1.', title: 'Numbered list', run: lines('ol'), icon: 'ol' },
    { id: 'task', label: '[x]', title: 'Task list', run: lines('task'), icon: 'task' },
  ],
  [
    { id: 'quote', label: 'quote', title: 'Quote', run: lines('quote'), icon: 'quote' },
    { id: 'fence', label: 'block', title: 'Code block', run: codeBlock, icon: 'fence' },
    { id: 'hr', label: 'rule', title: 'Horizontal rule', run: hr, icon: 'hr' },
    { id: 'math', label: 'math', title: 'Formula', run: math, icon: 'math' },
  ],
  [
    { id: 'link', label: 'link', title: 'Link (Ctrl/⌘+K)', run: link, icon: 'link' },
    { id: 'image', label: 'image', title: 'Image', run: image, icon: 'image' },
    { id: 'table', label: 'table', title: 'Table', run: table, icon: 'table' },
  ],
];
const GROUP_NAMES = ['Text style', 'Headings', 'Lists', 'Blocks', 'Insert'];
let HEADS_NOW: () => { id: string; text: string; level: number }[] = () => [];
/** `OPENED SKILL.md` thành `Opened SKILL.md`: chỉ hạ các từ viết hoa toàn bộ, chữ cái đầu viết hoa. */
const KEEP_CAPS = new Set(['URL', 'HTML', 'PDF', 'MD', 'DOCX', 'IME', 'OS']);
const sentence = (t: string): string => t.split(' ').map((w) => (/^[A-Z]{2,}[.,;:]?$/.test(w) && !KEEP_CAPS.has(w.replace(/[.,;:]$/, '')) ? w.toLowerCase() : w)).join(' ').replace(/^./, (c) => c.toUpperCase());
const BY_KEY: Record<string, string> = { b: 'b', i: 'i', k: 'link' };
const TOOLS = Object.fromEntries(GROUPS.flat().map((t) => [t.id, t]));
const SPELLS: Spell[] = ['off', 'en'];
/** Thanh công cụ nổi của zen: nhãn gọn, dùng lại đúng hành động của thanh công cụ thường. */
const zenBtn = (id: string, label?: string) => ({ id, label: label ?? TOOLS[id]!.label, title: TOOLS[id]!.title, cls: TOOLS[id]!.cls, icon: TOOLS[id]!.icon });
/** Hàng phím Markdown trên bàn phím ảo (điện thoại): nhãn như mockup, chạy đúng hành động của thanh công cụ thường. */
/**
 * Cập nhật DOM của lớp tô màu bằng các thay đổi nhỏ nhất (đổi chữ trong nút văn bản sẵn có, chỉ thay nút khi cấu trúc đổi) thay vì ghi lại innerHTML.
 * Lý do: mỗi lần gỡ nút khỏi lớp tô màu giữa lúc gõ, Chrome ngắt nhóm hoàn tác đang gom, nên Ctrl+Z chỉ lùi từng ký tự (đã đo: ô soạn trần gom cả câu).
 */
function morphChildren(a: Node, b: Node): void {
  const bc = b.childNodes;
  for (let i = 0; i < bc.length; i++) {
    const x = a.childNodes[i], y = bc[i]!;
    if (!x) { a.appendChild(y.cloneNode(true)); continue; }
    if (x.nodeType === 3 && y.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.nodeType === 1 && y.nodeType === 1 && (x as Element).tagName === (y as Element).tagName) {
      const ex = x as Element, ey = y as Element;
      for (const at of [...ex.attributes]) if (!ey.hasAttribute(at.name)) ex.removeAttribute(at.name);
      for (const at of [...ey.attributes]) if (ex.getAttribute(at.name) !== at.value) ex.setAttribute(at.name, at.value);
      morphChildren(ex, ey);
      continue;
    }
    a.replaceChild(y.cloneNode(true), x);
  }
  while (a.childNodes.length > bc.length) a.removeChild(a.lastChild!);
}
function HlChunk({ html }: { html: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    morphChildren(el, tpl.content);
    if (el.innerHTML !== tpl.innerHTML) el.innerHTML = html; // phòng khi bản tối thiểu lệch (không xảy ra với HTML do highlighter sinh)
  }, [html]);
  return <span class="hc" ref={ref} />;
}

/** Tiêu đề hiển thị của một tài liệu: `title:` trong front matter, không thì tiêu đề # đầu tiên, không thì dòng đầu có chữ. */
function docTitle(text: string): string {
  const lines = text.split('\n');
  let i = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      const m = lines.slice(1, end).map((l) => /^title:\s*(.+)$/i.exec(l)).find(Boolean);
      if (m) return m[1]!.replace(/^["']|["']$/g, '').trim();
      i = end + 1;
    }
  }
  return lines.slice(i).map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '';
}
const PHONE_KEYS: [string, string][] = [['b', 'B'], ['i', 'I'], ['h2', '#'], ['ul', '-'], ['task', '[ ]'], ['link', 'link'], ['code', '</>'], ['table', 'table']];
const ZEN_MAIN = [zenBtn('h1'), zenBtn('h2'), zenBtn('h3'), zenBtn('b'), zenBtn('i'), zenBtn('link'), zenBtn('quote', '>'), zenBtn('ul', '•'), zenBtn('ol')];
const ZEN_MORE = [zenBtn('s'), zenBtn('code', '`code`'), zenBtn('fence', 'block'), zenBtn('task'), zenBtn('table')];

function download(name: string, mime: string, text: string | Uint8Array): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text as BlobPart], { type: typeof text === 'string' ? mime + ';charset=utf-8' : mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Chép HTML dạng rich text (dán vào Notion, Docs giữ định dạng). Không có Clipboard API (HTTP thường) thì chọn vùng rồi `copy`. */
async function copyRich(html: string, plain: string): Promise<boolean> {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
      return true;
    }
  } catch { /* chuyển sang cách chọn vùng */ }
  const box = document.createElement('div');
  box.innerHTML = html;
  box.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap';
  document.body.appendChild(box);
  const sel = getSelection();
  const r = document.createRange();
  r.selectNodeContents(box);
  sel?.removeAllRanges(); sel?.addRange(r);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* bỏ qua */ }
  sel?.removeAllRanges(); box.remove();
  return ok;
}

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => { const id = setTimeout(() => setD(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return d;
}

/** Markdown Preview: ô soạn tô màu cú pháp (chỉ dựng phần đang nhìn thấy), bản xem tài liệu sạch, outline/jump, find, lint, zen. */
export default function MarkdownStudio() {
  const [src, setSrc] = useState<string>(() => readString(KEYS.md) ?? ''); // khách mới bắt đầu từ tờ giấy trống (thẻ chào); bài mẫu chỉ nạp khi họ bấm "Try a sample"
  /** Lịch sử gõ: `loaded` = văn bản lúc nạp (undo không đi quá mốc này, kể cả khi ngăn xếp gốc còn dư từ file trước); `redo` = vừa có thao tác undo nên redo mới có nghĩa. */
  const hist = useRef({ loaded: src, redo: false }); // lần dựng đầu: mốc là văn bản đã lưu
  const [html, setHtml] = useState('');
  const [pvStale, setPvStale] = useState(false); // vừa đổi tài liệu, bản xem còn là của tài liệu cũ: ẩn nó và báo "Loading preview…" cho tới khi bản mới dựng xong
  const [fm, setFm] = useState<FrontMatter | null>(null);
  const [view, setView] = useState<View>(() => (matchMedia('(min-width: 960px)').matches ? 'split' : 'src')); // điện thoại: vào Edit (khách mới thấy thẻ chào trên tờ giấy trống; trước đây mở ở Read để xem bài mẫu, giờ không còn bài mẫu mặc định)
  const [menu, setMenu] = useState<'' | 'file' | 'export' | 'view' | 'open'>('');
  const [selMenu, setSelMenu] = useState(false); // menu ⋯ (Transform) của thanh nổi khi chọn chữ
  const [inspOpenDoc, setInspOpenDoc] = useState<boolean>(() => readString(KEYS.insp) === '1'); // panel Inspector bên phải (mặc định đóng)
  const [inspOpenSkill, setInspOpenSkill] = useState<boolean>(() => { const v = readString(KEYS.inspSkill); return v === null ? matchMedia('(min-width: 1280px)').matches : v !== '0'; }); // khi sửa bản sao skill: tự mở, nhớ riêng để không đè lựa chọn của Markdown thường
  const [inspTabDoc, setInspTabDoc] = useState<InspectorTab>(() => { const v = readString(KEYS.inspTab); return v === 'props' || v === 'checks' || v === 'history' ? v : 'outline'; });
  const [inspTabSkill, setInspTabSkill] = useState<InspectorTab>(() => { const v = readString(KEYS.inspTabSkill); return v === 'findings' || v === 'outline' || v === 'checks' ? v : 'overview'; });
  const histSub = useRef<'changes' | 'history'>('changes');
  const [InspC, setInspC] = useState<ComponentType<any> | null>(null);
  const toggleInsp = () => { const n = !inspOpen; if (skillMode) { setInspOpenSkill(n); writeString(KEYS.inspSkill, n ? '1' : '0'); } else { setInspOpenDoc(n); writeString(KEYS.insp, n ? '1' : '0'); } };
  const pickInspTab = (t: InspectorTab) => { if (skillMode) { setInspTabSkill(t); writeString(KEYS.inspTabSkill, t); } else { setInspTabDoc(t); writeString(KEYS.inspTab, t); } if (t === 'history') setHistOpen(false); }; // chỉ một bản StudioHistory: tab History thay ngăn cố định
  const [saveInfo, setSaveInfo] = useState<{ t: string; ok: boolean }>({ t: '', ok: true });
  const [custom, setCustom] = useState<string>(() => readString(KEYS.mdName) ?? '');
  const [editName, setEditName] = useState<string | null>(null);
  const [railQ, setRailQ] = useState('');
  const [railSel, setRailSel] = useState(0);
  const [olFold, setOlFold] = useState<Set<number>>(() => new Set());
  const [expOpen, setExpOpen] = useState(false); // idem cho "Export" (chỉ điện thoại: nút Export của thanh tài liệu không đủ chỗ)
  const tplHover = useRef(0); // lúc mục mẫu tự mở vì rê chuột: cú bấm ngay sau đó không được đóng nó lại
  /** Bảng trượt trên điện thoại: mở mục con (Export, mẫu) thì cuộn mục đó lên đầu bảng để danh sách con thấy ngay, không phải cuộn tìm. */
  const sheetTop = (el: HTMLElement) => { if (!matchMedia('(max-width: 899px)').matches) return; setTimeout(() => el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 0); };
  const [tplOpen, setTplOpen] = useState(false); // mục "New from template" của menu File mở rộng tại chỗ
  useEffect(() => { if (menu !== 'file') setTplOpen(false); }, [menu]);
  // thanh định dạng: nhóm nào không vừa bề rộng ô soạn thì chuyển vào nút ⋯ (tên truy cập giữ nguyên trong menu)
  const toolsRef = useRef<HTMLDivElement>(null);
  const toolW = useRef<number[]>([]);
  const [toolCut, setToolCut] = useState(GROUPS.length);
  const [toolMore, setToolMore] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const el = toolsRef.current; if (!el) return;
    const grps = () => [...el.querySelectorAll<HTMLElement>(':scope > .pv-grp:not(.pv-right):not(.pv-more):not(.pv-fixed)')];
    const fit = () => {
      if (el.offsetParent === null) return; // ẩn (Read, Zen): chưa đo được
      const g = grps();
      if (g.length === GROUPS.length) toolW.current = g.map((x) => x.offsetWidth + parseFloat(getComputedStyle(x).marginRight)); // cả lề phải 22px giữa các nhóm: thiếu nó thì đo hụt và nút cuối (Link/Table) bị cắt ở ~800px
      const w = toolW.current; if (w.length !== GROUPS.length) return;
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (el.querySelector<HTMLElement>(':scope > .pv-right')?.offsetWidth ?? 0) - ((f) => (f ? f.offsetWidth + parseFloat(getComputedStyle(f).marginRight) : 0))(el.querySelector<HTMLElement>(':scope > .pv-fixed'));
      if (w.reduce((a, b) => a + b, 0) <= avail) { setToolCut(GROUPS.length); return; }
      let sum = 0, k = 0;
      while (k < w.length && sum + w[k]! <= avail - 44) { sum += w[k]!; k++; }
      setToolCut(Math.max(1, k));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    document.fonts?.ready.then(fit).catch(() => undefined);
    return () => ro.disconnect();
  }, [view]);
  useEffect(() => {
    if (!toolMore) return;
    const down = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest('.pv-more')) setToolMore(null); };
    const esc = (ev: globalThis.KeyboardEvent) => { if (ev.code === 'Escape') { setToolMore(null); } };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', esc); };
  }, [toolMore]);
  const [heads, setHeads] = useState<Head[]>([]);
  HEADS_NOW = () => heads; // nút ToC cần danh sách tiêu đề hiện tại (id đúng như bản xem dựng)
  const [active, setActive] = useState('');
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [zen, setZen] = useState(false);
  // xuống dòng ngoài zen: điện thoại mặc định bật (dòng dài bị cắt ở mép là lỗi dễ thấy nhất), màn lớn tắt; lựa chọn đã lưu luôn thắng
  const [wrapPref, setWrapPref] = useState<boolean | null>(() => { const v = readString(KEYS.mdWrap); return v === '1' ? true : v === '0' ? false : null; }); // null = tự động: ngắt dòng theo bề rộng khung (kéo thanh chia thì dòng và số dòng chảy theo), trừ tài liệu rất dài (ngắt dòng dựng cả văn bản)
  const [wrapAuto, setWrapAuto] = useState<boolean>(() => { const t = readString(KEYS.md); return !t || t.split('\n').length <= 1000; }); // khởi tạo theo tài liệu đang lưu để tài liệu lớn không dựng ngắt dòng rồi mới bật lại
  const wrapOn = wrapPref ?? wrapAuto;
  const wrapped = zen || wrapOn;
  const [focused, setFocused] = useState(false);
  const [win, setWin] = useState({ from: 0, to: 80 });
  const [metrics, setMetrics] = useState({ lh: 23, cw: 8.4 });
  const [spell, setSpell] = useState<Spell>(() => { const v = readString(KEYS.mdSpell); return v === 'en' ? v : 'off'; }); // chỉ off hoặc English (giá trị 'vi' cũ về off)
  const [wide, setWide] = useState<boolean>(() => readString(KEYS.mdWide) === '1');
  const [cursorMark, setCursorMark] = useState<boolean>(() => readString(KEYS.mdCursor) === '1'); // vạch con trỏ ở bản xem (Split): mặc định tắt, bật trong View options
  const [syncOn, setSyncOn] = useState<boolean>(() => readString(KEYS.mdSync) !== '0'); // cuộn đồng bộ Split: mặc định bật
  const toggleSync = () => { const n = !syncOn; setSyncOn(n); writeString(KEYS.mdSync, n ? '1' : '0'); say(n ? 'SYNC SCROLL ON' : 'SYNC SCROLL OFF'); }; // dùng chung cho nút ở thanh trạng thái và lệnh Palette; bật lại thì effect [syncOn] bên dưới căn bản xem theo ô soạn
  const [split, setSplit] = useState<number>(() => { const n = Number(readString(KEYS.mdSplit)); return n >= 25 && n <= 75 ? n : 50; });
  const splitEl = useRef<HTMLDivElement>(null);
  // Nguồn của tài liệu mở từ URL (URL raw): dùng để resolve link/ảnh tương đối. Bài mặc định và file trên máy không có nguồn.
  const [base, setBaseState] = useState<string | null>(() => readString(KEYS.mdBase));
  const baseRef = useRef<string | null>(base);
  baseRef.current = base;
  const setBase = (b: string | null) => { baseRef.current = b; setBaseState(b); if (b) writeString(KEYS.mdBase, b); else removeKey(KEYS.mdBase); };
  const nav = useRef<{ stack: string[]; i: number }>({ stack: [], i: -1 });
  const [navTick, setNavTick] = useState(0);
  const pendingHash = useRef('');
  const loadingUrl = useRef(false);
  const [find, setFind] = useState({ open: false, q: '', r: '', regex: false, cs: false, idx: 0 });
  const [baseline, setBaseline] = useState<string>(() => readString(KEYS.md) ?? '');
  const [saved, setSaved] = useState<string | null>(null);
  const [recent, setRecent] = useState<Snap[]>([]); // mục "Recent" của menu File: dựng từ các bản chụp đã lưu, không có kho lưu riêng
  const undoBase = useRef<string | null>(null);
  const [undoBar, setUndoBar] = useState<string | null>(null); // thông báo có nút Undo sau khi thay tài liệu (thay cho confirm)
  const undoTimer = useRef(0);
  const [hasPrev, setHasPrev] = useState<boolean>(() => !!readString(KEYS.mdPrev));
  const [slides, setSlides] = useState<{ start: number; k: number } | null>(null);
  const [docStyle, setDocStyle] = useState<DocStyle>(() => { const v = readString(KEYS.mdDoc); return (DOC_STYLES as string[]).includes(v ?? '') ? (v as DocStyle) : 'paper'; });
  const [printToc, setPrintToc] = useState(false);
  // menu `/` ở đầu dòng: vị trí dấu `/`, chữ đã gõ, mục đang chọn
  // popup gợi ý tại con trỏ: menu `/` (kind 'slash') hoặc gợi ý link (`](#`, `[^`, `![…](`)
  const [slash, setSlash] = useState<{ kind: 'slash' | CompAt['kind']; start: number; q: string; sel: number; at?: CompAt } | null>(null);
  const [assetList, setAssetList] = useState<{ id: string; name: string }[]>([]);
  const refreshAssets = () => { void listAssets().then((l) => setAssetList((l ?? []).map((a) => ({ id: a.id, name: a.name })))); };
  useEffect(refreshAssets, []);
  const slashRef = useRef(slash); slashRef.current = slash;
  const slashBox = useRef<HTMLUListElement>(null);
  useEffect(() => { slashBox.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [slash?.sel, slash?.q]);
  const [dragLine, setDragLine] = useState(0); // outline: mục đang kéo (dòng heading)
  const [dropLine, setDropLine] = useState(-1); // outline: đích thả (dòng heading, 0 = cuối tài liệu)
  const railFocus = useRef(0); // sau khi chuyển mục bằng phím: focus lại mục ở dòng này
  const [histOpen, setHistOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const plainNext = useRef(false);
  const lastSnap = useRef('');

  const ta = useRef<HTMLTextAreaElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const gut = useRef<HTMLDivElement>(null);
  const out = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLElement>(null);
  // theme tài liệu (mục 4): token đã lọc, áp lên .pv-out (biến) và .md-doc (phông, cỡ, độ rộng); module chỉ nạp khi có theme
  // Mặc định là Newsprint: dựng đồng bộ để lần vẽ đầu đã đúng theme (không chớp); theme đã lưu của người dùng thắng khi nạp xong
  const [dt, setDt] = useState<ThemeState | null>(() => { try { return localStorage.getItem('mdprev-doc-theme') === null ? newsprintState() : null; } catch { return newsprintState(); } });
  const [implicit, setImplicit] = useState(() => { try { return localStorage.getItem('mdprev-doc-theme') === null; } catch { return true; } }); // dt là mặc định ngầm (chưa ai chọn): không đi theo link, không đè giao diện tối
  const [dk, setDk] = useState(isDark);
  useEffect(() => { const o = new MutationObserver(() => setDk(isDark())); o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return () => o.disconnect(); }, []);
  const dtx = implicit && dk ? null : dt;
  const dtxRef = useRef(dtx); dtxRef.current = dtx;
  const slideDt = dtx ? { vars: dtx.vars, doc: { fontFamily: dtx.doc.fontFamily } } : null; // slide và cửa sổ người trình bày đi theo theme đọc
  const readDark = () => paperIsDark(dtxRef.current?.t.paper) ?? isDark(); // mặt đọc tối hay sáng (theme đọc thắng giao diện app)
  const themeOf = (t: unknown, save: boolean) => void import('../../lib/studio/theme').then((m) => { setImplicit(false); setDt(m.prepare(t)); if (save) m.saveCurrent(t as DocTheme); });
  useEffect(() => { try { const has = localStorage.getItem('mdprev-doc-theme') !== null; void import('../../lib/studio/theme').then((m) => { if (has) setImplicit(false); setDt(has ? m.savedCurrent() : m.prepare(NEWSPRINT)); m.applyUserCss(); }); } catch { /* bị chặn */ } }, []);
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const railBox = useRef<HTMLElement>(null);
  const railInput = useRef<HTMLInputElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const rawHtml = useRef('');
  const index = useRef<{ line: number; el: HTMLElement }[]>([]);
  const skipUntil = useRef(0);
  const drive = useRef({ by: '' as '' | 'ed' | 'pv', t: 0 });
  const prevView = useRef<View>('split');
  const prevTop = useRef(0);
  const zenEnter = useRef(false);
  const [zp, setZp] = useState<ZPrefs>(() => {
    const v = readJson<Partial<ZPrefs>>(KEYS.mdZen, {});
    const D = DEFAULT_ZPREFS;
    return {
      face: v.face === 'mono' ? 'mono' : D.face, dim: v.dim === 'strong' || v.dim === 'off' ? v.dim : D.dim,
      goal: (GOALS as readonly number[]).includes(v.goal ?? -1) ? v.goal! : D.goal,
      size: v.size === 's' || v.size === 'l' ? v.size : D.size, col: v.col === 'narrow' || v.col === 'wide' ? v.col : D.col,
      copy: v.copy === 'rich' || v.copy === 'plain' ? v.copy : D.copy,
      focus: v.focus === 'sentence' ? v.focus : D.focus, tw: v.tw === 'third' || v.tw === 'free' ? v.tw : D.tw,
      chrome: v.chrome === 'always' || v.chrome === 'hidden' ? v.chrome : D.chrome, pin: v.pin === true, hinted: v.hinted === true,
    };
  });
  const twRef = useRef(zp.tw); twRef.current = zp.tw;
  const [zProg, setZProg] = useState<number | null>(null); // % đã đọc ở mặt Read
  const [zHint, setZHint] = useState(false); // gợi ý phím, chỉ hiện ở lần vào zen đầu tiên
  const [zDark, setZDark] = useState(false);
  const [zr, setZr] = useState(false); // zen đang ở mặt ĐỌC (bản xem đã dựng) thay vì mặt VIẾT
  const zrRef = useRef(false); zrRef.current = zr; // caret() đọc qua ref (listener selectionchange đăng ký một lần)
  const [zShow, setZShow] = useState(true); // card thống kê của zen đang hiện (mờ đi khi đang gõ)
  const [zMenu, setZMenu] = useState(false); // popover cài đặt zen (nút ⋯)
  const zMenuRef = useRef(false); zMenuRef.current = zMenu; // Esc đóng bảng cài đặt Zen trước, lần sau mới thoát Zen (listener đăng ký một lần nên đọc qua ref)
  const [zSel, setZSel] = useState<{ s: number; e: number } | null>(null); // vùng đang bôi đen trong zen
  const [zSelPos, setZSelPos] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [sel, setSel] = useState<{ s: number; e: number } | null>(null); // vùng đang bôi đen ngoài zen: chỗ neo của thanh định dạng nổi
  const [zTick, setZTick] = useState(0); // đổi khi ô soạn cuộn, để tính lại vị trí thanh công cụ nổi
  const zenStart = useRef({ w: 0, t: 0 });
  const savedSel = useRef({ s: 0, e: 0 });
  const raf = useRef(0);
  const winRaf = useRef(0);
  const fh = useRef<FsHandle | null>(null);
  const prevTable = useRef<[number, number] | null>(null);
  const lastInput = useRef(0);
  const inCommit = useRef(false);
  const popChan = useRef<BroadcastChannel | null>(null);
  const popT = useRef(0);
  const uiT = useRef(0);
  const restored = useRef(false);
  const srcRef = useRef(src);
  const wsBusyRef = useRef(getActiveId() !== null);
  srcRef.current = src;

  const { lh, cw } = metrics;
  const lazy = useDebounced(src, 250);
  const st = useMemo(() => stats(lazy), [lazy]);
  const issues = useMemo(() => lint(lazy), [lazy]);
  const wPrev = useRef(-1); // nhật ký số từ viết mỗi ngày (chuỗi ngày ở tab Checks); bỏ bước tăng lớn (dán, nạp tài liệu)
  useEffect(() => { const d = st.words - wPrev.current; if (wPrev.current >= 0 && d > 0 && d <= 200) void import('../../lib/studio/writing-log').then((m) => m.bumpToday(d)); wPrev.current = st.words; }, [st.words]);
  const lineCount = useMemo(() => { let n = 1; for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) n++; return n; }, [src]);
  useEffect(() => { if (lineCount > 1000) setWrapAuto(false); else if (lineCount < 700) setWrapAuto(true); }, [lineCount]); // trễ hai đầu để không nhảy bố cục khi đang gõ quanh ngưỡng
  const derivedName = useMemo(() => fileNameOf(lazy), [lazy]);
  const fileName = custom || derivedName;
  // tab trình duyệt hiện tên tài liệu (chỉ ở /app/; trang chủ giữ tiêu đề SEO)
  // tiêu đề tab "thật" của trang, in tạm đổi document.title để PDF có tên đẹp rồi trả về đúng giá trị này (không chụp lại title hiện tại: bấm in hai lần liên tiếp sẽ chụp nhầm tên tạm)
  const baseTitle = useRef(document.title);
  const withExt = (ext: string) => fileName.replace(/\.[^./]*$/, '') + '.' + ext;
  const dirty = saved !== null && src !== saved;

  const [ws, setWs] = useState<Workspace | null>(null); // bản sao/vault đang sửa (xem phần workspace bên dưới)
  const [wsPath, setWsPath] = useState<string | null>(null);
  // ---- tô màu: tokenize cả văn bản (rẻ), nhưng chỉ dựng HTML cho phần đang nhìn thấy ----
  // wikilink (vault hoặc tài liệu có `[[`): bộ tô thêm nạp lười, đích không có trong vault tô kiểu cảnh báo
  const [wlLib, setWlLib] = useState<typeof import('../../lib/vault/hl') | null>(null);
  const wantWl = ws?.origin.kind === 'vault' || src.includes('[[');
  useEffect(() => { if (wantWl && !wlLib) void import('../../lib/vault/hl').then((m) => setWlLib(() => m)); }, [wantWl]);
  const wlPaths = ws?.origin.kind === 'vault' ? [...ws.files.map((f) => f.path), ...(ws.images ?? []).map((i) => i.path)].join('\n') : '';
  const wlExists = useMemo(() => (wlLib && wlPaths ? wlLib.existsIn(wlPaths.split('\n')) : undefined), [wlLib, wlPaths]);
  const tokens = useMemo(() => { const t = tokenizeLines(src); return wlLib && wantWl ? wlLib.markWikilinks(t, wlExists) : t; }, [src, wlLib, wlExists]);
  const zenRange = useMemo<[number, number] | undefined>(() => (zen ? paragraphRange(src, pos.ln) : undefined), [zen, zen ? src : '', zen ? pos.ln : 0]);
  const zenLevels = useMemo(() => (zen ? paragraphLevels(src, pos.ln) : undefined), [zen, zen ? src : '', zen ? pos.ln : 0]);
  // Focus: Sentence. Chỉ tính khi bật (chế độ Paragraph giữ nguyên các phụ thuộc cũ); khoá dạng chuỗi để cả khi con trỏ đi trong cùng một câu cũng không dựng lại lớp tô màu
  const sentOn = zen && zp.focus === 'sentence' && !zr && zp.dim !== 'off';
  const zenSent = useMemo(() => (sentOn ? sentenceMarks(src, pos.ln, pos.col) : undefined), [sentOn, sentOn ? src : '', sentOn ? pos.ln : 0, sentOn ? pos.col : 0]);
  const sentKey = zenSent ? [...zenSent].map(([k, v]) => `${k}:${v[0]}-${v[1]}`).join(',') : '';
  const sentRef = useRef(zenSent); sentRef.current = zenSent;
  // lớp tô màu dựng theo khối 64 dòng: khi xuống dòng (cả văn bản) mỗi lần gõ chỉ khối bị đổi mới phải thay DOM, các khối còn lại giữ nguyên chuỗi nên Preact bỏ qua
  const hlChunks = useMemo(() => {
    const end = Math.min(win.to, tokens.length), out: string[] = [];
    for (let a = win.from; a < end; a += HL_CHUNK) { const b = Math.min(end, a + HL_CHUNK); out.push(renderLines(tokens, a, b, zenRange, zenLevels, sentRef.current) + (b < end ? '\n' : '')); }
    return out;
  }, [tokens, win.from, win.to, zenRange, zenLevels, sentKey]);
  const marks = useMemo(() => {
    const d = diffLines(baseline.split('\n'), lazy.split('\n'));
    return { a: new Set(d.added), m: new Set(d.modified), d: new Set(d.deleted) };
  }, [baseline, lazy]);
  // lint theo dòng: lề số dòng có dấu và chú thích khi rê chuột (lớp tô màu nằm dưới textarea nên không rê lên chữ được)
  const issueAt = useMemo(() => { const m = new Map<number, string[]>(); for (const i of issues) m.set(i.line, [...(m.get(i.line) ?? []), i.message]); return m; }, [issues]);
  const gutHtml = useMemo(() => {
    const rows: string[] = [];
    const at = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    for (let i = win.from; i < Math.min(lineCount, win.to); i++) {
      const n = i + 1;
      const w = issueAt.get(n);
      const c = [n === pos.ln ? 'cur' : '', marks.a.has(n) ? 'ga' : '', marks.m.has(n) ? 'gm' : '', marks.d.has(n) ? 'gd' : '', w ? 'gw' : ''].filter(Boolean).join(' ');
      const chg = marks.a.has(n) ? 'Added since the last save' : marks.m.has(n) ? 'Changed since the last save' : marks.d.has(n) ? 'Lines were deleted just above' : '';
      const ttl = w ? w.join(' · ') : chg;
      rows.push(`<div${c ? ` class="${c}"` : ''}${ttl ? ` title="${at(ttl)}"` : ''}${w ? ` data-ln="${n}"` : ''}>${n}</div>`);
    }
    return rows.join('');
  }, [win.from, win.to, lineCount, pos.ln, marks, issueAt]);

  // ---- authorship (mục 6): bật tay, gần đúng, chỉ cục bộ; bộ theo dõi nạp lười ----
  const [authOn, setAuthOn] = useState(() => readString(KEYS.mdAuth) === '1');
  const auth = useRef<Tracker | null>(null);
  const [authTick, setAuthTick] = useState(0);
  useEffect(() => {
    if (!authOn) return;
    let dead = false, tr: Tracker | null = null;
    void import('../../lib/studio/authorship-track').then((m) => (ta.current ? m.createTracker(ta.current, srcRef.current) : null)).then((t) => { if (dead) t?.destroy(); else { tr = t; auth.current = t; setAuthTick((n) => n + 1); } });
    return () => { dead = true; tr?.destroy(); auth.current = null; };
  }, [authOn]);
  useEffect(() => { auth.current?.update(src); auth.current?.paint(ta.current?.parentElement?.querySelector('.ed-hl') ?? null, wrapOn && !zen); }, [src, hlChunks, wrapOn, zen, authTick]);
  const toggleAuth = () => { const n = !authOn; setAuthOn(n); writeString(KEYS.mdAuth, n ? '1' : '0'); say(n ? 'AUTHORSHIP MARKS ON · LOCAL, APPROXIMATE, NOT PROOF' : 'AUTHORSHIP MARKS OFF'); };

  // ---- find ----
  // Tìm chữ thường chạy ngay; regex chạy trong worker có hạn chót (một mẫu như (a+)+$ không được làm đứng tab cùng tài liệu đang mở)
  const lit = useMemo(() => (find.open && !find.regex ? findAll(src, find.q, { regex: false, caseSensitive: find.cs }) : null), [find.open, find.regex, find.q, find.cs, src]);
  const [rf, setRf] = useState<{ src: string; q: string; cs: boolean; matches: FindMatch[]; error?: string; timedOut?: boolean } | null>(null);
  const rfSeq = useRef(0);
  useEffect(() => {
    if (!find.open || !find.regex || !find.q) return;
    const my = ++rfSeq.current;
    const id = setTimeout(() => {
      void runInWorker(find.q, 'gm' + (find.cs ? '' : 'i'), src, '').then((o) => {
        if (my !== rfSeq.current) return;
        const base = { src, q: find.q, cs: find.cs };
        if (o.timedOut) setRf({ ...base, matches: [], timedOut: true });
        else setRf({ ...base, matches: o.res.matches.filter((m) => m.end > m.index).map((m) => ({ index: m.index, length: m.end - m.index, groups: m.groups.map((g) => g ?? '') })), ...(o.res.error ? { error: o.res.error } : {}) });
      });
    }, 150);
    return () => clearTimeout(id);
  }, [find.open, find.regex, find.q, find.cs, src]);
  const rfFresh = rf !== null && rf.src === src && rf.q === find.q && rf.cs === find.cs;
  const found: { matches: FindMatch[]; error?: string | undefined; timedOut?: boolean | undefined; pending?: boolean } = !find.open ? { matches: [] }
    : find.regex ? (!find.q ? { matches: [] } : rfFresh ? { matches: rf.matches, error: rf.error, timedOut: rf.timedOut } : { matches: [], pending: true })
      : lit ?? { matches: [] };
  const fIdx = found.matches.length ? Math.min(find.idx, found.matches.length - 1) : 0;
  // ngắt dòng (chế độ thường): lớp tô là các `.l` thật, nên dấu lint và dấu thay đổi là lớp CSS trên từng dòng; Find dùng CSS Custom Highlight API (không cần đo vị trí dòng đã ngắt)
  useEffect(() => {
    if (!wrapOn || zen) return;
    const hl = ta.current?.parentElement?.querySelector('.ed-hl');
    if (!hl) return;
    hl.querySelectorAll<HTMLElement>('.l').forEach((el, i) => {
      const n = i + 1, c = el.classList;
      c.toggle('lw', issueAt.has(n)); c.toggle('ga', marks.a.has(n)); c.toggle('gm', marks.m.has(n)); c.toggle('gd', marks.d.has(n));
    });
  }, [wrapOn, zen, hlChunks, issueAt, marks]);
  useEffect(() => {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!reg || !H) return;
    const clear = () => { reg.delete('mdprev-find'); reg.delete('mdprev-find-cur'); };
    const hl = ta.current?.parentElement?.querySelector('.ed-hl');
    if (!wrapOn || zen || !find.open || !found.matches.length || !hl) { clear(); return; }
    const lines = hl.querySelectorAll('.l');
    const starts = [0]; for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
    if (lines.length !== starts.length) { clear(); return; } // lớp tô chưa theo kịp văn bản: lần sau
    const locate = (off: number): [Node, number] => {
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= off) lo = mid; else hi = mid - 1; }
      const el = lines[lo]!;
      let rem = off - starts[lo]!;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const len = (n as Text).data.length; if (rem <= len) return [n, rem]; rem -= len; }
      return [el, el.childNodes.length];
    };
    const all: Range[] = []; let cur: Range | null = null;
    try {
      found.matches.slice(0, 3000).forEach((m, i) => {
        const [sn, so] = locate(m.index), [en, eo] = locate(m.index + m.length);
        const r = new Range(); r.setStart(sn, so); r.setEnd(en, eo);
        if (i === fIdx) cur = r; else all.push(r);
      });
      reg.set('mdprev-find', new H(...all));
      if (cur) reg.set('mdprev-find-cur', new H(cur)); else reg.delete('mdprev-find-cur');
    } catch { clear(); }
    return clear;
  }, [wrapOn, zen, find.open, found.matches, fIdx, hlChunks, src]);
  const starts = useMemo(() => (find.open ? lineStartsOf(src) : []), [find.open, src]);
  const boxes = useMemo(() => {
    if (!find.open || !found.matches.length) return [];
    const out: { left: number; top: number; width: number; on: boolean; key: string }[] = [];
    found.matches.forEach((m, i) => {
      for (const sg of segments(starts, src, m)) {
        if (sg.line < win.from || sg.line >= win.to) continue;
        const base = starts[sg.line] ?? 0;
        const c0 = cols(src.slice(base, base + sg.col));
        const c1 = cols(src.slice(base, base + sg.col + sg.len));
        out.push({ left: PAD + c0 * cw, top: PAD + sg.line * lh, width: (c1 - c0) * cw, on: i === fIdx, key: `${i}-${sg.line}` });
      }
    });
    return out;
  }, [find.open, found, starts, win.from, win.to, cw, lh, fIdx, src]);

  // Tài liệu mở từ link chia sẻ: hỏi trước khi thay bản đang soạn; ảnh ngoài bị chặn tới khi người dùng cho phép (nhớ qua lần tải lại)
  const [pendingShare, setPendingShare] = useState<string | null>(null);
  // thẻ nạp lười (link có mật khẩu, theme…): k chọn module, p là props
  const [xd, setXd] = useState<{ k: keyof typeof XD; p: Record<string, unknown> } | null>(null);
  const [XC, setXC] = useState<{ k: string; C: ComponentType<any> } | null>(null);
  useEffect(() => { if (xd && XC?.k !== xd.k) void XD[xd.k]().then((m) => setXC({ k: xd.k, C: m.default })); }, [xd, XC]);
  const [extBlocked, setExtBlockedState] = useState(() => readString(KEYS.mdExtBlock) === '1');
  const blockRef = useRef(extBlocked);
  blockRef.current = extBlocked;
  const setExtBlocked = (v: boolean) => { blockRef.current = v; setExtBlockedState(v); if (v) writeString(KEYS.mdExtBlock, '1'); else removeKey(KEYS.mdExtBlock); };
  /** HTML của worker → HTML hiển thị: link/ảnh tương đối theo nguồn, ảnh `asset:` thành blob URL, ảnh ngoài bị chặn nếu cần. */
  const finish = (h: string) => { const x = withAssetUrls(rewriteHtml(h, baseRef.current)); return blockRef.current ? blockExternalImages(x).html : x; };

  // ---- Mermaid: dựng khi khối cuộn tới gần (IntersectionObserver), hoặc đủ hết khi có chỗ cần HTML đầy đủ ----
  const mmDone = useRef<Promise<void>>(Promise.resolve());
  const runMermaid = (raw: string, my: number) => { mmDone.current = upgradeMermaid(raw, readDark(), { stale: () => my !== seq.current, onUpdate: (h) => setHtml(finish(h)) }); };
  /** Dựng mọi sơ đồ còn chờ rồi trả HTML mới nhất (cho chép, xuất, in). */
  const fullHtml = async (): Promise<string> => {
    if (hasMermaid(latest.current.html)) {
      wantAllMermaid();
      let p: Promise<void>;
      do { p = mmDone.current; await p; } while (p !== mmDone.current);
      await new Promise((r) => requestAnimationFrame(() => r(null))); // chờ Preact ghi HTML vào state/DOM
    }
    return latest.current.html;
  };

  const wlHash = useRef(''); // heading cần cuộn tới sau khi mở note qua wikilink
  useEffect(() => { if (wlHash.current) { const el = doc.current?.querySelector<HTMLElement>('#' + CSS.escape(wlHash.current)); if (el) { el.scrollIntoView(); wlHash.current = ''; } } }, [html]);
  useEffect(() => { doc.current?.querySelectorAll<HTMLInputElement>('.task-list-item > input[type=checkbox], .task-list-item input[type=checkbox]').forEach((i) => { i.disabled = false; }); }, [html]); // HTML gốc để disabled (xuất file chỉ đọc); trong bản xem thì bấm được
  // vault: note khác + ảnh cho wikilink trong bản xem; khoá đổi khi danh sách note/ảnh hay nội dung note khác đổi (worker giữ theo khoá)
  const vctx = useMemo(() => {
    if (ws?.origin.kind !== 'vault' || !wsPath) return undefined;
    const notes = ws.files.filter((f) => f.path !== wsPath).map((f) => ({ path: f.path, text: f.text }));
    const images = (ws.images ?? []).map((i) => ({ path: i.path, id: i.id }));
    return { key: [ws.id, wsPath, ...notes.map((f) => f.path + ':' + f.text.length), ...images.map((i) => i.id)].join('\n'), self: wsPath, notes, images };
  }, [ws, wsPath]);
  const vctxRef = useRef(vctx); vctxRef.current = vctx;
  // ---- render bản xem sau khi ngừng gõ; bỏ kết quả cũ nếu đã có lần gõ mới hơn ----
  useEffect(() => {
    const okW = wsOnRef.current || wsBusyRef.current ? true : writeStringOk(KEYS.md, src);
    setSaveInfo((p) => { const t = okW ? new Date().toTimeString().slice(0, 5) : p.t; return p.ok === okW && p.t === t ? p : { t, ok: okW }; });
    const my = ++seq.current;
    setBusy(true);
    const id = setTimeout(() => {
      renderInWorker(src, vctxRef.current)
        .then((r) => {
          if (my !== seq.current) return;
          rawHtml.current = r.html;
          return prepareAssets(r.html).then(() => {
            if (my !== seq.current) return;
            setHtml(finish(r.html)); setFm(r.fm); setBusy(false); setPvStale(false); // hiện ngay; sơ đồ Mermaid lên sau, khi cuộn tới
            resetMermaidGates();
            runMermaid(r.html, my);
          });
        })
        .catch(() => { if (my === seq.current) { setBusy(false); setPvStale(false); } });
    }, 160);
    return () => clearTimeout(id);
  }, [src, base, vctx?.key]);

  // Đổi theme đọc (nền sáng ↔ tối): dựng lại sơ đồ Mermaid với bảng màu hợp nền mới
  const paperKey = dtx?.t.paper ?? '';
  useEffect(() => { if (!hasMermaid(rawHtml.current)) return; const my = seq.current; setHtml(finish(rawHtml.current)); runMermaid(rawHtml.current, my); }, [paperKey]);
  // Sơ đồ Mermaid theo theme sáng/tối: đổi theme thì dựng lại từ HTML gốc của worker.
  useEffect(() => {
    const mo = new MutationObserver(() => {
      if (!hasMermaid(rawHtml.current)) return;
      const my = seq.current;
      setHtml(finish(rawHtml.current));
      runMermaid(rawHtml.current, my);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => { // khối Mermaid trong bản xem: mở cổng khi cách màn hình dưới ~1 trang
    const d = doc.current, root = out.current;
    if (!d || !hasMermaid(html)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const l = (e.target as HTMLElement).dataset['line']; if (l) openMermaidGate(l); io.unobserve(e.target); } }), { root, rootMargin: '100% 0px' });
    d.querySelectorAll('.cb[data-mermaid]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [html]);

  useEffect(() => { if (html.includes('class="katex')) void ensureKatexCss(); }, [html]);

  useEffect(() => {
    const d = doc.current; if (!d) return;
    index.current = [...d.querySelectorAll<HTMLElement>('[data-line]')].map((el) => ({ line: Number(el.dataset['line']), el })).sort((a, b) => a.line - b.line);
    setHeads([...d.querySelectorAll<HTMLElement>('h1,[data-h1],h2,h3,h4,h5,h6')].map((h) => ({ id: h.id, text: h.textContent ?? '', level: h.hasAttribute('data-h1') ? 1 : Number(h.tagName[1]), line: Number(h.dataset['line']) })));
    trackActive();
    if (restored.current) { restored.current = false; editorToPreview(); }
    if (pendingHash.current) {
      const id = pendingHash.current; pendingHash.current = '';
      const o = out.current, el = d.querySelector<HTMLElement>('#' + CSS.escape(id));
      if (o && el) { skipUntil.current = performance.now() + 500; o.scrollTo({ top: el.getBoundingClientRect().top - o.getBoundingClientRect().top + o.scrollTop - 8 }); }
    }
  }, [html]);

  /**
   * Split: khối của bản xem ứng với dòng con trỏ trong ô soạn được tô bằng MỘT phần tử phủ (không đổi gì trên nội dung bài, nên không làm style/layout của cả tài liệu).
   * Chỉ cập nhật khi đã ngừng gõ ~200 ms (đo ở tài liệu 3000 dòng: đặt thuộc tính lên khối ngay mỗi phím tốn thêm ~20 ms/phím); tìm nhị phân trong chỉ mục sẵn có.
   */
  const curBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = curBar.current; if (!bar) return;
    if (view !== 'split' || zen || !cursorMark || pvStale) { bar.hidden = true; return; }
    const id = setTimeout(() => {
      const idx = index.current;
      let lo = 0, hi = idx.length - 1, a = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (idx[mid]!.line <= pos.ln) { a = mid; lo = mid + 1; } else hi = mid - 1; }
      const el = a >= 0 ? idx[a]!.el : null, page = bar.parentElement;
      if (!el || !page || !el.isConnected) { bar.hidden = true; return; }
      const pr = page.getBoundingClientRect(), er = el.getBoundingClientRect();
      bar.style.transform = `translate(${er.left - pr.left - 16}px, ${er.top - pr.top}px)`;
      bar.style.height = `${Math.min(er.height, 96)}px`; // chỉ một vạch mảnh ở lề, cao tối đa 96px: không phủ lên chữ
      bar.hidden = false;
    }, 200);
    return () => clearTimeout(id);
  }, [pos.ln, html, view, zen, cursorMark, split, wide, docStyle, pvStale]);

  /** Thông báo ngắn ở thanh trạng thái: viết hoa toàn bộ trong mã, hiện dạng câu (từ viết tắt URL, HTML, PDF, MD giữ nguyên). */
  const say = (t: string) => { setFlash(sentence(t)); setTimeout(() => setFlash(''), 2000); };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- số đo: cỡ dòng và độ rộng ký tự lấy từ CSS, nên đổi cỡ chữ ở màn lớn vẫn khớp ----
  const measure = () => {
    const t = ta.current; if (!t || winRef.current.zen) return; // zen đổi phông và dòng cao: giữ số đo của chế độ thường
    const cs = getComputedStyle(t);
    // độ rộng ký tự đo bằng canvas: không chèn nút vào trang nên không ép reflow cả trang ở lần dựng đầu (TBT)
    const c2d = document.createElement('canvas').getContext('2d');
    let w = 0;
    if (c2d) { c2d.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; w = c2d.measureText('0'.repeat(100)).width / 100 + (parseFloat(cs.letterSpacing) || 0); }
    else {
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(100);
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing};font-variant-ligatures:none`;
      document.body.appendChild(probe);
      w = probe.getBoundingClientRect().width / 100;
      probe.remove();
    }
    const l = parseFloat(cs.lineHeight);
    if (l > 0 && w > 0) setMetrics((m) => (m.lh === l && Math.abs(m.cw - w) < 0.01 ? m : { lh: l, cw: w }));
  };
  const winRef = useRef({ zen, wrap: wrapped, lh, n: lineCount });
  winRef.current = { zen, wrap: wrapped, lh, n: lineCount };
  const updateWin = () => {
    const t = ta.current; if (!t) return;
    // zen xuống dòng mềm nên dòng N không còn nằm ở (N-1)*lh: dựng cả văn bản thay vì cửa sổ
    // đọc qua ref: handler resize đăng ký một lần ở lần dựng đầu nên closure của nó cũ (zen, lh, lineCount)
    const { wrap: z, lh: l, n } = winRef.current;
    const from = z ? 0 : Math.max(0, Math.floor((t.scrollTop - PAD) / l) - OVERSCAN);
    const to = z ? n : Math.ceil((t.scrollTop + t.clientHeight) / l) + OVERSCAN;
    setWin((w) => (w.from === from && w.to === to ? w : { from, to }));
  };
  useEffect(() => {
    document.documentElement.dataset['studio'] = 'ready'; // trang chủ `/` đang hiện khung tĩnh dựng sẵn: editor thật đã lên, ẩn khung đó đi
    document.querySelector('.studio-facade--app')?.remove(); // /app/: khung tĩnh chỉ để có nội dung ngay khi HTML tới; gỡ hẳn để không trùng selector với bản xem thật
    measure();
    document.fonts?.ready.then(measure).catch(() => undefined);
    const fit = () => { const el = root.current; if (el) el.style.setProperty('--pv-top', el.getBoundingClientRect().top + window.scrollY + 'px'); measure(); updateWin(); };
    fit();
    window.addEventListener('resize', fit);
    const id = setTimeout(fit, 300); // sau khi font nạp xong
    return () => { window.removeEventListener('resize', fit); clearTimeout(id); };
  }, []);
  useEffect(() => { updateWin(); }, [lineCount, lh, view, zen, wrapped]);
  useEffect(() => { if (!zen) measure(); }, [zen]); // ra khỏi zen: đo lại sau khi bố cục thường đã áp
  // zen: lớp tô màu phải rộng đúng bằng vùng chữ của ô soạn, nếu không hai lớp ngắt dòng lệch nhau
  useEffect(() => {
    const t = ta.current; if (!wrapped || !t) return;
    const sync = () => t.parentElement?.style.setProperty('--zw', t.clientWidth + 'px');
    sync();
    const ro = new ResizeObserver(sync); ro.observe(t);
    return () => { ro.disconnect(); t.parentElement?.style.removeProperty('--zw'); };
  }, [wrapped]);

  // ---- bản sao đang sửa (workspace): lưu IndexedDB, panel file nạp lười. Không có workspace thì mọi thứ chạy như cũ (KEYS.md là tài liệu nháp) ----
  const [wsBusy, setWsBusy] = useState<boolean>(() => getActiveId() !== null); // đang nạp workspace: khoá ô soạn để không gõ đè lên tài liệu nháp
  // lúc nạp bản sao chưa đặt tiêu đề (tên bài nháp cũ không được lộ ra tab)
  useEffect(() => { if (!document.querySelector('.home-tool') && !wsBusy) { document.title = `${fileName || 'Untitled'} · mdprev`; baseTitle.current = document.title; } }, [fileName, wsBusy]);
  const skillMode = ws !== null && ws.origin.kind === 'skill-copy'; // vault (mục 2) dùng Inspector của tài liệu; đang sửa một bản sao skill: Inspector có tab Overview · Findings · Outline
  const inspOpen = skillMode ? inspOpenSkill : inspOpenDoc;
  const inspTab = skillMode ? inspTabSkill : inspTabDoc;
  const [skillRep, setSkillRep] = useState<import('../../lib/skills/types').SkillReport | null | undefined>(undefined); // undefined = chưa quét xong (khác null = bản sao không có SKILL.md)
  // ≥900px: Aa, Inspector, Present và Export vào hai chỗ cắm ở cụm phải của header; nhóm chế độ ở lại thanh tài liệu (hàng 2) và bám đường chia ở đó
  // Export luôn nằm ở header (điện thoại cũng vậy: hành động chính phải thấy ngay, như docx-editor.dev)
  const slotsNow = () => ({ aa: matchMedia('(min-width: 900px)').matches ? document.getElementById('appbar-slot-aa') : null, ex: document.getElementById('appbar-slot-export') });
  const [slots, setSlots] = useState<{ aa: HTMLElement | null; ex: HTMLElement | null }>(slotsNow);
  useEffect(() => {
    const mq = matchMedia('(min-width: 900px)');
    const sync = () => setSlots(slotsNow());
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  // thanh trên đổi chiều cao (thanh tài liệu vào/ra, tên file dài làm nó xuống hàng): đo lại phần chừa cho editor
  useEffect(() => {
    const ab = document.querySelector('.appbar');
    if (!ab || typeof ResizeObserver === 'undefined') return;
    const refit = () => { const el = root.current; if (el) el.style.setProperty('--pv-top', el.getBoundingClientRect().top + window.scrollY + 'px'); };
    const ro = new ResizeObserver(refit); ro.observe(ab); refit();
    return () => ro.disconnect();
  }, []);
  // inspector hiển thị ở mọi độ rộng (từ 900px là panel bên phải, dưới đó là một pane thay Edit/Read) và vắng trong Zen
  const inspAvail = !zen;
  const inspHistory = !skillMode && inspOpen && inspTab === 'history' && inspAvail;
  useEffect(() => { if (inspOpen && inspAvail && !InspC) void import('./InspectorPanel').then((m) => setInspC(() => m.default)); }, [inspOpen, inspAvail, InspC]);
  const focusOutline = useRef(false);
  const lineIssue = issueAt.get(pos.ln);
  const [checkFocus, setCheckFocus] = useState<{ line: number; n: number } | null>(null);
  /** Bấm lần nữa vào chính liên kết đã mở Inspector ở tab đó thì đóng Inspector (như nút bật tắt). */
  const toggleInspTab = (t: InspectorTab, line?: number) => {
    if (inspOpen && inspTab === t && (line === undefined || checkFocus?.line === line)) { toggleInsp(); return; }
    openInspTab(t, line);
  };
  const openInspTab = (t: InspectorTab, line?: number) => {
    if (line !== undefined) setCheckFocus((c) => ({ line, n: (c?.n ?? 0) + 1 }));
    if (!inspOpen) { if (skillMode) { setInspOpenSkill(true); writeString(KEYS.inspSkill, '1'); } else { setInspOpenDoc(true); writeString(KEYS.insp, '1'); } }
    pickInspTab(t);
  };
  const [wsStale, setWsStale] = useState(false); // bản sao đang được tab khác sửa
  const [wsOpen, setWsOpen] = useState<boolean>(() => !matchMedia('(max-width: 640px)').matches);
  const [PanelC, setPanelC] = useState<ComponentType<any> | null>(null);
  const wsRef = useRef<Workspace | null>(null); wsRef.current = ws;
  const wsPathRef = useRef<string | null>(null); wsPathRef.current = wsPath;
  const wsLib = useRef<{ M: typeof import('../../lib/workspace/model'); S: typeof import('../../lib/workspace/store') } | null>(null);
  const wsStatus = useMemo(() => (ws && wsLib.current ? wsLib.current.M.statusOf(ws) : new Map()), [ws]);
  const wsErr = (e: unknown): string => {
    const c = (e as { code?: string })?.code;
    return c === 'bad-path' ? 'That path is not allowed (no empty, absolute or .. paths).' : c === 'exists' ? 'A file with that path already exists.' : c === 'too-big' ? 'This copy would exceed 10 MB.' : c === 'missing' ? 'That file is not in this copy.' : 'Could not save this copy in the browser.';
  };
  const wsCommit = (next: Workspace) => { wsRef.current = next; setWs(next); wsLib.current?.S.putWorkspace(next).catch(() => say('COULD NOT SAVE THE COPY IN THIS BROWSER')); };
  /** Ghi nội dung đang gõ vào file đang mở của workspace (gọi trước khi đổi file, đổi tên, xuất, và khi rời trang). */
  const wsFlush = () => {
    const w = wsRef.current, p = wsPathRef.current, lib = wsLib.current;
    if (!w || !p || !lib) return;
    const f = w.files.find((x) => x.path === p);
    if (!f || f.text.replace(/\r\n/g, '\n') === srcRef.current) return;
    try { wsCommit(lib.M.setText(w, p, srcRef.current, Date.now())); } catch (e) { say(wsErr(e)); }
  };
  const wsInternal = useRef(false); // true khi chính phần bản sao đang nạp nội dung vào editor
  const wsLoad = (text: string, label: string, name: string) => { wsInternal.current = true; try { load(text, label, { name, keepPrev: true, snapshot: false }); } finally { wsInternal.current = false; } };
  const wsOpenFile = (w: Workspace, path: string) => {
    const f = w.files.find((x) => x.path === path);
    if (!f) return;
    wsPathRef.current = path; setWsPath(path);
    wsLoad(f.text, 'OPENED ' + path, path);
    if (matchMedia('(max-width: 640px)').matches) setWsOpen(false);
  };
  const wsEnter = async (id: string) => {
    try {
      const [M, S, P, I] = await Promise.all([import('../../lib/workspace/model'), import('../../lib/workspace/store'), import('./WorkspacePanel'), import('./InspectorPanel')]);
      const w = await S.getWorkspace(id);
      if (!w) { setActiveId(null); wsBusyRef.current = false; setWsBusy(false); return; }
      wsLib.current = { M, S }; wsRef.current = w; wsOnRef.current = true;
      // một bản sao chỉ một tab được sửa (ghi cả bản ghi, tab sau sẽ đè tab trước); tab thứ hai chỉ đọc
      const locks = navigator.locks;
      if (locks) void locks.request('mdprev-ws-' + id, { ifAvailable: true }, (lock) => (lock ? new Promise<void>(() => undefined) : (setWsStale(true), undefined)));
      setPanelC(() => P.default); setInspC((c: ComponentType<any> | null) => c ?? (I.default as ComponentType<any>)); setWs(w);
      const first = w.files.find((f) => /(^|\/)SKILL\.md$/i.test(f.path)) ?? w.files.find((f) => /\.md$/i.test(f.path)) ?? w.files[0];
      if (first) wsOpenFile(w, first.path); else { wsPathRef.current = null; wsLoad('', 'EMPTY COPY', w.name); }
    } catch { setActiveId(null); say('COULD NOT OPEN THE COPY'); }
    wsBusyRef.current = false; setWsBusy(false);
  };
  const wsOnRef = useRef(false); // đặt bằng lệnh ở wsEnter / wsCloseCopy, không suy ra từ state mỗi lần dựng
  useEffect(() => {
    const id = getActiveId();
    if (id) void wsEnter(id);
    const onStorage = (ev: StorageEvent) => { if (ev.key === ACTIVE_KEY && ev.newValue !== ev.oldValue) { wsFlush(); setWsStale(true); say('THE OPEN COPY CHANGED IN ANOTHER TAB, RELOAD TO CONTINUE'); } };
    const leave = () => wsFlush();
    window.addEventListener('pagehide', leave); window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('pagehide', leave); window.removeEventListener('storage', onStorage); };
  }, []);
  useEffect(() => { // gõ trong một file của bản sao: lưu sau 400 ms
    if (!ws || !wsPath) return;
    const f = ws.files.find((x) => x.path === wsPath);
    if (!f || f.text.replace(/\r\n/g, '\n') === src) return;
    const id = setTimeout(wsFlush, 400);
    return () => clearTimeout(id);
  }, [src, wsPath]);
  const wsCloseCopy = () => {
    const id = wsRef.current?.id, imgs = (wsRef.current?.images ?? []).map((i) => i.id);
    setActiveId(null);
    if (id) wsLib.current?.S.deleteWorkspace(id).then(() => import('../../lib/vault/release')).then((m) => m.releaseImages(imgs, [readString(KEYS.md) ?? '', readString(KEYS.mdPrev) ?? ''])).catch(() => undefined); // ảnh của vault: xoá nếu không còn ai dùng
    wsRef.current = null; wsOnRef.current = false; setWs(null); setWsPath(null);
    const nm = readString(KEYS.mdName);
    load(readString(KEYS.md) ?? '', 'CLOSED THE COPY', nm ? { name: nm, keepPrev: true, snapshot: false } : { keepPrev: true, snapshot: false });
  };
  useEffect(() => { // báo cáo skill của bản sao: dựng lại sau 350 ms ngừng gõ, lõi Inspector nạp muộn (không nằm trong chunk lõi)
    if (!ws || ws.origin.kind !== 'skill-copy') { setSkillRep(undefined); return; }
    let dead = false;
    const id = setTimeout(() => { void import('../../lib/workspace/inspect').then((m) => { const w = wsRef.current; if (!dead && w) setSkillRep(m.inspectWorkspace(w, wsPathRef.current, srcRef.current)); }); }, skillRep === undefined ? 0 : 350);
    return () => { dead = true; clearTimeout(id); };
  }, [ws, wsPath, src]);
  /** Sửa nhanh từ Overview: SKILL.md chưa có khối frontmatter thì thêm khung name/description ở đầu file, con trỏ ở sau `description: `. */
  const fixFrontmatter = () => {
    const t = ta.current; if (!t || !wsPathRef.current || !/(^|\/)SKILL\.md$/i.test(wsPathRef.current)) return;
    if (t.value.trimStart().startsWith('---')) { goToLine(1); say('FRONTMATTER EXISTS BUT IS NOT VALID, CHECK THE FIRST LINES'); return; }
    const dir = skillRep?.dir ? skillRep.dir.slice(skillRep.dir.lastIndexOf('/') + 1) : (wsRef.current?.name ?? 'my-skill');
    const nm = dir.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'my-skill';
    const head = `---\nname: ${nm}\ndescription: \n---\n\n`;
    const pos = head.indexOf('description: ') + 'description: '.length;
    commit({ text: head + t.value, start: pos, end: pos });
    say('ADDED FRONTMATTER: WRITE WHAT THE SKILL DOES AND WHEN TO USE IT');
  };
  /** Properties: viết lại một khoá một dòng của front matter (một bước undo). Danh sách dạng khối và object chỉ đọc. */
  const editProp = (k: string, v: string) => {
    const t = ta.current; if (!t) return;
    const m = /^---\n([\s\S]*?)\n---/.exec(t.value); if (!m) return;
    const lines = (m[1] ?? '').split('\n');
    const i = lines.findIndex((l) => l.startsWith(k + ':'));
    if (i < 0 || /^[ \t-]/.test(lines[i + 1] ?? '')) { say('THIS PROPERTY IS EDITED IN THE TEXT'); return; }
    const val = v.trim();
    const list = /^(tags|keywords|categories)$/.test(k) && val.includes(',');
    const out = list ? `[${val.split(',').map((x) => x.trim()).filter(Boolean).join(', ')}]` : /^[\s]|[:#\[\]{},&*!|>'"%@`]|\s$/.test(val) ? JSON.stringify(val) : val;
    if (lines[i] === `${k}: ${out}`) return;
    lines[i] = `${k}: ${out}`;
    const text = t.value.slice(0, 4) + lines.join('\n') + t.value.slice(4 + (m[1] ?? '').length);
    const c = Math.min(t.selectionStart, text.length);
    commit({ text, start: c, end: c });
    say('UPDATED ' + k.toUpperCase());
  };
  const installApp = () => { const ev = (window as unknown as { __mdInstall?: { prompt: () => void } }).__mdInstall; if (ev) { ev.prompt(); return; } say(matchMedia('(display-mode: standalone)').matches ? 'ALREADY INSTALLED AS AN APP' : 'INSTALL: BROWSER MENU → INSTALL APP, OR SHARE → ADD TO HOME SCREEN'); };
  const pendingLine = useRef(0);
  const openFinding = (file: string | undefined, line: number | undefined) => {
    const w = wsRef.current; if (!w) return;
    if (file && file !== wsPathRef.current && w.files.some((f) => f.path === file)) { wsFlush(); pendingLine.current = line ?? 0; wsOpenFile(w, file); }
    else if (line && (!file || file === wsPathRef.current)) goToLine(line);
  };
  useEffect(() => { const l = pendingLine.current; if (!l) return; pendingLine.current = 0; setTimeout(() => goToLine(l), 0); }, [wsPath]);
  const fileInfo = useMemo(() => new Map((skillRep?.files ?? []).map((f) => [f.path, { tokens: f.tokens, flags: f.flags }])), [skillRep]);
  const panelProps = () => ({
    ws: ws!, path: wsPath, status: wsStatus, info: fileInfo,
    onOpen: (p: string) => { wsFlush(); const w = wsRef.current; if (w) wsOpenFile(w, p); },
    onAdd: (p: string) => {
      wsFlush(); const lib = wsLib.current, w = wsRef.current; if (!lib || !w) return 'Not ready yet.';
      try { const next = lib.M.addFile(w, p, '', Date.now()); wsCommit(next); const np = next.files.find((f) => !w.files.some((o) => o.path === f.path))?.path; if (np) wsOpenFile(next, np); return null; } catch (e) { return wsErr(e); }
    },
    onRename: (from: string, to: string) => {
      wsFlush(); const lib = wsLib.current, w = wsRef.current; if (!lib || !w) return 'Not ready yet.';
      try {
        const next = lib.M.renameFile(w, from, to, Date.now()); wsCommit(next);
        const np = next.files.find((f) => !w.files.some((o) => o.path === f.path))?.path;
        if (np && from === wsPathRef.current) { wsPathRef.current = np; setWsPath(np); setCustom(np); }
        return null;
      } catch (e) { return wsErr(e); }
    },
    onRemove: (p: string) => {
      wsFlush(); const lib = wsLib.current, w = wsRef.current; if (!lib || !w) return;
      try {
        const next = lib.M.removeFile(w, p, Date.now()); wsCommit(next);
        if (p === wsPathRef.current) { const n = next.files[0]; if (n) wsOpenFile(next, n.path); else { wsPathRef.current = null; setWsPath(null); wsLoad('', 'DELETED', next.name); } }
      } catch (e) { say(wsErr(e)); }
    },
    onRestore: (p: string) => { const lib = wsLib.current, w = wsRef.current; if (!lib || !w) return; try { wsCommit(lib.M.restoreFile(w, p, Date.now())); } catch (e) { say(wsErr(e)); } },
    onZip: () => {
      wsFlush(); const lib = wsLib.current, w = wsRef.current; if (!lib || !w) return;
      const bytes = lib.M.toZip(w, w.name);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' })); a.download = w.name + '.zip';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); say('DOWNLOADED ' + w.name + '.zip');
    },
    onDiff: (p: string) => { wsFlush(); const w = wsRef.current; const f = w?.files.find((x) => x.path === p); return { a: w?.base[p] ?? '', b: f?.text ?? '' }; },
    onClose: () => setWsOpen(false), onCloseWs: wsCloseCopy,
    onSite: ws?.origin.kind === 'vault' ? siteDialog : undefined,
  });
  /** Vault (mục 2): mở thư mục/zip Markdown thành workspace rồi tải lại /app/ như "Edit a copy". Ô chọn file tạo động: không thêm input[type=file] vào DOM. */
  const openVault = (dir: boolean) => {
    setMenu('');
    const i = document.createElement('input');
    i.type = 'file';
    if (dir) i.setAttribute('webkitdirectory', ''); else i.accept = '.zip,application/zip';
    i.onchange = () => {
      const l = i.files; if (!l || !l.length) return;
      say('READING THE VAULT…');
      wsFlush();
      void import('../../lib/vault/open').then((m) => m.openVault(dir ? { files: [...l] } : { zip: l[0]! }))
        .then((id) => { setActiveId(id); location.assign(url('/app/')); })
        .catch((e: unknown) => say(((e as Error)?.message || 'Could not read that vault').toUpperCase()));
    };
    i.click();
  };
  /** Xuất site tĩnh: hộp thoại nạp lười kiểm link hỏng trước, rồi dựng zip. */
  function siteDialog() {
    wsFlush();
    const w = wsRef.current; if (!w) return;
    setXd({ k: 'site', p: { name: w.name, notes: w.files.map((f) => ({ path: f.path, text: f.text })), images: w.images ?? [], onGoto: (file: string, line: number) => { setXd(null); openFinding(file, line); } } });
  }

  // ---- ô soạn ----
  const lineStart = (ln: number) => { let off = 0; for (let i = 1; i < ln; i++) { const n = src.indexOf('\n', off); if (n === -1) return src.length; off = n + 1; } return off; };
  /**
   * Xuống dòng: dòng N không còn nằm ở (N-1)*lh mà ở đỉnh phần tử `.l` thứ N của lớp tô màu (đã dựng đủ khi xuống dòng).
   * `yOfLine` nhận số dòng 1-based có thể lẻ, trả toạ độ nội dung của ô soạn; `lineAtY` là hàm ngược.
   */
  const hlKids = (): ArrayLike<Element> | null => (winRef.current.wrap ? ta.current?.parentElement?.querySelectorAll('.ed-hl .l') ?? null : null);
  const yOfLine = (line: number): number => {
    const k = hlKids();
    if (!k || !k.length) return PAD + (line - 1) * lh;
    const i = Math.max(0, Math.min(k.length - 1, Math.floor(line) - 1));
    const a = k[i] as HTMLElement, b = k[i + 1] as HTMLElement | undefined;
    const h = (b ? b.offsetTop : a.offsetTop + a.offsetHeight) - a.offsetTop;
    return PAD + a.offsetTop + (line - 1 - i) * h;
  };
  const lineAtY = (y: number): number => {
    const k = hlKids();
    if (!k || !k.length) return (y - PAD) / lh + 1;
    const r = y - PAD;
    let lo = 0, hi = k.length - 1, i = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if ((k[m] as HTMLElement).offsetTop <= r) { i = m; lo = m + 1; } else hi = m - 1; }
    const a = k[i] as HTMLElement, b = k[i + 1] as HTMLElement | undefined;
    const h = (b ? b.offsetTop : a.offsetTop + a.offsetHeight) - a.offsetTop;
    return i + 1 + (h > 0 ? Math.max(0, Math.min(1, (r - a.offsetTop) / h)) : 0);
  };
  // xuống dòng: vạch dòng hiện tại cao bằng cả dòng (nhiều hàng hiển thị), lấy từ chính phần tử `.l`
  const [curBox, setCurBox] = useState<{ top: number; h: number } | null>(null);
  useEffect(() => {
    if (!wrapped || zen) { setCurBox(null); return; }
    const el = ta.current?.parentElement?.querySelectorAll('.ed-hl .l')[pos.ln - 1] as HTMLElement | undefined;
    const base = (el?.offsetParent as HTMLElement | null)?.offsetTop ?? 0; // `.l` đã nằm trong phần đệm của `.ed-hl` (offsetTop của nó gồm cả PAD); chỉ cộng độ lệch của chính `.ed-hl` (cửa sổ ảo), không cộng PAD lần nữa
    if (el) setCurBox((o) => (o && o.top === base + el.offsetTop && o.h === el.offsetHeight ? o : { top: base + el.offsetTop, h: el.offsetHeight }));
  }, [pos.ln, src, wrapped, zen, hlChunks, view]);
  // hàng phím: ghim ngay trên bàn phím ảo bằng visualViewport (iOS không co layout viewport khi bàn phím mở)
  const phoneKeys = focused && !zen && view !== 'pv' && matchMedia('(max-width: 640px), (pointer: coarse) and (max-height: 500px)').matches;
  const [vvBottom, setVvBottom] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!phoneKeys || !vv) { setVvBottom(null); return; }
    const sync = () => setVvBottom(vv.offsetTop + vv.height);
    sync(); vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync);
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
  }, [phoneKeys]);
  const layers = () => {
    const t = ta.current; if (!t) return;
    if (inner.current) inner.current.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
    if (gut.current) gut.current.scrollTop = t.scrollTop;
    cancelAnimationFrame(winRaf.current);
    winRaf.current = requestAnimationFrame(updateWin);
  };
  const relTop = (el: HTMLElement, o: HTMLElement) => el.getBoundingClientRect().top - o.getBoundingClientRect().top + o.scrollTop;

  /** Editor cuộn thì kéo bản xem theo: tìm khối ở dòng đầu đang thấy, nội suy tới khối kế tiếp. */
  const editorToPreview = () => {
    const t = ta.current, o = out.current; if (!t || !o || view !== 'split' || !syncOn) return;
    const now = performance.now();
    if (now < skipUntil.current || (drive.current.by === 'pv' && now - drive.current.t < 150)) return;
    const idx = index.current; if (!idx.length) return;
    const top = lineAtY(t.scrollTop);
    let a = -1;
    for (let i = 0; i < idx.length; i++) { if (idx[i]!.line <= top) a = i; else break; }
    drive.current = { by: 'ed', t: now };
    if (a < 0) { o.scrollTop = 0; return; }
    const A = idx[a]!;
    const B = idx.slice(a + 1).find((x) => x.line > A.line);
    const ta0 = relTop(A.el, o);
    const tb = B ? relTop(B.el, o) : ta0 + A.el.offsetHeight;
    const frac = B ? Math.min(1, Math.max(0, (top - A.line) / (B.line - A.line))) : 0;
    o.scrollTop = ta0 + frac * (tb - ta0) - 16;
  };
  /** Bản xem cuộn tay thì kéo editor theo (chiều ngược lại), có chốt để hai bên không kéo nhau vòng tròn. */
  const previewToEditor = () => {
    const t = ta.current, o = out.current; if (!t || !o || view !== 'split' || !syncOn) return;
    const now = performance.now();
    if (now < skipUntil.current || (drive.current.by === 'ed' && now - drive.current.t < 150)) return;
    const idx = index.current; if (!idx.length) return;
    const probe = o.scrollTop + 16;
    let lo = 0, hi = idx.length - 1, a = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (relTop(idx[mid]!.el, o) <= probe) { a = mid; lo = mid + 1; } else hi = mid - 1; }
    drive.current = { by: 'pv', t: now };
    if (a < 0) { t.scrollTop = 0; return; }
    const A = idx[a]!;
    const B = idx.slice(a + 1).find((x) => x.line > A.line);
    const ta0 = relTop(A.el, o);
    const tb = B ? relTop(B.el, o) : ta0 + A.el.offsetHeight;
    const frac = B && tb > ta0 ? Math.min(1, Math.max(0, (probe - ta0) / (tb - ta0))) : 0;
    const line = A.line + (B ? frac * (B.line - A.line) : 0);
    t.scrollTop = Math.max(0, yOfLine(line) - PAD);
  };
  useEffect(() => { if (syncOn && view === 'split') editorToPreview(); }, [syncOn]);
  const onEdScroll = () => {
    if (zSel || sel) setZTick((n) => n + 1);
    layers(); editorToPreview();
    const t = ta.current; if (!t) return;
    const now = performance.now();
    if (now - popT.current > 50) { popT.current = now; popChan.current?.postMessage({ t: 'scroll', line: lineAtY(t.scrollTop) } satisfies PopMsg); }
    scheduleUi();
  };

  /** Áp một sửa đổi qua lịch sử undo gốc của trình duyệt: chỉ thay đoạn khác nhau bằng `insertText`. */
  /** Undo/redo bằng lịch sử gốc của ô soạn (commit đi qua execCommand nên cùng một ngăn xếp với Ctrl+Z). */
  const qce = (c: string) => { try { return document.queryCommandEnabled(c); } catch { return true; } };
  const canUndo = src !== hist.current.loaded && qce('undo');
  const canRedo = hist.current.redo && qce('redo');
  const stepHistory = (redo: boolean) => { const t = ta.current; if (!t) return; t.focus(); try { document.execCommand(redo ? 'redo' : 'undo'); } catch { /* bỏ qua */ } };
  const commit = (r: Edit) => {
    const t = ta.current; if (!t) return;
    const old = t.value;
    inCommit.current = true;
    t.focus();
    if (old !== r.text) {
      const d = diffSpan(old, r.text);
      t.setSelectionRange(d.from, d.aEnd);
      const rep = r.text.slice(d.from, d.bEnd);
      let ok = false;
      try { ok = rep === '' ? document.execCommand('delete') : document.execCommand('insertText', false, rep); } catch { /* dùng phương án dự phòng */ }
      if (!ok || t.value !== r.text) t.value = r.text;
      lastInput.current = performance.now();
      setSrc(t.value);
    }
    t.setSelectionRange(r.start, r.end);
    inCommit.current = false;
    caret();
  };
  const apply = (fn: Fn) => { const t = ta.current; if (t) commit(fn(t.value, t.selectionStart, t.selectionEnd)); };

  function caret() {
    const t = ta.current; if (!t || inCommit.current) return;
    if (zrRef.current && !zenEnter.current) return; // mặt Read của Zen: ô soạn ẩn, blur/selectionchange (WebKit đặt lại vùng chọn về 0) không được ghi đè vị trí con trỏ đã lưu
    const p = t.selectionStart;
    // rời khỏi một bảng chưa căn thì căn lại (một bước undo riêng, không làm khi đang gõ)
    const cur = tableRangeAt(t.value, p);
    const prev = prevTable.current;
    prevTable.current = cur;
    if (prev && (!cur || cur[0] !== prev[0]) && performance.now() - lastInput.current > 300) {
      const r = alignTableAt(t.value, prev[0]);
      if (r) {
        const adj = (x: number) => (x >= r.endOffset ? x + r.delta : x);
        commit({ text: r.text, start: adj(p), end: adj(t.selectionEnd) });
        return;
      }
    }
    const before = t.value.slice(0, p);
    const ln = lineOf(t.value, p);
    const col = p - before.lastIndexOf('\n');
    savedSel.current = { s: p, e: t.selectionEnd };
    setPos((o) => (o.ln === ln && o.col === col ? o : { ln, col }));
    const se = t.selectionEnd;
    setZSel((o) => (zen && se !== p ? (o && o.s === p && o.e === se ? o : { s: p, e: se }) : o === null ? o : null));
    setSel((o) => (!zen && se !== p ? (o && o.s === p && o.e === se ? o : { s: p, e: se }) : o === null ? o : null));
    if (zen) {
      // typewriter theo dải: chỉ cuộn khi con trỏ rời vùng giữa (38–62% khung), cuộn mượt; lúc mới vào zen thì đặt thẳng vào giữa
      const y = caretY(t, p), vh = t.clientHeight, mode = twRef.current;
      const f = mode === 'third' ? 0.36 : 0.5; // Center: giữa khung; Third: 1/3 trên; Free: không tự cuộn (trừ lúc vừa vào zen)
      if (zenEnter.current || (mode !== 'free' && (y < t.scrollTop + vh * (f - 0.12) || y > t.scrollTop + vh * (f + 0.12)))) {
        t.scrollTo({ top: Math.max(0, y - vh * f), behavior: zenEnter.current || reduced() ? 'auto' : 'smooth' });
      }
    }
  }

  /**
   * Hộp (x, đỉnh dòng hiển thị, cao dòng) của vị trí p trong ô soạn khi xuống dòng mềm, theo toạ độ nội dung của ô (chưa trừ scrollTop).
   * Nhanh: lớp tô màu đã dựng đủ số dòng thì lấy đỉnh dòng từ chính nó, chỉ dựng gương cho phần xuống dòng của riêng dòng này.
   * Chậm (lớp tô màu chưa kịp cập nhật, ví dụ vừa xuống dòng): gương cả văn bản.
   */
  function caretBox(t: HTMLTextAreaElement, p: number): { x: number; top: number; h: number } {
    const cs = getComputedStyle(t);
    const hl = t.parentElement?.querySelector<HTMLElement>('.ed-hl');
    let nl = 1; for (let i = t.value.indexOf('\n'); i !== -1; i = t.value.indexOf('\n', i + 1)) nl++;
    const ln = lineOf(t.value, p);
    const kids = hl?.querySelectorAll('.l');
    const el = kids && kids.length === nl ? (kids[ln - 1] as HTMLElement | undefined) : undefined;
    const ls = el && p > 0 ? t.value.lastIndexOf('\n', p - 1) + 1 : 0;
    const m = document.createElement('div');
    m.style.cssText = `position:fixed;left:-9999px;top:0;visibility:hidden;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;width:${t.clientWidth}px;padding:${el ? `0 ${cs.paddingRight} 0 ${cs.paddingLeft}` : cs.padding};font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing};font-kerning:${cs.fontKerning};font-variant-ligatures:${cs.fontVariantLigatures};font-feature-settings:${cs.fontFeatureSettings};tab-size:${cs.tabSize}`;
    m.textContent = t.value.slice(ls, p);
    const mark = document.createElement('span');
    mark.textContent = '\u200b';
    m.appendChild(mark);
    document.body.appendChild(m);
    const box = { x: mark.offsetLeft, top: (el ? el.offsetTop : 0) + mark.offsetTop, h: mark.offsetHeight };
    m.remove();
    return box;
  }
  /** Toạ độ y giữa dòng hiển thị của p (căn typewriter). */
  function caretY(t: HTMLTextAreaElement, p: number): number {
    const b = caretBox(t, p);
    return b.top + b.h / 2;
  }

  type PopItem = { id: string; label: string; hint: string; s?: SlashItem; c?: CompItem };
  const slashItems = useMemo<PopItem[]>(() => {
    if (!slash) return [];
    if (slash.kind === 'slash') return filterSlash(slash.q).map((s) => ({ id: s.id, label: s.label, hint: s.hint, s }));
    return slash.at ? completionItems(slash.at, { heads, text: src, assets: assetList }).map((c) => ({ id: c.id, label: c.label, hint: c.hint, c })) : [];
  }, [slash?.kind, slash?.q, slash?.start, heads, assetList, slash?.kind === 'footnote' ? src : '']);
  const pickSlash = (it: PopItem | undefined) => {
    const t = ta.current, sl = slashRef.current; if (!t || !sl || !it) { setSlash(null); return; }
    setSlash(null);
    if (it.s) commit(applySlash(t.value, sl.start, t.selectionStart, it.s));
    else if (it.c && sl.at) commit(applyCompletion(t.value, { ...sl.at, start: sl.start }, t.selectionStart, it.c, altFromName));
  };
  /** Sau mỗi lần gõ: đang ở `/chữ` đầu dòng thì mở hoặc lọc menu, không thì đóng. */
  const syncSlash = () => {
    const t = ta.current; if (!t) return;
    const p = t.selectionStart, one = p === t.selectionEnd;
    const sl = one ? slashAt(t.value, p) : null;
    const cp = one && !sl ? completionAt(t.value, p) : null;
    const next = sl ? { kind: 'slash' as const, start: sl.start, q: sl.q } : cp ? { kind: cp.kind, start: cp.start, q: cp.q, at: cp } : null;
    setSlash((o) => (next ? { ...next, sel: o && o.kind === next.kind && o.start === next.start && o.q === next.q ? o.sel : 0 } : null));
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.isComposing || ev.keyCode === 229) return; // đang gõ tiếng Việt (IME)
    const t = ev.target as HTMLTextAreaElement;
    const mod = ev.metaKey || ev.ctrlKey;
    const sl = slashRef.current;
    if (sl) { // menu `/` đang mở: phím điều hướng thuộc về menu
      const n = slashItems.length;
      if (ev.key === 'Escape') { setSlash(null); if (n) { ev.preventDefault(); ev.stopPropagation(); return; } } // menu trống thì Esc chạy như thường
      if (n && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) { ev.preventDefault(); setSlash({ ...sl, sel: (sl.sel + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n }); return; }
      if (n && (ev.key === 'Enter' || ev.key === 'Tab') && !mod && !ev.shiftKey) { ev.preventDefault(); pickSlash(slashItems[Math.min(sl.sel, n - 1)]); return; }
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(ev.key)) setSlash(null); // con trỏ rời chỗ gõ: đóng gợi ý
    }
    if (ev.key === 'Escape') { t.blur(); return; }
    const s0 = t.selectionStart, e0 = t.selectionEnd;
    // thao tác dòng kiểu IDE
    if (ev.altKey && !mod && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      ev.preventDefault();
      const dir = ev.key === 'ArrowUp' ? -1 : 1;
      const r = ev.shiftKey ? duplicateLines(t.value, s0, e0, dir) : moveLines(t.value, s0, e0, dir);
      if (r) commit(r);
      return;
    }
    if (ev.altKey && !mod && !ev.shiftKey && ev.code === 'KeyP') { ev.preventDefault(); present(true); return; }
    if (mod && !ev.altKey) {
      const k = ev.key.toLowerCase();
      if (ev.shiftKey && k === 'k') { ev.preventDefault(); commit(deleteLines(t.value, s0, e0)); return; }
      if (!ev.shiftKey && k === 'l') { ev.preventDefault(); commit(selectLines(t.value, s0, e0)); return; }
      if (!ev.shiftKey && k === 'd') { ev.preventDefault(); const r = selectNext(t.value, s0, e0); if (r) { commit(r); revealSel(); } return; }
    }
    if (mod && ev.shiftKey && ev.key.toLowerCase() === 'v') { plainNext.current = true; setTimeout(() => { plainNext.current = false; }, 600); return; } // dán chữ thường: không chuyển HTML
    if (mod && !ev.shiftKey && !ev.altKey) {
      const id = BY_KEY[ev.key.toLowerCase()];
      if (id) { ev.preventDefault(); apply(TOOLS[id]!.run); return; }
    }
    if (mod || ev.altKey) return;
    const s = t.selectionStart, e = t.selectionEnd;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      const r = tableEnter(t.value, s, e) ?? smartEnter(t.value, s, e);
      if (r) { ev.preventDefault(); commit(r); }
      return;
    }
    if (ev.key === 'Tab') {
      const dir = ev.shiftKey ? -1 : 1;
      const m = moveCell(t.value, s, dir);
      if (m) { ev.preventDefault(); commit(m); return; }
      const ind = indentLines(t.value, s, e, dir);
      if (ind) { ev.preventDefault(); commit(ind); return; }
      if (!ev.shiftKey) { ev.preventDefault(); commit({ text: t.value.slice(0, s) + '  ' + t.value.slice(e), start: s + 2, end: s + 2 }); }
      return;
    }
    if (ev.key === ' ') { const c = collapseMarker(t.value, s, e); if (c) { ev.preventDefault(); commit(c); return; } }
    if (ev.key.length === 1) {
      const r = wrapKey(t.value, s, e, ev.key);
      if (r) { ev.preventDefault(); commit(r); }
    }
  };
  /** Ảnh dán/thả: lưu vào IndexedDB, chèn `![tên](asset:id)` tại vùng chọn hiện tại (một dòng mỗi ảnh). */
  const insertImages = (files: File[]) => {
    const ok = files.filter(isImage);
    if (!ok.length) { say(files.some((f) => f.type.startsWith('image/')) ? 'IMAGE TOO LARGE OR UNSUPPORTED (8 MB MAX)' : 'NOT AN IMAGE'); return; }
    void Promise.all(ok.map(async (f) => { const id = await putAsset(f, f.name); return id ? `![${altFromName(f.name)}](asset:${id})` : null; })).then((mds) => {
      const t = ta.current; if (!t) return;
      const got = mds.filter((x): x is string => !!x);
      if (!got.length) { say('COULD NOT STORE IMAGE'); return; }
      const s = t.selectionStart, e = t.selectionEnd;
      const ls = t.value.lastIndexOf('\n', s - 1) + 1;
      const pre = s > ls ? '\n' : ''; // giữa dòng thì xuống dòng trước cho ảnh đứng riêng
      const ins = pre + got.join('\n');
      commit({ text: t.value.slice(0, s) + ins + t.value.slice(e), start: s + ins.length, end: s + ins.length });
      say(got.length > 1 ? `ADDED ${got.length} IMAGES` : 'ADDED IMAGE · stored in this browser');
      refreshAssets();
    });
  };
  const onPaste = (ev: ClipboardEvent) => {
    const t = ta.current, cd = ev.clipboardData; if (!t || !cd) return;
    const files = [...(cd.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { ev.preventDefault(); insertImages(files); return; } // ảnh chép từ trang web cũng kèm text/html: xét ảnh trước
    const text = cd.getData('text/plain'), htmlData = cd.getData('text/html');
    const s = t.selectionStart, e = t.selectionEnd;
    if (e > s && /^https?:\/\/\S+$/.test(text.trim())) { ev.preventDefault(); commit(linkTo(t.value, s, e, text.trim())); return; }
    let rows: string[][] | null = null;
    if (/<table[\s>]/i.test(htmlData)) {
      const d = new DOMParser().parseFromString(htmlData, 'text/html');
      rows = [...d.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()));
      if (!rows.length || Math.max(...rows.map((r) => r.length)) < 2) rows = null;
    }
    rows ??= tsvToRows(text);
    if (rows) { ev.preventDefault(); commit(insertTable(t.value, s, e, rows)); return; }
    // HTML có cấu trúc (từ trang web, Docs, Notion) → Markdown. Mọi bước cần clipboard phải xong trước khi await.
    if (plainNext.current || !htmlData) return;
    const doc = cleanClipboardHtml(htmlData);
    if (!doc) return;
    ev.preventDefault();
    const before = t.value;
    void (async () => {
      let md: string | null = null;
      try { md = await htmlToMarkdown(doc); } catch { /* không nạp được: dán chữ thường */ }
      const cur = ta.current; if (!cur) return;
      const same = cur.value === before;
      const ss = same ? s : cur.selectionStart, ee = same ? e : cur.selectionEnd;
      const ins = md ?? text;
      if (!ins) return;
      commit({ text: cur.value.slice(0, ss) + ins + cur.value.slice(ee), start: ss + ins.length, end: ss + ins.length });
      say(md ? 'PASTED AS MARKDOWN' : 'PASTED');
    })();
  };

  const goToLine = (line: number, center = 0.35, focus = true) => {
    const t = ta.current; if (!t) return;
    const off = lineStart(line);
    skipUntil.current = performance.now() + 250;
    if (focus) t.focus();
    t.setSelectionRange(off, off);
    t.scrollTop = Math.max(0, yOfLine(line) - t.clientHeight * center);
    layers(); caret();
  };

  /** Cuộn ô soạn cho vùng chọn hiện ra (sau Ctrl/⌘+D nhảy tới lần xuất hiện ở xa). */
  function revealSel() {
    const t = ta.current; if (!t) return;
    const top = zen ? caretY(t, t.selectionStart) - lh / 2 : yOfLine(lineOf(t.value, t.selectionStart));
    if (top < t.scrollTop + lh || top > t.scrollTop + t.clientHeight - 2 * lh) t.scrollTop = Math.max(0, top - t.clientHeight * 0.35);
    layers();
  }
  const pendingPresent = useRef<boolean | null>(null);
  useEffect(() => {
    if (busy || !pendingPresent.current) return;
    pendingPresent.current = null;
    const t = ta.current;
    const start = slideAtLine(splitSlides(html), t ? lineOf(t.value, t.selectionStart) : pos.ln);
    setSlides((sl) => (sl && sl.start !== start ? { start, k: Date.now() } : sl));
  }, [busy, html]);
  /** Trình chiếu từ đầu, hoặc từ slide chứa dòng đang soạn. */
  const slidesOpener = useRef<HTMLElement | null>(null);
  const closeSlides = () => { setSlides(null); setTimeout(() => { const o = slidesOpener.current; slidesOpener.current = null; if (o && o.isConnected && o !== document.body) o.focus({ preventScroll: true }); }, 0); }; // Esc ở trình chiếu: trả focus về phần tử đã mở nó (nút Present, ô soạn...); mở từ body (phím S) thì giữ nguyên để S mở lại được
  function present(here: boolean) {
    slidesOpener.current = document.activeElement as HTMLElement | null;
    setMenu(''); setSlash(null); wantAllMermaid(); // slide cần đủ sơ đồ
    const t = ta.current; // đọc thẳng từ ô soạn: Ln/Col (pos) cập nhật qua selectionchange nên có thể trễ một nhịp
    setSlides({ start: here ? slideAtLine(splitSlides(html), t ? lineOf(t.value, t.selectionStart) : pos.ln) : 0, k: Date.now() });
    if (here && busy) pendingPresent.current = true; // bản xem chưa dựng xong lần gõ mới nhất: mở ngay, tính lại slide bắt đầu khi HTML mới có
  }
  /** Ctrl/⌘+click lên liên kết trong ô soạn: `#anchor` nhảy tới heading, URL mở tab mới, `.md` tương đối mở trong studio. */
  const followLink = (p: number) => {
    const t = ta.current; if (!t) return false;
    const hit = linkAt(t.value, p);
    if (!hit) return false;
    if (hit.kind === 'anchor') {
      const h = heads.find((x) => x.id === hit.id);
      if (h) goToLine(h.line); else say(`NO HEADING #${hit.id}`);
    } else if (hit.kind === 'url') window.open(hit.url, '_blank', 'noopener,noreferrer');
    else {
      const b = baseRef.current;
      const r = b ? resolveLink(hit.href, b) : null;
      if (!r) say('NO SOURCE URL · use File, Open URL');
      else if (r.md) void openRemote(r.md, { push: true });
      else window.open(r.href, '_blank', 'noopener,noreferrer');
    }
    return true;
  };
  const onEdClick = (ev: MouseEvent) => {
    caret();
    setSlash(null);
    const t = ta.current;
    if (t && (ev.metaKey || ev.ctrlKey) && followLink(t.selectionStart)) ev.preventDefault(); // WebKit có thể chọn cả từ khi ⌘+click: chỉ cần vị trí đầu
  };

  // ---- bản xem ----
  function trackActive() {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const o = out.current, d = doc.current; if (!o || !d) return;
      const base = o.getBoundingClientRect().top + 24;
      let cur = '';
      for (const h of d.querySelectorAll<HTMLElement>('h1,[data-h1],h2,h3,h4,h5,h6')) { if (h.getBoundingClientRect().top <= base) cur = h.id; else break; }
      setActive(cur);
    });
  }
  const onPvScroll = () => { trackActive(); previewToEditor(); };
  const onPreviewClick = (ev: MouseEvent) => {
    const el = ev.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.closest('.task-list-item')) { // checkbox của task list: bấm để đổi [ ] ↔ [x] ngay trong nguồn
      ev.preventDefault();
      const ln = Number(el.closest<HTMLElement>('li[data-line]')?.dataset['line']), t = ta.current;
      if (!ln || !t) return;
      const lines = t.value.split('\n'), cur = lines[ln - 1] ?? '';
      const nx = cur.replace(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/, (_m, a1: string, c: string, z: string) => a1 + (c === ' ' ? 'x' : ' ') + z);
      if (nx === cur) return;
      lines[ln - 1] = nx;
      commit({ text: lines.join('\n'), start: t.selectionStart, end: t.selectionEnd });
      return;
    }
    const btn = el.closest('.cb-copy');
    if (btn) { const code = btn.closest('.cb')?.querySelector('pre')?.textContent ?? ''; copyText(code).then((k) => { if (!k) return; say('COPIED'); btn.setAttribute('data-done', ''); setTimeout(() => btn.removeAttribute('data-done'), 1500); }); return; }
    const wl = el.closest<HTMLElement>('a[data-wl]');
    if (wl) { // vault: mở note đích trong workspace, rồi cuộn tới heading
      ev.preventDefault();
      const w = wsRef.current, p = wl.dataset['wl'] ?? '';
      wlHash.current = wl.dataset['wh'] ?? '';
      if (w && p !== wsPathRef.current && w.files.some((f) => f.path === p)) { wsFlush(); wsOpenFile(w, p); } else if (wlHash.current) { document.getElementById(wlHash.current)?.scrollIntoView(); wlHash.current = ''; }
      return;
    }
    const md = el.closest<HTMLAnchorElement>('a[data-md]');
    if (md && ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey) { ev.preventDefault(); void openRemote(md.dataset['md'] ?? '', { push: true }); return; }
    const rel = el.closest<HTMLAnchorElement>('a[href]');
    if (rel && !baseRef.current && resolveLink(rel.getAttribute('href') ?? '', 'https://base.invalid/')) { ev.preventDefault(); say('NO SOURCE URL · use File, Open URL'); return; }
    if (el.closest('a') || el.closest('.pv-fm') || view === 'pv') return;
    const line = Number(el.closest<HTMLElement>('[data-line]')?.dataset['line']);
    if (line) goToLine(line, 0.35, false); // chỉ đưa con trỏ và cuộn ô soạn tới dòng đó; không lấy focus, để phím đơn (?, d, s) vẫn chạy khi đang đọc bản xem
  };
  /** Chế độ chỉ xem: nhấp đúp vào một khối thì mở ô soạn ở đúng dòng đó. */
  const onPreviewDbl = (ev: MouseEvent) => {
    if ((view !== 'pv' && view !== 'split') || zen) return;
    const el = ev.target as HTMLElement;
    if (el.closest('a, button, .pv-fm')) return;
    const line = Number(el.closest<HTMLElement>('[data-line]')?.dataset['line']);
    if (!line) return;
    getSelection()?.removeAllRanges();
    if (view === 'split') { goToLine(line); return; } // Split: nhấp đơn chỉ đưa con trỏ tới dòng, nhấp đúp mới chuyển focus sang ô soạn để gõ tiếp
    setView('src');
    setTimeout(() => goToLine(line), 0);
  };
  const jumpTo = (h: Head) => {
    const o = out.current, el = doc.current?.querySelector<HTMLElement>('#' + CSS.escape(h.id)); if (!o || !el) return;
    skipUntil.current = performance.now() + 500;
    o.scrollTo({ top: el.getBoundingClientRect().top - o.getBoundingClientRect().top + o.scrollTop - 8, behavior: reduced() ? 'auto' : 'smooth' });
    if (view === 'split' && h.line) goToLine(h.line);
    setRailQ('');
  };

  // ---- outline / jump ----
  const railItems = useMemo(() => {
    const q = nrm(railQ.trim());
    return q ? heads.filter((h) => q.split(/\s+/).every((w) => nrm(h.text).includes(w))) : heads;
  }, [heads, railQ]);
  function openRail() {
    if (!inspAvail) return; // Zen có cột mục lục riêng (ZenCards)
    focusOutline.current = true; openInspTab('outline'); if (railInput.current) { focusOutline.current = false; railInput.current.focus(); }
  }
  useEffect(() => { if (focusOutline.current && inspTab === 'outline' && railInput.current) { focusOutline.current = false; railInput.current.focus(); } }, [InspC, inspOpen, inspTab]);
  useEffect(() => { setRailSel(0); }, [railQ]);
  useEffect(() => { railBox.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, inspOpen, railQ]);

  // đóng menu (Esc, chạm ra ngoài, chọn mục) mà focus rơi về body thì trả về nút đã mở nó: người dùng bàn phím/trình đọc màn hình không mất vị trí
  const menuOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const h = (ev: Event) => { const b = (ev.target as HTMLElement | null)?.closest<HTMLElement>('.pv-menuwrap > button[aria-haspopup]'); if (b) menuOpener.current = b; };
    document.addEventListener('click', h, true);
    return () => document.removeEventListener('click', h, true);
  }, []);
  const prevMenu = useRef('');
  useEffect(() => {
    const was = prevMenu.current; prevMenu.current = menu;
    if (was && !menu) setTimeout(() => { const o = menuOpener.current; const ae = document.activeElement; if (o && o.isConnected && (!ae || ae === document.body)) o.focus({ preventScroll: true }); }, 0);
  }, [menu]);

  // ---- zen ----
  const toggleZen = () => {
    const rootEl = document.documentElement;
    if (zen) {
      const dw = st.words - zenStart.current.w, mins = Math.round((Date.now() - zenStart.current.t) / 60000);
      if (dw !== 0 || mins >= 1) say(`Zen session: ${dw >= 0 ? '+' : ''}${dw} words · ${mins} min`);
      setZr(false);
      rootEl.removeAttribute('data-focus'); setZen(false); setView(prevView.current);
      setTimeout(() => {
        const t = ta.current; if (!t) return;
        t.scrollTop = Math.max(0, yOfLine(lineOf(t.value, savedSel.current.s) + 0.5) - t.clientHeight / 2); updateWin();
        if (out.current && (document.activeElement === out.current || !document.activeElement || document.activeElement === document.body)) { // mặt Đọc của Zen để focus ở bản xem: thoát ra thì trả về ô soạn (hoặc bỏ focus ở Read) để vòng focus không hiện thành một vạch lạ ở mép trên
          if (prevView.current === 'pv') out.current.blur(); else t.focus({ preventScroll: true });
        }
      }, 0);
      return;
    }
    prevView.current = view; prevTop.current = ta.current?.scrollTop ?? 0;
    zenStart.current = { w: st.words, t: Date.now() }; setZr(view !== 'src'); setZShow(true); setZMenu(false); setZSel(null); // Zen mở đúng mặt đang dùng: Edit vào Write, Read/Split vào Read; Alt+V hay nút Write/Read để đổi
    if (!zp.hinted) { setZHint(true); setZp({ ...zp, hinted: true }); setTimeout(() => setZHint(false), 6000); }
    setView('src'); setZen(true); setMenu('');
    rootEl.setAttribute('data-focus', '1');
  };
  // vào zen: đợi bố cục zen (cột hẹp, xuống dòng mềm) áp xong rồi mới đặt con trỏ và căn giữa, nếu không y đo theo bề rộng cũ
  useEffect(() => {
    if (!zen) return;
    const t = ta.current; if (!t) return;
    if (zr) {
      // mặt ĐỌC: bỏ focus khỏi ô soạn (để phím không rơi vào ô ẩn), focus bản xem và cuộn tới khối ở dòng con trỏ
      t.blur();
      const o = out.current;
      if (o) {
        o.focus({ preventScroll: true });
        const ln = lineOf(t.value, savedSel.current.s);
        const els = [...o.querySelectorAll<HTMLElement>('.md-doc [data-line]')].filter((e) => Number(e.dataset['line']) <= ln);
        const el = els[els.length - 1];
        if (el) o.scrollTop = Math.max(0, relTop(el, o) - o.clientHeight * 0.3);
      }
      return;
    }
    zenEnter.current = true;
    t.focus(); t.setSelectionRange(savedSel.current.s, savedSel.current.e); caret(); layers();
    zenEnter.current = false;
    // từ mặt Read quay về Write, ô soạn vừa hiện lại: WebKit chưa có bố cục ở lần đo đầu và không bắn sự kiện scroll khi khôi phục vị trí cuộn, nên căn giữa lại sau một khung hình và kéo lớp tô màu theo
    const sel0 = { ...savedSel.current };
    const id = requestAnimationFrame(() => { zenEnter.current = true; if (t.selectionStart !== sel0.s || t.selectionEnd !== sel0.e) t.setSelectionRange(sel0.s, sel0.e); caret(); layers(); zenEnter.current = false; });
    return () => cancelAnimationFrame(id);
  }, [zen, zr]);
  useEffect(() => { writeJson(KEYS.mdZen, zp); }, [zp]);
  // vị trí thanh công cụ nổi: phía trên dòng đầu của vùng bôi đen, căn giữa theo vùng chọn (nhiều dòng thì giữa cột chữ)
  useEffect(() => {
    const t = ta.current;
    if (!zen || zr || !zSel || !t) { setZSelPos(null); return; }
    const r = t.getBoundingClientRect(), a = caretBox(t, zSel.s), b = caretBox(t, zSel.e);
    const top = r.top + a.top - t.scrollTop, bottom = r.top + b.top + b.h - t.scrollTop;
    const left = r.left + (Math.abs(a.top - b.top) < 2 ? (a.x + b.x) / 2 : r.width / 2);
    setZSelPos(bottom < 0 || top > innerHeight ? null : { left, top, bottom }); // vùng chọn cuộn khỏi màn hình thì ẩn
  }, [zen, zr, zSel, zTick, src, zp.face]);
  // zen: chrome (rail, Copy, pill) dùng một trạng thái. Gõ: ẩn ngay, ngừng gõ ~1,5 giây thì hiện lại. Chuột: di chuyển thì hiện, đứng yên ~2,5 giây thì mờ và ẩn con trỏ chuột. Cuộn bằng bánh xe hoặc chạm ở mặt Đọc: ẩn.
  useEffect(() => {
    if (!zen) return;
    let idle = 0, still = 0;
    const html = document.documentElement;
    const wake = () => { html.removeAttribute('data-zidle'); clearTimeout(still); };
    const typed = () => { wake(); setZShow(false); clearTimeout(idle); idle = window.setTimeout(() => setZShow(true), 1500); };
    let scrollAt = 0, lastXY = '';
    let pending: ((ev: Event) => void) | null = null;
    // pointermove sau khi cuộn (Chrome bắn pointermove giả khi nội dung trượt dưới con trỏ, và chạm vuốt cũng bắn pointermove) làm chrome nháy: ẩn lúc cuộn rồi hiện lại ngay
    const move = (e?: PointerEvent) => {
      if (e && e.type === 'pointermove') {
        const xy = e.screenX + ',' + e.screenY;
        const same = xy === lastXY; lastXY = xy;
        if (e.pointerType !== 'mouse' || same || Date.now() - scrollAt < 700) return;
      }
      clearTimeout(idle); setZShow(true); html.removeAttribute('data-zidle'); clearTimeout(still);
      still = window.setTimeout(() => { setZShow(false); html.setAttribute('data-zidle', '1'); }, 2500);
    };
    const scroll = (e: Event) => { if ((e.target as HTMLElement | null)?.closest?.('.pv-out')) { scrollAt = Date.now(); wake(); setZShow(false); } }; // cuộn do người dùng (bánh xe, chạm), không phải cuộn do chương trình khi đổi mặt
    // bấm ra ngoài chrome thì đóng popover cài đặt; chạm cũng hiện chrome (iOS không có hover)
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.zc-keep')) setZMenu(false);
      // chạm trên mặt Đọc: chưa biết là chạm hay là bắt đầu vuốt, nên chờ nhả tay; vuốt (đã có cuộn) thì không hiện chrome
      if (e.pointerType === 'touch' && (e.target as HTMLElement | null)?.closest?.('.pv-out')) {
        const t0 = Date.now();
        const end = (ev: Event) => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); if (ev.type === 'pointerup' && scrollAt < t0) move(); };
        window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); // vuốt thì trình duyệt bắn pointercancel: gỡ cả hai
        pending = end;
        return;
      }
      move();
    };
    const view = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      // Alt+V đổi mặt ngay cả khi đang gõ (Esc trong ô soạn thoát hẳn zen); phím v trần chỉ khi không ở trong ô nhập
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (!(e.altKey ? e.code === 'KeyV' : !typing && e.key === 'v')) return;
      e.preventDefault(); setZr((r) => !r);
    };
    // 'input' ở pha bubble, SAU handler của textarea: setState ở pha capture làm Preact render bằng `src` cũ và ghi đè giá trị vừa gõ
    const syncDark = () => setZDark(document.documentElement.dataset['theme'] === 'dark');
    syncDark();
    const mo = new MutationObserver(syncDark);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('input', typed);
    window.addEventListener('pointermove', move); window.addEventListener('pointerdown', down); window.addEventListener('keydown', view); window.addEventListener('wheel', scroll, { passive: true }); window.addEventListener('touchmove', scroll, { passive: true });
    return () => { if (pending) { window.removeEventListener('pointerup', pending); window.removeEventListener('pointercancel', pending); } window.removeEventListener('input', typed); window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', view); window.removeEventListener('wheel', scroll); window.removeEventListener('touchmove', scroll); mo.disconnect(); clearTimeout(idle); wake(); };
  }, [zen]);
  // zen mặt Read: % đã đọc. Nghe 'scroll' ở pha capture (scroll không nổi bọt); chỉ setState khi số nguyên đổi
  useEffect(() => {
    if (!zen || !zr) { setZProg(null); return; }
    let raf = 0;
    const calc = () => {
      const o = out.current; if (!o) return;
      const max = o.scrollHeight - o.clientHeight;
      const v = max > 8 ? Math.min(100, Math.round((o.scrollTop / max) * 100)) : null;
      setZProg((p) => (p === v ? p : v));
    };
    const onScroll = (e: Event) => { if (!(e.target as HTMLElement | null)?.classList?.contains('pv-out')) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(calc); };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', calc);
    raf = requestAnimationFrame(calc);
    return () => { document.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', calc); cancelAnimationFrame(raf); };
  }, [zen, zr, html]);
  const chooseView = (v: View) => { if (zen) { document.documentElement.removeAttribute('data-focus'); setZen(false); } setView(v); };

  // ---- tài liệu: thay thế (có chỗ lui), file trên máy, chia sẻ ----
  const stash = (current: string) => { if (current.trim() && current !== SAMPLE) { writeString(KEYS.mdPrev, current); setHasPrev(true); void addSnapshot(current, 'replaced', ''); } };
  const load = (text: string, name: string, opts: { handle?: FsHandle | null; keepPrev?: boolean; name?: string; reason?: string; base?: string | null; snapshot?: boolean } = {}) => {
    if (wsOnRef.current && !wsInternal.current) { say('CLOSE THE COPY FIRST TO OPEN ANOTHER DOCUMENT'); return; } // nếu không, wsFlush sẽ ghi tài liệu này đè lên file đang mở của bản sao
    const clean = text.replace(/\r\n/g, '\n');
    setExtBlocked(false); // tài liệu khác: không còn là tài liệu chia sẻ
    if (!opts.keepPrev && clean !== srcRef.current) stash(srcRef.current); // dùng ref: hàm này cũng được gọi từ sự kiện hashchange (closure cũ)
    if (clean !== SAMPLE && opts.snapshot !== false) void addSnapshot(clean, opts.reason ?? (opts.name || opts.handle ? 'opened' : 'loaded'), opts.name ?? opts.handle?.name ?? '');
    fh.current = opts.handle ?? null;
    setBase(opts.base ?? null);
    setSaved(opts.handle ? clean : null);
    setBaseline(clean);
    hist.current = { loaded: clean, redo: false };
    if (clean !== srcRef.current) auth.current?.mark('import'); // tài liệu khác: cả văn bản là "có sẵn"
    setPos({ ln: 1, col: 1 });
    if (clean !== srcRef.current) setPvStale(true);
    setSrc(clean);
    if (ta.current) { ta.current.value = clean; ta.current.scrollTop = 0; }
    const nm = opts.name ?? opts.handle?.name; // mở file (ô chọn file, kéo thả, hay File System Access) thì giữ đúng tên file
    if (wsOnRef.current || wsBusyRef.current) { setCustom(nm ?? ''); }
    else if (nm) { setCustom(nm); writeString(KEYS.mdName, nm); } else { setCustom(''); removeKey(KEYS.mdName); }
    say(name);
  };
  /** Mở tài liệu Markdown từ URL raw (có thể kèm #anchor). `push` ghi vào ngăn xếp back/forward. */
  const openRemote = async (target: string, opts: { push: boolean; idx?: number }) => {
    if (loadingUrl.current) return;
    const at = target.indexOf('#');
    const rawUrl = at < 0 ? target : target.slice(0, at);
    const hash = at < 0 ? '' : decodeURIComponent(target.slice(at + 1));
    if (rawUrl === baseRef.current && hash) { pendingHash.current = ''; const el = doc.current?.querySelector<HTMLElement>('#' + CSS.escape(hash)); el?.scrollIntoView(); return; }
    if (dirty && !confirm('Replace the current document? Unsaved changes go to Restore previous.')) return;
    loadingUrl.current = true;
    say('LOADING…');
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(rawUrl, { signal: ctl.signal, credentials: 'omit' }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      if (text.length > 2_000_000) throw new Error('too large');
      if (opts.push) {
        const n = nav.current;
        if (n.stack.length === 0 && baseRef.current) { n.stack = [baseRef.current]; n.i = 0; }
        n.stack = n.stack.slice(0, n.i + 1).concat(target); n.i = n.stack.length - 1;
      }
      if (opts.idx !== undefined) nav.current.i = opts.idx;
      pendingHash.current = hash;
      load(text, 'OPENED ' + fileNameFromUrl(rawUrl), { name: fileNameFromUrl(rawUrl), base: rawUrl, reason: 'remote', snapshot: false });
      setNavTick((t) => t + 1);
    } catch {
      say('COULD NOT LOAD ' + fileNameFromUrl(rawUrl));
    } finally { loadingUrl.current = false; }
  };
  const [newAsk, setNewAsk] = useState<'' | 'new' | 'clear'>(''); // hỏi trước khi "New" hoặc "Clear" thay tài liệu đang có chữ (cùng một hộp, khác chữ)
  /** Thẻ chào: chỉ khách chưa có tài liệu nào và chưa tắt thẻ (cờ KEYS.welcomed). Tắt khi gõ chữ đầu tiên, Esc, bấm một nút, hoặc tài liệu hết trống. */
  const [welcome, setWelcome] = useState(() => src === '' && readString(KEYS.welcomed) === null && !/^#[de]=/.test(location.hash));
  const [sampleBarOff, setSampleBarOff] = useState(false); // thanh "SAMPLE": "Keep this" tắt nó trong lần mở này
  const welcomeUp = welcome && src === '' && !zen;
  const dismissWelcome = () => { setWelcome(false); writeString(KEYS.welcomed, '1'); };
  /** Chèn chữ vào ô soạn ĐỒNG BỘ rồi phát `input` như khi người dùng gõ: phím kế tiếp (gõ nhanh) nối đúng sau nó, không đua với lần dựng lại của Preact. */
  const typeInto = (box: HTMLTextAreaElement, text: string) => {
    box.focus();
    box.setRangeText(text, box.selectionStart, box.selectionEnd, 'end');
    box.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  };
  useEffect(() => { if (welcome && src !== '') dismissWelcome(); }, [welcome, src]); // tài liệu có chữ bằng bất kỳ đường nào (dán, mở file, thả file, mẫu): thẻ hết nhiệm vụ
  // Không tự focus ô soạn khi tải trang (ăn mất điểm dừng Tab đầu tiên là "Skip to editor"); thay vào đó phím in được ở bất kỳ đâu đều đi vào tài liệu:
  useEffect(() => { // phím khi thẻ đang hiện: Esc tắt thẻ; phím in được khi focus không ở ô soạn thì đưa chữ vào tài liệu (không phím tắt nào được nuốt mất chữ đầu tiên)
    if (!welcomeUp) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], .pal')) return; // hộp thoại / palette đang mở: phím là của chúng
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); dismissWelcome(); ta.current?.focus(); return; }
      if (ev.key.length !== 1 || ev.key === '/' || ev.key === '?') return; // Tab, Enter, phím mũi tên, "/" (palette) và "?" (trợ giúp) không tắt thẻ
      const t = ev.target as HTMLElement | null;
      if (t === ta.current || t?.closest?.('button, a[href], input, textarea, select, [contenteditable="true"]')) return;
      const box = ta.current; if (!box) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      typeInto(box, ev.key); dismissWelcome();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [welcomeUp]);
  useEffect(() => { // parallax nhẹ theo chuột; chỉ khi hệ thống không yêu cầu giảm chuyển động và có chuột
    if (!welcomeUp || !matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover)').matches) return;
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = root.current?.querySelector<HTMLElement>('.welcome'); if (!el) return;
        const r = el.getBoundingClientRect(), c = (v: number) => Math.max(-1, Math.min(1, v)).toFixed(3);
        el.style.setProperty('--wx', c(((ev.clientX - r.left) / r.width) * 2 - 1)); el.style.setProperty('--wy', c(((ev.clientY - r.top) / r.height) * 2 - 1));
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => { cancelAnimationFrame(raf); document.removeEventListener('pointermove', onMove); };
  }, [welcomeUp]);
  const onWelcomeClick = (ev: MouseEvent) => {
    const act = (ev.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-wact]')?.dataset['wact'];
    if (act === 'sample') loadSample(); // hết trống ⇒ thẻ tự tắt
    else if (act === 'open') { dismissWelcome(); void openFile(); }
    else if (act === 'start') { dismissWelcome(); if (view === 'pv') chooseView('src'); ta.current?.focus(); }
  };
  const [urlDlg, setUrlDlg] = useState<string | null>(null); // thẻ "Open from URL" (thay cho prompt() gốc của trình duyệt)
  const [urlErr, setUrlErr] = useState('');
  const openFromUrl = () => { setMenu(''); setUrlErr(''); setUrlDlg(''); };
  const submitUrl = () => {
    const v = (urlDlg ?? '').trim();
    if (!v) { setUrlErr('Paste a link to a Markdown file.'); return; }
    const raw = toRawUrl(v);
    if (!raw) { setUrlErr('That is not a link to a Markdown file. Try github.com/owner/repo/blob/main/README.md or a raw .md URL.'); return; }
    setUrlDlg(null); setUrlErr('');
    void openRemote(raw + (v.includes('#') ? v.slice(v.indexOf('#')) : ''), { push: true });
  };
  const goHistory = (d: -1 | 1) => {
    const n = nav.current, j = n.i + d;
    if (j < 0 || j >= n.stack.length) return;
    void openRemote(n.stack[j]!, { push: false, idx: j });
  };
  const canBack = navTick >= 0 && nav.current.i > 0, canFwd = navTick >= 0 && nav.current.i >= 0 && nav.current.i < nav.current.stack.length - 1;
  const prevTitle = () => { const t = docTitle(readString(KEYS.mdPrev) ?? ''); return t.length > 26 ? t.slice(0, 25) + '…' : t; };
  const restore = () => {
    const prev = readString(KEYS.mdPrev); if (prev === null) return;
    clearTimeout(undoTimer.current); setUndoBar(null); // toast Undo của lần thay trước không còn đúng nữa
    writeString(KEYS.mdPrev, src); // đảo chỗ: bấm lần nữa để quay lại
    load(prev, 'RESTORED PREVIOUS', { keepPrev: true });
    setHasPrev(true);
  };
  useEffect(() => { // toast Undo tắt khi người dùng bắt đầu sửa tài liệu mới
    if (!undoBar) { undoBase.current = null; return; }
    if (undoBase.current === null) { undoBase.current = src; return; }
    if (src !== undoBase.current) setUndoBar(null);
  }, [undoBar, src]);
  useEffect(() => { // thẻ chào ở khung tĩnh của trang chủ: việc khách vừa bấm (start | open | sample) hoặc phím in được đầu tiên (không nuốt chữ)
    const w = window as unknown as { __mdAct?: string; __mdKey?: string; __mdLive?: boolean };
    const act = w.__mdAct, ch = w.__mdKey; delete w.__mdAct; delete w.__mdKey;
    w.__mdLive = true; // từ đây bộ bắt phím của thẻ (effect phía trên) đã gắn: khung tĩnh thôi gom phím (xem HomeStudio)
    if (ch && srcRef.current === '' && ta.current) { typeInto(ta.current, ch); dismissWelcome(); }
    else if (act === 'sample') loadSample();
    else if (act === 'open') { dismissWelcome(); setMenu('open'); } // chọn file cần cử chỉ người dùng còn nóng; editor nạp muộn nên mở menu Open thay vì gọi hộp chọn file
    else if (act === 'start') dismissWelcome();
  }, []);
  /** Thay tài liệu không hỏi: `load` đã cất bản cũ (Restore previous) và chụp snapshot; ở đây chỉ báo; thông báo có Undo ở lại tới khi gõ tiếp hoặc đóng. */
  const replaceDoc = (text: string, name: string, opts: Parameters<typeof load>[2], msg: string) => {
    if (wsOnRef.current && !wsInternal.current) { load(text, name, opts); return; } // `load` từ chối và tự báo; không hiện toast sai
    const had = srcRef.current.trim() !== '' && srcRef.current !== SAMPLE;
    load(text, name, opts);
    clearTimeout(undoTimer.current);
    if (had) setUndoBar(msg); else setUndoBar(null); // thông báo ở lại tới khi người dùng đóng, bấm Undo hoặc bắt đầu gõ (không còn tự tắt sau vài giây)
  };
  useEffect(() => { if (menu && matchMedia('(max-width: 899px)').matches) setUndoBar(null); }, [menu]); // bảng trượt từ đáy che toast; bản cũ vẫn ở Open ▾ → Restore previous
  useEffect(() => {
    if (menu !== 'file' && menu !== 'open') return;
    let live = true;
    void listSnapshots().then((l) => { if (live && l) setRecent(l); });
    return () => { live = false; };
  }, [menu]);
  /** Tối đa 5 tài liệu khác nhau (theo tên tệp, hay tiêu đề đầu tiên), mới nhất trước, bỏ bản đang mở và bản rỗng. */
  const recentDocs = (): { snap: Snap; title: string }[] => {
    // khoá theo tiêu đề rút từ nội dung (không theo tên tệp: bản chụp 'saved' có thể mang tên tệp cũ của lúc chưa kịp suy ra), tên tệp chỉ là phương án cuối
    const titleOf = (x: Snap) => (docTitle(x.text) || x.name || 'untitled').slice(0, 40);
    const seen = new Set<string>([titleOf({ name: custom, text: srcRef.current } as Snap)]), out: { snap: Snap; title: string }[] = []; // bản cũ của chính tài liệu đang mở không phải "gần đây"
    for (const x of [...recent].sort((a, b) => b.t - a.t)) {
      if (!x.text.trim() || x.text === srcRef.current) continue;
      const k = titleOf(x);
      if (seen.has(k)) continue;
      seen.add(k); out.push({ snap: x, title: k });
      if (out.length === 5) break;
    }
    return out;
  };
  const ago = (t: number) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  // vùng cuộn ngang trong bản xem (khối code, công thức dài) phải focus được để người dùng bàn phím cuộn được (axe: scrollable-region-focusable)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      doc.current?.querySelectorAll<HTMLElement>('pre, .katex-display, table').forEach((e) => { if (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight) e.tabIndex = 0; }); // chỉ thêm, không gỡ: khối code của Shiki đã có tabindex tĩnh, và Safari coi mọi vùng overflow là cuộn được
    });
    return () => cancelAnimationFrame(id);
  }, [html, view, docStyle, wide]);
  // ảnh ngoài không tải được (404, bị chặn): thay bằng một dòng báo rõ thay vì ô trống hay biểu tượng ảnh vỡ. Sự kiện error không nổi bọt nên nghe ở pha capture; quét luôn các ảnh đã hỏng trước khi nghe
  useEffect(() => {
    const root = out.current; if (!root) return;
    const mark = (img: HTMLImageElement) => {
      if (!img.closest('.md-doc') || img.dataset['missing'] !== undefined) return;
      const raw = img.getAttribute('src'); if (!raw || raw === '#') return; // bộ lọc đã bỏ nguồn ảnh (src="#"): không phải lỗi mạng
      const alt = img.getAttribute('alt')?.trim();
      let host = ''; try { host = new URL(img.currentSrc || img.src).host; } catch { /* bỏ qua */ }
      const note = document.createElement('span');
      note.className = 'img-broken'; note.setAttribute('role', 'img'); note.setAttribute('aria-label', `Image failed to load${alt ? `: ${alt}` : ''}`);
      note.textContent = `Image not found${alt ? ` · ${alt}` : ''}${host ? ` · ${host}` : ''}`;
      img.replaceWith(note);
    };
    const onErr = (e: Event) => { if (e.target instanceof HTMLImageElement) mark(e.target); };
    root.addEventListener('error', onErr, true);
    // ảnh lazy chưa tải cũng báo complete=true, naturalWidth=0: không được coi là hỏng
    root.querySelectorAll('img').forEach((i) => { if (i.loading !== 'lazy' && i.complete && i.naturalWidth === 0 && i.getAttribute('src')) mark(i); });
    return () => root.removeEventListener('error', onErr, true);
  }, [html, view]);
  const loadSample = () => { setMenu(''); replaceDoc(SAMPLE, 'SAMPLE', { snapshot: false }, 'Loaded the sample'); };
  const undoReplace = () => { clearTimeout(undoTimer.current); setUndoBar(null); restore(); };
  const newFromTemplate = (id: string) => {
    setMenu('');
    const t = TEMPLATES.find((x) => x.id === id); if (!t) return;
    replaceDoc(t.body(), `NEW ${t.label.toUpperCase()}`, { reason: 'template' }, `Started a ${t.label} document`);
  };
  /** Văn bản từ ngăn Changes/History đi qua commit() như mọi sửa đổi khác, nên Ctrl/⌘+Z hoàn tác được. */
  const applyFromPanel = (text: string, caret: number, msg: string, backup: boolean) => {
    if (backup) void addSnapshot(srcRef.current, 'before restore', '');
    commit({ text, start: caret, end: caret });
    say(msg);
  };
  const snapshotNow = async () => { const ok = await addSnapshot(srcRef.current, 'manual', fileName); say(ok ? 'SNAPSHOT TAKEN' : 'NOTHING NEW TO SNAPSHOT'); return ok; };
  const onFile = (f: File | undefined) => {
    if (f && isPack(f.name)) { void Promise.all([import('../../lib/studio/export-more'), f.arrayBuffer()]).then(([m, b]) => m.importTextPack(new Uint8Array(b), putAsset)).then((t) => (t === null ? say('NOT A TEXTPACK FILE') : load(t, 'OPENED ' + f.name, { name: f.name.replace(/\.textpack$/i, '.md') }))); return; }
    if (f) f.text().then((t) => load(t, 'OPENED ' + f.name, { name: f.name }));
  };
  const openFile = async () => {
    setMenu('');
    const w = fsw();
    if (!w.showOpenFilePicker) { file.current?.click(); return; }
    try {
      const [h] = await w.showOpenFilePicker({ types: MD_TYPES });
      if (!h) return;
      if (isPack(h.name)) { onFile(await h.getFile()); return; }
      const text = await (await h.getFile()).text();
      setCustom(h.name); writeString(KEYS.mdName, h.name);
      load(text, 'OPENED ' + h.name, { handle: h });
    } catch { /* người dùng huỷ */ }
  };
  const writeTo = async (h: FsHandle) => {
    const wr = await h.createWritable();
    await wr.write(src); await wr.close();
    setSaved(src); setBaseline(src); say('SAVED ' + h.name); void addSnapshot(src, 'saved', h.name);
  };
  const saveAs = async () => {
    setMenu('');
    const w = fsw();
    if (!w.showSaveFilePicker) { download(fileName, 'text/markdown', src); say('DOWNLOADED ' + fileName); return; }
    try { const h = await w.showSaveFilePicker({ suggestedName: fileName, types: MD_TYPES }); fh.current = h; setCustom(h.name); writeString(KEYS.mdName, h.name); await writeTo(h); } catch { /* người dùng huỷ */ }
  };
  const save = async () => {
    if (fh.current) { try { await writeTo(fh.current); } catch { say('SAVE FAILED'); } return; }
    // chưa gắn tệp trên đĩa: ⌘S không bật hộp thoại, bản sao trong trình duyệt đã tự lưu; ghi ra đĩa là việc của "Save as…" và Export
    setBaseline(src); void addSnapshot(src, 'saved', fileName); say('SAVED IN THIS BROWSER · SAVE AS… WRITES A FILE');
  };
  const shareDoc = () => (dt && !implicit ? { md: src, theme: dt.t } : { md: src }); // theme token đi theo link; CSS tuỳ ý thì không
  const share = async () => {
    const { canShare, encodeDoc } = await import('../../lib/studio/share'); // nạp lười: chỉ khi bấm hoặc khi mở link
    if (!canShare()) { say('SHARE NEEDS A NEWER BROWSER'); return; }
    const payload = await encodeDoc(shareDoc());
    const url = `${location.origin}${location.pathname}#d=${payload}`;
    if (url.length > 16000) { say(`TOO LARGE FOR A LINK (${Math.round(src.length / 1024)} KB), USE EXPORT`); return; }
    copyText(url).then((k) => k && say('COPIED SHARE LINK' + (hasAssets(src) ? ' · pasted images are not in the link' : '')));
  };
  useEffect(() => { // mở link chia sẻ (tải trang mới hoặc chỉ đổi #hash trong cùng tab): nạp vào, cất bản đang soạn vào "restore previous"
    const open = () => {
      const m = /^#([de])=([A-Za-z0-9_-]+)$/.exec(location.hash);
      if (!m) return;
      if (m[1] === 'e') { history.replaceState(null, '', location.pathname + location.search); setXd({ k: 'share', p: { mode: 'open', payload: m[2] } }); return; }
      void import('../../lib/studio/share').then((s) => s.decodeDoc(m[2]!)).then((t) => {
        history.replaceState(null, '', location.pathname + location.search);
        if (t === null) { say('INVALID SHARE LINK'); return; }
        pendingTheme.current = t.theme ?? null;
        setPendingShare(t.md); // hỏi trước: link có thể do người khác gửi
      });
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  const pendingTheme = useRef<unknown>(null);
  /** Theme của người gửi chỉ áp cho lần xem này (không lưu), sau khi lọc. */
  const openShared = (t = pendingShare, th = pendingTheme.current) => { if (t === null) return; setPendingShare(null); setXd(null); load(t, th ? 'OPENED SHARED DOCUMENT · WITH THE SENDER\'S THEME' : 'OPENED SHARED DOCUMENT'); setExtBlocked(true); if (th) themeOf(th, false); };
  useEffect(() => {
    const o = out.current, d = doc.current; if (!o || !d) return;
    for (const k of [...o.style]) if (k.startsWith('--')) o.style.removeProperty(k);
    for (const [k, v] of dtx?.vars ?? []) o.style.setProperty(k, v);
    o.toggleAttribute('data-dt', !!dtx);
    d.style.fontFamily = dtx?.doc.fontFamily ?? ''; d.style.fontSize = dtx?.doc.fontSize ?? ''; d.style.maxWidth = dtx?.doc.maxWidth ?? '';
  }, [dtx, view, zen]);
  const allowImages = () => { setExtBlocked(false); setHtml(finish(rawHtml.current)); runMermaid(rawHtml.current, seq.current); };
  const blockedN = useMemo(() => (extBlocked ? (html.match(/class="md-img-blocked"/g)?.length ?? 0) : 0), [html, extBlocked]);
  // PWA: service worker (chỉ bản build, chỉ nơi an toàn: HTTPS hay localhost). Lõi được cache khi cài; phần nạp động tải nền sau 5 giây nếu online và không tiết kiệm dữ liệu
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    window.addEventListener('online', up); window.addEventListener('offline', up);
    let warmT = 0;
    if (import.meta.env.PROD && 'serviceWorker' in navigator && isSecureContext) {
      navigator.serviceWorker.register(url('/app/sw.js'), { scope: url('/app/') }).then(async () => {
        const reg = await navigator.serviceWorker.ready;
        const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
        if (navigator.onLine && !conn?.saveData) warmT = window.setTimeout(() => reg.active?.postMessage({ t: 'warm' }), 5000);
      }).catch(() => undefined);
    }
    // app đã cài (Chromium máy tính): mở file .md từ hệ điều hành; giữ handle nên ⌘/Ctrl+S ghi đè đúng file đó
    const lq = (window as Window & { launchQueue?: { setConsumer: (f: (p: { files?: FsHandle[] }) => void) => void } }).launchQueue;
    lq?.setConsumer((p) => {
      const h = p.files?.[0]; if (!h) return;
      void h.getFile().then((f) => f.text()).then((text) => { setCustom(h.name); writeString(KEYS.mdName, h.name); load(text, 'OPENED ' + h.name, { handle: h }); }).catch(() => say('COULD NOT OPEN ' + h.name));
    });
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', up); clearTimeout(warmT); };
  }, []);
  useEffect(() => { // cảnh báo khi đóng tab với file đang sửa chưa lưu
    if (!dirty) return;
    const h = (ev: BeforeUnloadEvent) => { ev.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ---- menu ----
  const exportItems: { label: string; hint?: string; run: () => void }[] = [
    { label: 'Download Markdown (.md)', run: () => { download(fileName, 'text/markdown', src); say('DOWNLOADED ' + fileName + (hasAssets(src) ? ' · pasted images stay in this browser, use HTML to keep them' : '')); } },
    { label: 'HTML (.html)', run: () => { const n = withExt('html'); void fullHtml().then(inlineAssets).then((body) => { download(n, 'text/html', standaloneHtml({ title: titleOf(src), bodyHtml: body, css: docCss, vars: resolveVars((v) => getComputedStyle(document.documentElement).getPropertyValue(v)), docStyle, extra: (dtx?.css ?? '') + (document.getElementById('pv-user-css')?.textContent ?? '') })); say('DOWNLOADED ' + n); }); } },
    { label: 'Word (.docx)', hint: 'headings, lists, tables, footnotes, images', run: () => { void exportDocx(); } },
    { label: 'EPUB (.epub)', hint: 'e-book', run: () => { void exportMore('epub'); } },
    { label: 'LaTeX (.tex)', hint: 'common syntax', run: () => { void exportMore('tex'); } },
    { label: 'TextPack (.textpack)', hint: 'Markdown + images', run: () => { void exportMore('textpack'); } },
    { label: 'PDF (print)', hint: 'print dialog', run: () => { void fullHtml().then(() => printDoc(false)); } },
    { label: 'PDF with contents', hint: 'print dialog', run: () => { void fullHtml().then(() => printDoc(true)); } },
    { label: 'Slides PDF', hint: 'one slide per page', run: () => { void fullHtml().then(printSlides); } },
    { label: 'Copy Markdown', run: () => { copyText(src).then((k) => k && say('COPIED MARKDOWN')); } },
    { label: 'Copy HTML', run: () => { void fullHtml().then((h) => inlineAssets(cleanHtml(h))).then((h) => copyText(h)).then((k) => k && say('COPIED HTML')); } },
    { label: 'Copy rich text', run: () => { void fullHtml().then((h) => inlineAssets(cleanHtml(h))).then((h) => copyRich(h, src)).then((k) => k && say('COPIED RICH TEXT')); } },
    { label: 'Copy share link', run: () => { void share(); } },
    { label: 'Share with password…', hint: 'encrypted link', run: () => setXd({ k: 'share', p: { mode: 'new', doc: shareDoc() } }) },
    ...(ws?.origin.kind === 'vault' ? [{ label: 'Static site (.zip)', hint: 'whole vault', run: siteDialog }] : [{ label: 'Publish a vault as a site…', hint: 'pick a folder', run: () => openVault(true) }]),
  ];
  /** EPUB, LaTeX, TextPack: bộ dựng chỉ nạp khi bấm. */
  async function exportMore(k: 'epub' | 'tex' | 'textpack') {
    say('BUILDING…');
    try {
      const m = await import('../../lib/studio/export-more');
      const r = await m.exportMore(k, { src, html: k === 'epub' ? await fullHtml() : '', title: titleOf(src), base: baseRef.current, stem: withExt('x').slice(0, -2) }, { cleanHtml, inlineAssets, assetBlob, refsIn, mermaidSvg: mermaidSvgForExport });
      download(r.name, r.type, r.data); say('DOWNLOADED ' + r.name + (r.note ? ' · ' + r.note : ''));
    } catch { say('EXPORT FAILED'); }
  }
  /** Word: thư viện docx và bộ chuyển chỉ nạp khi bấm. Ảnh `asset:` lấy từ IndexedDB, ảnh web qua fetch (CORS), sơ đồ Mermaid dựng lại thành PNG. */
  async function exportDocx() {
    say('BUILDING DOCX…');
    try {
      const [{ docxBlob }, raster] = await Promise.all([import('../../lib/studio/docx'), import('../../lib/studio/raster')]);
      const image = async (u: string) => {
        if (u.startsWith('asset:')) { const b = await assetBlob(u.slice(6)); return b ? raster.imageForDocx(b) : null; }
        const abs = baseRef.current && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? new URL(u, baseRef.current).href : u;
        if (!/^https?:/i.test(abs)) return null;
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
        try { const r = await fetch(abs, { mode: 'cors', credentials: 'omit', signal: ctl.signal }); return r.ok ? raster.imageForDocx(await r.blob()) : null; } catch { return null; } finally { clearTimeout(tm); }
      };
      const diagram = async (source: string) => { const svg = await mermaidSvgForExport(source); return svg ? raster.svgForDocx(svg) : null; };
      const blob = await docxBlob(srcRef.current, { image, diagram, title: titleOf(srcRef.current) });
      const n = withExt('docx');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = n; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      say('DOWNLOADED ' + n);
    } catch { say('COULD NOT BUILD DOCX'); }
  }
  /** Slide ra PDF: dựng mọi slide (khung 1280×720, cùng cách fit với màn chiếu) ngoài màn hình, in mỗi slide một trang, in xong thì gỡ. */
  function printSlides(h: string = html) {
    const list = splitSlides(h);
    if (!list.length) { say('NOTHING TO PRINT'); return; }
    setMenu('');
    const host = document.createElement('div');
    host.className = 'slp';
    document.body.appendChild(host);
    render(<>{list.map((sl, k) => <div class="slp-page" key={k}><SlideView html={sl.html} doc={docStyle} dt={slideDt} fixed /></div>)}</>, host);
    const rootEl = document.documentElement;
    rootEl.setAttribute('data-slprint', '1');
    document.title = fileName.replace(/\.[^./]*$/, '') + '-slides';
    let fin = false;
    const done = () => { if (fin) return; fin = true; window.removeEventListener('afterprint', done); render(null, host); host.remove(); rootEl.removeAttribute('data-slprint'); document.title = baseTitle.current; };
    window.addEventListener('afterprint', done);
    // afterprint không tới nơi ở mọi trình duyệt (Safari, chế độ không giao diện): print() trả về thì dọn sau một nhịp để tên tài liệu và trạng thái Present không kẹt lại
    void document.fonts?.ready.then(() => requestAnimationFrame(() => { window.print(); setTimeout(done, 5000); }));
  }
  /** In ra PDF: tên file gợi ý theo tên tài liệu (trình duyệt lấy từ document.title), tuỳ chọn mục lục ở đầu. */
  function printDoc(toc: boolean) {
    document.title = fileName.replace(/\.[^./]*$/, '');
    setPrintToc(toc);
    let fin = false;
    const done = () => { if (fin) return; fin = true; document.title = baseTitle.current; setPrintToc(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 5000); }, 80);
  }

  const commitName = () => {
    const v = (editName ?? '').trim().replace(/[\\/:*?"<>|]+/g, '-');
    setEditName(null);
    const next = !v || v === derivedName ? '' : /\.[a-z0-9]+$/i.test(v) ? v : v + '.md';
    setCustom(next); writeString(KEYS.mdName, next);
  };

  // ---- find ----
  function openFind() {
    const t = ta.current;
    const sel = t && t.selectionEnd > t.selectionStart && !t.value.slice(t.selectionStart, t.selectionEnd).includes('\n') ? t.value.slice(t.selectionStart, t.selectionEnd) : '';
    setFind((f) => ({ ...f, open: true, q: sel || f.q, idx: 0 }));
    setTimeout(() => { findInput.current?.focus(); findInput.current?.select(); }, 0);
  }
  const closeFind = () => { setFind((f) => ({ ...f, open: false })); ta.current?.focus(); };
  const goMatch = (i: number) => {
    const ms = found.matches; if (!ms.length) return;
    const k = (i + ms.length) % ms.length;
    setFind((f) => ({ ...f, idx: k }));
    const t = ta.current, m = ms[k]!; if (!t) return;
    const top = zen ? caretY(t, m.index) - lh / 2 : yOfLine(lineOf(src, m.index));
    skipUntil.current = performance.now() + 250;
    const pad = (document.querySelector('.pv-src > .pv-find') as HTMLElement | null)?.offsetHeight ?? 0; // thanh Find phủ phần đầu khung soạn: kết quả phải nằm dưới nó
    if (top < t.scrollTop + lh + pad || top > t.scrollTop + t.clientHeight - 2 * lh) t.scrollTop = Math.max(0, top - pad - (t.clientHeight - pad) * 0.35);
    t.setSelectionRange(m.index, m.index + m.length);
    layers();
  };
  const replaceCurrent = () => {
    const m = found.matches[fIdx]; if (!m) return;
    const r = replaceOne(src, m, find.r, find.regex);
    commit({ text: r.text, start: r.end, end: r.end });
    setTimeout(() => findInput.current?.focus(), 0);
  };
  const replaceEvery = () => {
    if (!found.matches.length) return;
    const text = replaceAll(src, found.matches, find.r, find.regex);
    commit({ text, start: 0, end: 0 });
    say(`REPLACED ${found.matches.length}`);
    setTimeout(() => findInput.current?.focus(), 0);
  };

  // ---- phím toàn trang ----
  const act = useRef<{ toggleZen: () => void; zen: boolean; save: () => Promise<void>; openRail: () => void; openFind: () => void; cmd: (c: string) => void }>({ toggleZen, zen, save, openRail, openFind, cmd: () => undefined });
  act.current = { toggleZen, zen, save, openRail, openFind, cmd: act.current.cmd };
  useEffect(() => {
    const onWin = (ev: KeyboardEvent) => {
      if (ev.isComposing) return;
      const k = ev.key.toLowerCase();
      if ((ev.metaKey || ev.ctrlKey) && k === 's') { ev.preventDefault(); void act.current.save(); return; }
      // ⌘K trên Mac, Ctrl+K nơi khác (Ctrl+K trên Mac là "xoá tới cuối dòng" của ô soạn, không được chiếm)
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      if ((mac ? ev.metaKey && !ev.ctrlKey : ev.ctrlKey && !ev.metaKey) && !ev.shiftKey && !ev.altKey && k === 'k' && act.current.zen) { ev.preventDefault(); emit('search', '>zen '); return; } // lệnh zen bằng chữ
      if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.code === 'Backslash') { ev.preventDefault(); act.current.cmd(ev.shiftKey ? 'inspector' : 'sidebar'); return; } // ⌘/Ctrl+\ panel file, ⌘/Ctrl+⇧+\ Inspector (⌘B/⌘I là đậm/nghiêng)
      if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && k === 'o') { ev.preventDefault(); act.current.openRail(); return; }
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey && k === 'f' && (ev.target as HTMLElement | null)?.closest?.('.ed-main, .pv-find')) { ev.preventDefault(); act.current.openFind(); return; }
      if (k === 'o' && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !typing(ev.target)) { ev.preventDefault(); act.current.openRail(); }
      if (k === 's' && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !typing(ev.target)) { ev.preventDefault(); act.current.cmd(ev.shiftKey ? 'present-here' : 'present'); }
      // Alt+P: trình chiếu từ slide đang soạn, cả khi đang ở mặt Read của zen (ô soạn đã có handler riêng)
      if (ev.altKey && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && ev.code === 'KeyP' && !(ev.target as HTMLElement | null)?.closest?.('.ed-ta')) { ev.preventDefault(); act.current.cmd('present-here'); }
    };
    window.addEventListener('keydown', onWin);
    const offStudio = on<{ cmd: string }>('studio', (d) => act.current.cmd(d.cmd));
    // Esc đóng Palette thì không được kéo theo việc thoát zen. Palette tự đóng ngay trong lúc phát 'escape', nên chụp trạng thái lúc VỪA nhấn (pha capture, trước mọi handler khác)
    const pal = { open: false, atEsc: false };
    const offPal = on<boolean>('search-state', (o) => { pal.open = o; });
    const escDown = (ev: KeyboardEvent) => { if (ev.code === 'Escape') pal.atEsc = pal.open; };
    window.addEventListener('keydown', escDown, true);
    const off = on<{ type: string }>('key', (a) => {
      if (a.type === 'focus') act.current.toggleZen();
      else if (a.type === 'escape') {
        setMenu(''); setHistOpen(false); setAssetsOpen(false);
        if (act.current.zen && zMenuRef.current) { setZMenu(false); return; }
        if (act.current.zen && !pal.atEsc) act.current.toggleZen();
      }
    });
    return () => { window.removeEventListener('keydown', onWin); window.removeEventListener('keydown', escDown, true); off(); offPal(); offStudio(); document.documentElement.removeAttribute('data-focus'); };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const h = (ev: PointerEvent) => { const el = ev.target as HTMLElement; if (!el.closest('.pv-menuwrap') && !el.closest('.pv-scrim')) setMenu(''); }; // lớp mờ (.pv-scrim) tự đóng ở sự kiện click: đóng ở pointerdown thì lớp mờ biến mất trước click và cú chạm rơi xuống nút bên dưới
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [menu]);
  // bản chụp tự động: khi đã đổi so với lần trước và đã ngừng gõ một lúc, hoặc khi rời tab
  useEffect(() => {
    const tick = (idle: boolean) => {
      const cur = srcRef.current;
      if (cur === lastSnap.current || cur.length < 40 || (idle && performance.now() - lastInput.current < 20000)) return;
      lastSnap.current = cur;
      void addSnapshot(cur, 'auto', '');
    };
    const id = setInterval(() => tick(true), 120_000);
    const vis = () => { if (document.visibilityState === 'hidden') tick(false); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const caretRef = useRef(caret);
  caretRef.current = caret;
  useEffect(() => { // con trỏ đổi bằng chuột, phím hay mã đều cập nhật Ln/Col, dòng hiện tại, zen và căn bảng
    const h = () => { if (document.activeElement === ta.current) caretRef.current(); };
    document.addEventListener('selectionchange', h);
    return () => document.removeEventListener('selectionchange', h);
  }, []);

  // ---- biến đổi văn bản, pop-out, lệnh từ Palette ----
  const runTransform = (id: TransformId) => {
    const t = ta.current; if (!t) return;
    if (!editing) { say('SWITCH TO EDIT FIRST'); return; } // ở Read ô soạn đang ẩn: không sửa văn bản người dùng không thấy
    const r = applyTransform(t.value, t.selectionStart, t.selectionEnd, id);
    if ('error' in r) say(r.error); else commit(r);
  };
  const popOut = () => { wantAllMermaid(); window.open(url('/app/preview/'), POPOUT_NAME, 'popup,width=900,height=920'); };
  const fixTrailingNow = () => { const t = ta.current; if (!t) return; const fixed = fixTrailing(t.value); const p = Math.min(t.selectionStart, fixed.length); commit({ text: fixed, start: p, end: p }); };
  const ex = (label: string) => () => exportItems.find((x) => x.label === label)?.run();
  const studioCmd = (c: string) => {
    if (c.startsWith('transform-')) { runTransform(c.slice(10) as TransformId); return; }
    if (c.startsWith('template-')) { newFromTemplate(c.slice(9)); return; }
    if (c.startsWith('table:')) { const t = ta.current; if (t && tableCellAt(t.value, t.selectionStart)) runTableOp(c.slice(6) as TableOp); else say('PUT THE CURSOR IN A TABLE FIRST'); return; }
    if (c.startsWith('zen-set:')) {
      const [, k, v] = c.split(':');
      const ok: Record<string, readonly string[]> = { chrome: ['auto', 'always', 'hidden'], tw: ['center', 'third', 'free'], focus: ['paragraph', 'sentence'], dim: ['off', 'soft', 'strong'], face: ['sans', 'mono'], size: ['s', 'm', 'l'], col: ['narrow', 'normal', 'wide'], copy: ['md', 'rich', 'plain'] };
      if (k && v && ok[k]?.includes(v)) setZp((p) => ({ ...p, [k]: v }));
      return;
    }
    const m: Record<string, () => void> = {
      present: () => present(false), inspector: toggleInsp, sidebar: () => { if (wsRef.current) setWsOpen((o) => !o); else say('NO FILE PANEL: IT OPENS WHEN YOU EDIT A COPY OF A SKILL'); },
      history: () => { if (inspAvail && !skillMode) openInspTab('history'); else setHistOpen((o) => !o); }, images: () => setAssetsOpen(true),
      zen: toggleZen, 'zen-read': () => { if (!act.current.zen) toggleZen(); setZr(true); }, 'zen-write': () => { if (!act.current.zen) toggleZen(); setZr(false); }, 'new': newDoc, clear: clearDoc, sample: loadSample,
      sync: toggleSync,
      install: installApp, 'open-url': openFromUrl, template: () => { setMenu('file'); setTplOpen(true); }, find: () => { if (view === 'pv') { chooseView('split'); setTimeout(openFind, 80); } else openFind(); }, // ở Read không có ô soạn: sang Split rồi mới mở Find jump: openRail, save: () => { void save(); }, 'export-md': ex('Download Markdown (.md)'), 'export-html': ex('HTML (.html)'), 'export-pdf': ex('PDF (print)'), 'export-pdf-toc': ex('PDF with contents'), 'export-docx': ex('Word (.docx)'), 'export-epub': ex('EPUB (.epub)'), 'export-tex': ex('LaTeX (.tex)'), 'export-textpack': ex('TextPack (.textpack)'), 'export-slides-pdf': ex('Slides PDF'),
      'copy-md': ex('Copy Markdown'), 'copy-html': ex('Copy HTML'), 'copy-rich': ex('Copy rich text'), share: ex('Copy share link'), 'share-pw': ex('Share with password…'), theme: () => setXd({ k: 'theme', p: {} }), restore,
      'present-here': () => present(true), 'zen-present': () => present(false), 'zen-present-here': () => present(true), 'doc-style': cycleDocStyle, authorship: toggleAuth, 'authorship-reset': () => { auth.current?.clear(); setAuthTick((n) => n + 1); say(auth.current ? 'AUTHORSHIP MARKS STARTED OVER' : 'TURN ON AUTHORSHIP MARKS FIRST'); }, 'writing-log-clear': () => { void import('../../lib/studio/writing-log').then((m) => { m.clearLog(); say('WRITING LOG CLEARED'); }); }, 'vault-folder': () => openVault(true), 'vault-zip': () => openVault(false), 'fix-trailing': fixTrailingNow, popout: popOut, spell: cycleSpell, width: toggleWide,
    };
    m[c]?.();
  };
  act.current.cmd = studioCmd;

  const lhRef = useRef(lh);
  lhRef.current = lh;
  const latest = useRef({ html: '', fm: null as FrontMatter | null, title: '', doc: 'default', dt: undefined as Extract<PopMsg, { t: 'html' }>['dt'] });
  latest.current = { html, fm, title: titleOf(lazy), doc: docStyle, dt: dtx ? { vars: dtx.vars, doc: dtx.doc } : undefined };
  const sendPop = () => popChan.current?.postMessage({ t: 'html', html: latest.current.html, fm: latest.current.fm, title: latest.current.title, doc: latest.current.doc, dt: latest.current.dt } satisfies PopMsg);
  useEffect(() => {
    const bc = new BroadcastChannel(POPOUT_CHANNEL);
    popChan.current = bc;
    bc.onmessage = (e: MessageEvent<PopMsg>) => {
      if (e.data.t !== 'hello') return;
      sendPop();
      const t = ta.current; if (t) bc.postMessage({ t: 'scroll', line: (t.scrollTop - PAD) / lhRef.current + 1 } satisfies PopMsg);
    };
    const theme = (e: StorageEvent) => { const t = themeForStorageEvent(e.key, e.newValue, matchMedia('(prefers-color-scheme: dark)').matches); if (t) document.documentElement.dataset['theme'] = t; };
    window.addEventListener('storage', theme);
    return () => { bc.close(); popChan.current = null; window.removeEventListener('storage', theme); };
  }, []);
  useEffect(() => { sendPop(); }, [html, fm, docStyle, dtx]);

  // ---- nhớ trạng thái giao diện (con trỏ, cuộn, chế độ xem): khôi phục khi tải lại, chỉ khi tài liệu chưa đổi ----
  const writeUi = () => {
    writeStringOk(KEYS.mdUi, JSON.stringify({ s: savedSel.current.s, e: savedSel.current.e, top: uiRef.current.zen ? prevTop.current : ta.current?.scrollTop ?? 0, view: uiRef.current.zen ? prevView.current : uiRef.current.view, n: srcRef.current.length }));
  };
  function scheduleUi() { clearTimeout(uiT.current); uiT.current = window.setTimeout(writeUi, 500); }
  const uiRef = useRef({ view, zen });
  uiRef.current = { view, zen };
  useEffect(() => { scheduleUi(); }, [pos, view, zen, src.length]);
  useEffect(() => {
    ta.current?.setSelectionRange(0, 0); // mặc định con trỏ ở đầu tài liệu (trình duyệt đặt ở cuối khi gán value)
    try {
      const raw = readString(KEYS.mdUi); if (!raw) return;
      const u = JSON.parse(raw) as { s?: number; e?: number; top?: number; view?: View; fm?: boolean; n?: number };
      if (u.view && (u.view !== 'split' || matchMedia('(min-width: 960px)').matches)) setView(u.view);
      const t = ta.current;
      if (t && u.n === t.value.length && typeof u.s === 'number') {
        t.setSelectionRange(u.s, u.e ?? u.s);
        t.scrollTop = u.top ?? 0;
        const before = t.value.slice(0, u.s);
        setPos({ ln: lineOf(t.value, u.s), col: u.s - before.lastIndexOf('\n') });
        layers(); updateWin();
        restored.current = true;
      }
    } catch { /* bỏ qua: trạng thái hỏng thì bắt đầu mới */ }
  }, []);

  const cycleSpell = () => { const n = SPELLS[(SPELLS.indexOf(spell) + 1) % SPELLS.length]!; setSpell(n); writeString(KEYS.mdSpell, n); say(`SPELLCHECK ${n.toUpperCase()}`); };
  const clampSplit = (n: number) => Math.min(75, Math.max(25, Math.round(n)));
  const setSplitSaved = (n: number) => { const v = clampSplit(n); setSplit(v); writeString(KEYS.mdSplit, String(v)); };
  const dragSplit = (ev: PointerEvent) => {
    const box = splitEl.current; if (!box) return;
    const sep = ev.currentTarget as HTMLElement;
    sep.setPointerCapture(ev.pointerId);
    const rect = box.getBoundingClientRect(), cs = getComputedStyle(box);
    const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0; // panel file của bản sao chiếm padding trái: tỉ lệ tính trên phần còn lại
    const at = (x: number) => clampSplit(((x - rect.left - pl) / (rect.width - pl - pr)) * 100);
    const move = (e: PointerEvent) => setSplit(at(e.clientX));
    const up = (e: PointerEvent) => { sep.removeEventListener('pointermove', move); sep.removeEventListener('pointerup', up); sep.removeEventListener('pointercancel', up); writeString(KEYS.mdSplit, String(at(e.clientX))); };
    sep.addEventListener('pointermove', move); sep.addEventListener('pointerup', up); sep.addEventListener('pointercancel', up);
    ev.preventDefault();
  };
  const setDocStyleSaved = (n: DocStyle) => { setDocStyle(n); writeString(KEYS.mdDoc, n); say(`DOCUMENT STYLE ${n.toUpperCase()}`); };
  const cycleDocStyle = () => setDocStyleSaved(DOC_STYLES[(DOC_STYLES.indexOf(docStyle) + 1) % DOC_STYLES.length]!);
  const setSpellSaved = (n: Spell) => { setSpell(n); writeString(KEYS.mdSpell, n); say(`SPELLCHECK ${n.toUpperCase()}`); };
  const toggleWrap = () => { setWrapPref(!wrapOn); writeString(KEYS.mdWrap, wrapOn ? '0' : '1'); };
  const toggleWide = () => { setWide(!wide); writeString(KEYS.mdWide, wide ? '0' : '1'); };
  const editing = view !== 'pv';
  // gạch chấm dưới phần chữ của dòng có cảnh báo (chế độ thường; zen xuống dòng mềm nên không vẽ)
  const lintBoxes = useMemo(() => {
    if (wrapped || !issueAt.size) return [];
    const out: { left: number; top: number; width: number; key: number }[] = [];
    const ls = src.split('\n');
    for (const n of issueAt.keys()) {
      if (n - 1 < win.from || n - 1 >= win.to) continue;
      const l = ls[n - 1] ?? '';
      const lead = cols(/^\s*/.exec(l)?.[0] ?? '');
      const w = Math.max(2, cols(l) - lead);
      out.push({ left: PAD + lead * cw, top: PAD + (n - 1) * lh, width: w * cw, key: n });
    }
    return out;
  }, [wrapped, issueAt, win.from, win.to, cw, lh, src]);
  const onGutClick = (ev: MouseEvent) => {
    const n = Number((ev.target as HTMLElement).closest<HTMLElement>('[data-ln]')?.dataset['ln']);
    if (!n) return;
    goToLine(n);
  };
  // vị trí menu `/`: ngay dưới dòng con trỏ; gần đáy khung thì lật lên trên
  const slashPos = useMemo(() => {
    const t = ta.current;
    if (!slash || !t) return null;
    let left: number, top: number, h: number;
    if (wrapped) { const b = caretBox(t, slash.start); left = b.x; top = b.top - t.scrollTop; h = b.h; }
    else {
      const ls = src.lastIndexOf('\n', slash.start - 1) + 1;
      left = PAD + cols(src.slice(ls, slash.start)) * cw - t.scrollLeft;
      top = PAD + (lineOf(src, slash.start) - 1) * lh - t.scrollTop; h = lh;
    }
    const below = top + h + 4, menuH = Math.min(320, slashItems.length * 30 + 8);
    return { left: Math.max(4, Math.min(left, t.clientWidth - 260)), top: below + menuH > t.clientHeight && top - menuH - 4 > 0 ? top - menuH - 4 : below };
  }, [slash, slashItems.length, src, wrapped, cw, lh, win.from]);
  // thanh định dạng nổi khi bôi đen (ngoài zen; zen có thanh riêng): neo ở đầu vùng chọn, ngay trên dòng, lật xuống dưới nếu sát mép trên
  const selPos = useMemo(() => {
    const t = ta.current;
    if (!sel || zen || !focused || !t || view === 'pv' || wsBusy || sel.e - sel.s > 20000) return null;
    let left: number, top: number, h: number;
    if (wrapped) { const b = caretBox(t, sel.s); left = b.x; top = b.top - t.scrollTop; h = b.h; }
    else { const ls = src.lastIndexOf('\n', sel.s - 1) + 1; left = PAD + cols(src.slice(ls, sel.s)) * cw - t.scrollLeft; top = PAD + (lineOf(src, sel.s) - 1) * lh - t.scrollTop; h = lh; }
    if (top < -h || top > t.clientHeight) return null; // dòng đầu vùng chọn đã cuộn ra ngoài khung
    const W = 200; // thanh nổi + nút ⋯
    return { left: Math.max(4, Math.min(left, t.clientWidth - W - 4)), top: top - 38 >= 2 ? top - 38 : top + h + 6 };
  }, [sel, zen, focused, view, wrapped, cw, lh, src, zTick, wsBusy]);
  useEffect(() => { if (!selPos) setSelMenu(false); }, [selPos]); // bỏ chọn chữ thì menu ⋯ đóng theo
  // thanh sửa bảng: hiện khi con trỏ ở trong bảng (chế độ thường), nổi ở góc dưới phải ô soạn để không che bảng hay dòng quanh nó
  const tcell = useMemo(() => {
    const t = ta.current;
    if (zen || !focused || !t || view === 'pv') return null;
    return tableCellAt(src, t.selectionStart);
  }, [zen, focused, view, src, pos]);
  // thanh bảng nổi ngay cạnh bảng: bên phải dòng đầu của bảng nếu còn chỗ (không che chữ), không thì ngay phía trên (hoặc dưới) bảng
  const tbarPos = useMemo(() => {
    const t = ta.current;
    if (!tcell || !t) return null;
    const rg = tableRangeAt(src, t.selectionStart);
    if (!rg) return null;
    const [a0, b0] = rg, last = Math.max(a0, b0 - 1), H = 34, W = 336;
    let top: number, bottom: number;
    if (wrapped) { const ba = caretBox(t, a0), bb = caretBox(t, last); top = ba.top - t.scrollTop; bottom = bb.top - t.scrollTop + bb.h; }
    else { top = PAD + (lineOf(src, a0) - 1) * lh - t.scrollTop; bottom = PAD + lineOf(src, last) * lh - t.scrollTop; }
    // chỗ trống bên phải bảng: ngắt dòng thì đo từng dòng bảng bằng caretBox (dòng bị ngắt thành nhiều hàng thì coi như không còn chỗ)
    let right = 0, tooWide = false;
    if (wrapped) {
      let off = a0;
      for (const l of src.slice(a0, b0).split('\n')) { const x0 = caretBox(t, off), x1 = caretBox(t, off + l.length); if (x1.top !== x0.top) tooWide = true; right = Math.max(right, x1.x); off += l.length + 1; }
    } else right = PAD + Math.max(...src.slice(a0, b0).split('\n').map((l) => cols(l))) * cw - t.scrollLeft;
    const left = right + 20;
    if (!tooWide && left + W <= t.clientWidth - 8 && top >= 0 && top + H <= t.clientHeight) return { top: Math.max(2, top - 4), left };
    return { top: top - H - 4 >= 2 ? top - H - 4 : Math.max(2, Math.min(bottom + 6, t.clientHeight - H - 4)), left: 12 };
  }, [tcell, src, wrapped, lh, cw, pos]);
  const runTableOp = (op: TableOp) => { const t = ta.current; if (!t) return; const r = tableOp(t.value, t.selectionStart, op); if (r) commit(r); else say(op === 'row-del' ? 'THE HEADER ROW STAYS' : 'CANNOT REMOVE THE LAST COLUMN'); };
  /** Outline: thả mục đang kéo trước mục ở dòng `before` (0 = cuối tài liệu). */
  const dropSection = (before: number) => {
    const from = dragLine; setDragLine(0); setDropLine(-1);
    if (!from || from === before) return;
    const t = ta.current; if (!t) return;
    const r = moveSection(t.value, from, before);
    if (!r) { say('CANNOT MOVE A SECTION INTO ITSELF'); return; }
    commit(r); say('MOVED SECTION');
  };
  const nudgeSection = (line: number, dir: 1 | -1) => {
    const t = ta.current; if (!t) return;
    const r = swapSection(t.value, line, dir);
    if (!r) return;
    railFocus.current = lineOf(r.text, r.start);
    commit(r);
  };
  useEffect(() => { // sau khi chuyển mục bằng phím: giữ focus ở đúng mục trong outline
    const ln = railFocus.current; if (!ln) return;
    const b = railBox.current?.querySelector<HTMLElement>(`[data-line="${ln}"]`);
    if (b) { railFocus.current = 0; b.focus(); }
  }, [heads]);
  const trailing = issues.filter((i) => i.message === 'Trailing whitespace').length;
  const nameShown = editName ?? fileName;

  // ≥900px: nút Split của nhóm chế độ nằm đúng trên trục đường chia (Split) hoặc giữa cột nội dung (Edit, Read), đo từ DOM, ngay trong thanh tài liệu (hàng 2); kẹp để không đè tên file hay mép phải; không đủ chỗ thì data-seam="flow" và nhóm dồn về bên phải. Dưới 900px nhóm ở sau tên file.
  useEffect(() => {
    const bar = root.current?.querySelector('.pv-bar') as HTMLElement | null;
    const splitNode = splitEl.current;
    if (!bar || !splitNode || !slots.aa) return;
    const place = () => {
      const seg = bar.querySelector('.pv-seg') as HTMLElement | null;
      if (!seg) return;
      const sr = splitNode.getBoundingClientRect();
      const panel = ws && wsOpen ? (splitNode.querySelector('.wp') as HTMLElement | null) : null;
      const panelW = panel ? panel.getBoundingClientRect().width : 0;
      const sep = splitNode.querySelector('.pv-sep') as HTMLElement | null;
      const sepR = view === 'split' && sep ? sep.getBoundingClientRect() : null;
      const insp = inspOpen ? (splitNode.querySelector('.pv-insp') as HTMLElement | null) : null;
      const rightW = insp && getComputedStyle(insp).display !== 'none' ? insp.getBoundingClientRect().width : 0;
      const x = sepR && sepR.width > 0 ? sepR.left + sepR.width / 2 : seamCenter({ left: sr.left, width: sr.width }, split / 100, view, panelW, rightW);
      const br = bar.getBoundingClientRect();
      const segR = seg.getBoundingClientRect();
      const btn = (seg.querySelector('.pv-desk') as HTMLElement | null)?.getBoundingClientRect();
      const off = btn && btn.width > 0 ? btn.left + btn.width / 2 - segR.left : segR.width / 2; // từ mép trái nhóm tới tâm nút Split (hoặc tâm nhóm khi Split ẩn)
      bar.style.setProperty('--seg-off', `${off}px`);
      const leftEdges = ['.pv-title', '.pv-menuwrap-l'].map((q) => (bar.querySelector(q) as HTMLElement | null)?.getBoundingClientRect().right ?? br.left); // tên file và nút menu File ▾ đứng sau nó
      const left = Math.max(...leftEdges) + 12;
      const right = br.right - 12;
      const lo = left + off, hi = right - (segR.width - off);
      if (lo > hi) bar.dataset['seam'] = 'flow';
      else { bar.dataset['seam'] = 'seam'; bar.style.setProperty('--seam-x', `${Math.min(hi, Math.max(lo, x)) - br.left}px`); }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(splitNode); ro.observe(bar);
    for (const q of ['.pv-title', '.pv-menuwrap-l']) { const n = bar.querySelector(q); if (n) ro.observe(n); }
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); delete bar.dataset['seam']; bar.style.removeProperty('--seam-x'); bar.style.removeProperty('--seg-off'); };
  }, [slots.aa, slots.ex, view, split, wsOpen, ws, zen, wide, inspOpen, InspC, fileName]);

  const inspBtn = (
    <button type="button" class="pv-btn pv-ic pv-insp-btn" aria-label="Inspector" aria-pressed={inspOpen} title="Inspector (⇧⌘\)" onClick={toggleInsp}><Icon n="insp" /></button>
  );
  const viewEl = (
    <span class="pv-menuwrap">
      <button type="button" class="pv-btn pv-ic" aria-haspopup="true" aria-expanded={menu === 'view'} aria-label="View options" title="View settings" onClick={() => setMenu(menu === 'view' ? '' : 'view')}><Icon n="gear" /></button>
      {menu === 'view' && (
        <div class="pv-menu pv-menu-view">
          <div class="pv-menu-h" role="presentation">DOCUMENT STYLE</div>
          {DOC_STYLES.map((d) => <button key={d} type="button" aria-pressed={docStyle === d} onClick={() => { setMenu(''); setDocStyleSaved(d); }}>{DOC_LABEL[d]}<span>{DOC_HINT[d]}</span></button>)}
          <button type="button" onClick={() => { setMenu(''); setXd({ k: 'theme', p: {} }); }}>Theme…<span>{dt && !isNewsprint(dt.t) ? 'custom' : 'colors, font'}</span></button>
          <div class="pv-menu-h" role="presentation">PREVIEW WIDTH</div>
          <button type="button" aria-pressed={!wide} onClick={() => { setMenu(''); if (wide) toggleWide(); }}>Narrow<span>reading column</span></button>
          <button type="button" aria-pressed={wide} onClick={() => { setMenu(''); if (!wide) toggleWide(); }}>Wide<span>tables, code</span></button>
          <div class="pv-menu-h pv-nophone" role="presentation">SPLIT VIEW</div>
          <button type="button" class="pv-nophone" aria-pressed={cursorMark} onClick={() => { setMenu(''); const n = !cursorMark; setCursorMark(n); writeString(KEYS.mdCursor, n ? '1' : '0'); }} title="Mark the block in the preview that matches the line your cursor is on">Cursor marker<span>{cursorMark ? 'on' : 'off'}</span></button>
          <div class="pv-menu-h" role="presentation">SOURCE</div>
          <button type="button" aria-pressed={wrapOn} onClick={() => { setMenu(''); toggleWrap(); }}>Wrap lines<span>{wrapOn ? 'on' : 'off'}</span></button>
          <button type="button" aria-pressed={authOn} onClick={() => { setMenu(''); toggleAuth(); }} title="Mark pasted and dropped text in the editor. Local, approximate, not proof">Authorship marks<span>{authOn ? 'on' : 'off'}</span></button>
          <div class="pv-menu-h" role="presentation">SPELLCHECK</div>
          {SPELLS.map((v) => <button key={v} type="button" aria-pressed={spell === v} onClick={() => { setMenu(''); setSpellSaved(v); }}>{SPELL_LABEL[v]}</button>)}
          <div class="pv-menu-h" role="presentation">WINDOW</div>
          <button type="button" onClick={() => { setMenu(''); popOut(); }}>Pop out preview<span>linked window</span></button>
        </div>
      )}
    </span>
  );
  const exportEl = (
    <span class="pv-menuwrap pv-exportwrap">
      <button type="button" class="pv-btn pv-solid pv-hact" aria-haspopup="true" aria-expanded={menu === 'export'} aria-label="Export" title="Export" onClick={() => setMenu(menu === 'export' ? '' : 'export')}><Icon n="download" s={14} /><span class="lbl">Export</span></button>
      {menu === 'export' && (
        <div class="pv-menu">
          {exportItems.map((it) => (
            <button key={it.label} type="button" onClick={() => { setMenu(''); it.run(); }}>{it.label}{it.hint && <span>{it.hint}</span>}</button>
          ))}
        </div>
      )}
    </span>
  );

  const aaEl = (<>{viewEl}{inspBtn}</>);
  // New: đang sửa bản sao skill thì "New" là tạo file mới trong bản sao (mở form của panel), không xoá file đang mở
  const newDoc = () => {
    setMenu(''); if (ws) { setWsOpen(true); emit('ws-new'); return; }
    if (src.trim()) { setNewAsk('new'); return; }
    doNew(); };
  const doNew = () => { setNewAsk(''); replaceDoc('', 'NEW DOCUMENT', undefined, 'Started a new document. Earlier text: Open ▾ → Restore previous'); };
  // Clear: xoá hết chữ của tài liệu đang mở, hỏi trước (cùng hộp với New). Bản cũ được cất: Open ▸ Restore previous, và thanh Undo hiện sau khi xoá.
  // Bài mẫu không phải của khách nên xoá thẳng. Khi đang sửa bản sao skill thì không có "Clear" (New ở đó là tạo file trong bản sao).
  const doClear = () => { setNewAsk(''); replaceDoc('', 'CLEARED', undefined, 'Cleared the document. Earlier text: Open ▾ → Restore previous'); ta.current?.focus(); };
  const clearDoc = () => {
    setMenu('');
    if (ws) { say('Clear is not available while you edit a copy'); return; }
    if (!src.trim()) { say('Nothing to clear'); return; }
    if (src === SAMPLE) { doClear(); return; }
    setNewAsk('clear');
  };
  const filesEl = (
    <>
      {ws && <button type="button" class="appbar-btn appbar-ic pv-files-btn" aria-label="Files" aria-pressed={wsOpen} title="Files of this copy (⌘\)" onClick={() => setWsOpen(!wsOpen)}><Icon n="panelL" /></button>}
      <button type="button" class="appbar-btn appbar-act" aria-label="New document" title={ws ? 'New file in this copy' : 'New document'} onClick={newDoc}><Icon n="fplus" /><span class="lbl">New</span></button>
      <span class="pv-menuwrap pv-openwrap">
        <button type="button" class="appbar-btn appbar-act" aria-haspopup="true" aria-expanded={menu === 'open'} aria-label="Open menu" title="Open a file, a link or a skill" onClick={() => setMenu(menu === 'open' ? '' : 'open')}><Icon n="folder" /><span class="lbl">Open</span><Icon n="chev" s={14} /></button>
        {menu === 'open' && (
          <div class="pv-menu pv-menu-open">
            <button type="button" onClick={() => { void openFile(); }}>Open…</button>
            <button type="button" onClick={openFromUrl}>Open URL…</button>
            <a class="pv-menu-link" href={url('/app/inspect/')} title="Inspect a skill, then edit a copy">Open a skill…</a>
            <button type="button" onClick={() => openVault(true)} title="A folder of Markdown notes with [[wikilinks]], to publish as a static site">Open folder as vault…</button>
            <button type="button" onClick={() => openVault(false)} title="A zip of Markdown notes with [[wikilinks]], to publish as a static site">Open zip as vault…</button>
            {recentDocs().length > 0 && <div class="pv-menu-h" role="presentation">Recent</div>}
            {recentDocs().map(({ snap, title }) => <button key={snap.id} type="button" class="pv-menu-sub" title="Open this document again; the current one goes to Restore previous" onClick={() => { setMenu(''); replaceDoc(snap.text, 'OPENED ' + title, { ...(snap.name ? { name: snap.name } : {}), reason: 'recent', snapshot: false }, `Opened ${title}`); }}>{title}<span>{ago(snap.t)}</span></button>)}
            {hasPrev && <button type="button" onClick={() => { setMenu(''); restore(); }} title="Swap with the document you had before">Restore previous<span>{prevTitle()}</span></button>}
          </div>
        )}
      </span>
    </>
  );
  const [fileSlot] = useState<HTMLElement | null>(() => document.getElementById('appbar-slot-files'));

  const fileUp = !!fileSlot && matchMedia('(min-width: 900px)').matches; // desktop: File nằm hàng 1 cạnh New/Open
  const fileMenuEl = (
            <span class="pv-menuwrap pv-menuwrap-l">
              <button type="button" class={fileUp ? 'appbar-btn appbar-act' : 'pv-btn pv-ic'} aria-haspopup="true" aria-expanded={menu === 'file'} aria-label="File menu" title="File menu: save, export, find and more" onClick={() => setMenu(menu === 'file' ? '' : 'file')}><span class={fileUp ? 'lbl' : 'pv-fl'} aria-hidden="true">File</span><Icon n="chev" /></button>
              {menu === 'file' && (
                <div class="pv-menu pv-menu-file">
                  <div class="pv-menu-doc"><b>{fileName}</b><span>{dirty ? 'Unsaved changes' : saveInfo.ok ? (saveInfo.t ? `Saved ${saveInfo.t} in this browser` : 'Saved in this browser') : 'Not saved: browser storage is full or blocked'}</span></div>
                  {fh.current && <button type="button" onClick={() => { setMenu(''); void save(); }}>Save<span>⌘/Ctrl+S</span></button>}
                  <button type="button" onClick={() => { void saveAs(); }}>Save as…</button>
                  <div class="pv-menu-sep" role="separator" />
                  <button type="button" aria-expanded={tplOpen} onClick={(ev) => { if (performance.now() - tplHover.current > 600) { setTplOpen(!tplOpen); sheetTop(ev.currentTarget as HTMLElement); } }} onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !tplOpen) { tplHover.current = performance.now(); setTplOpen(true); } }}>New from template<span aria-hidden="true">{tplOpen ? '▾' : '▸'}</span></button>
                  {tplOpen && TEMPLATES.map((t) => <button key={t.id} type="button" class="pv-menu-sub" title={t.hint} onClick={() => newFromTemplate(t.id)}>{t.label}</button>)}
                  <button type="button" onClick={() => { setMenu(''); setHistOpen(false); setAssetsOpen(true); }} title="Pasted images, stored in this browser">Images…</button>
                  <button type="button" class="pv-menu-phone" aria-expanded={expOpen} onClick={(ev) => { setExpOpen(!expOpen); sheetTop(ev.currentTarget as HTMLElement); }}>Export<span aria-hidden="true">{expOpen ? '▾' : '▸'}</span></button>
                  {expOpen && exportItems.map((it) => <button key={it.label} type="button" class="pv-menu-sub pv-menu-phone" onClick={() => { setMenu(''); it.run(); }}>{it.label}</button>)}
                  <button type="button" class="pv-menu-phone" disabled={!editing} onClick={() => { setMenu(''); openFind(); }}>Find</button>
                  <button type="button" class="pv-menu-phone" onClick={() => { setMenu(''); present(false); }}>Present</button>
                  <button type="button" class="pv-menu-phone" disabled={!editing || !canUndo} onClick={() => { setMenu(''); stepHistory(false); }}>Undo</button>
                  <button type="button" class="pv-menu-phone" disabled={!editing || !canRedo} onClick={() => { setMenu(''); stepHistory(true); }}>Redo</button>
                  {hasPrev && <button type="button" onClick={() => { setMenu(''); restore(); }} title="Swap with the document you had before">Restore previous<span>{prevTitle()}</span></button>}
                  <button type="button" onClick={() => { setMenu(''); installApp(); }} title="Install mdprev as an app; it then works offline">Install app</button>
                  <button type="button" onClick={() => { setMenu(''); loadSample(); }} title="A short document that shows what the editor can do">Sample</button>
                  {!ws && src.trim() !== '' && <button type="button" onClick={clearDoc} title="Remove all text. It stays in Open ▾ → Restore previous">Clear document</button>}
                  <p class="pv-menu-note">Your document is saved in this browser only. Save as… writes a file.</p>
                </div>
              )}
            </span>
  );
  // nhóm chế độ: ≥900px nằm giữa header (căn theo trục đường chia), dưới đó ở trong thanh tài liệu
  const modesEl = (
    <span class="pv-seg" role="group" aria-label="View mode">
            {matchMedia('(min-width: 960px)').matches
              ? <>
            <button type="button" aria-label="Edit" title="Edit: source only" aria-pressed={view === 'src'} onClick={() => chooseView('src')}><Icon n="pencil" s={15} /><span class="lbl">Edit</span></button>
            <button type="button" class="pv-zenseg" aria-label="Zen" aria-pressed={zen} title="Zen: a quiet reading column (Esc, then f). Alt+V to write" onClick={toggleZen}><Icon n="zen" s={15} /><span class="lbl">Zen</span></button>
            <button type="button" class="pv-desk" aria-label="Split" title="Split: source and preview" aria-pressed={view === 'split'} onClick={() => chooseView('split')}><Icon n="split" s={15} /><span class="lbl">Split</span></button>
            <button type="button" aria-label="Read" title="Read: preview only" aria-pressed={view === 'pv'} onClick={() => chooseView('pv')}><Icon n="read" s={15} /><span class="lbl">Read</span></button>
            <button type="button" class="pv-presentseg" aria-label="Present" title="Present as slides (S)" onClick={() => present(false)}><Icon n="play" s={14} /><span class="lbl">Present</span></button>
              </>
              : <>
            <button type="button" aria-label="Edit" title="Edit: source only" aria-pressed={view === 'src'} onClick={() => chooseView('src')}><Icon n="pencil" s={15} /><span class="lbl">Edit</span></button>
            <button type="button" aria-label="Read" title="Read: preview only" aria-pressed={view === 'pv'} onClick={() => chooseView('pv')}><Icon n="read" s={15} /><span class="lbl">Read</span></button>
            <button type="button" class="pv-zenseg" aria-label="Zen" aria-pressed={zen} title="Zen: a quiet reading column (Esc, then f). Alt+V to write" onClick={toggleZen}><Icon n="zen" s={15} /><span class="lbl">Zen</span></button>
            <button type="button" class="pv-presentseg" aria-label="Present" title="Present as slides (S)" onClick={() => present(false)}><Icon n="play" s={14} /><span class="lbl">Present</span></button>
              </>}
          </span>
  );

  // Trang chủ đã có đúng một H1 trong HTML tĩnh (tiêu đề trang). Ở đó tên file không phải heading và H1 của bài preview hạ xuống
  // role=heading cấp 2, để DOM sau khi chạy JS vẫn chỉ có một <h1>. Ở /app/ giữ nguyên.
  const onHome = useRef(!!document.querySelector('.home-tool')).current;
  const Title = (onHome ? 'div' : 'h1') as 'h1';
  const barEl = (
    <div class="pv-bar" data-focus-hide>
          <Title class="pv-title">

            <span class="pv-sr">mdprev: </span>
            {ws && <span class="pv-crumb" title={wsPath ? `${ws.name} / ${wsPath}` : ws.name}>{ws.name}<i aria-hidden="true"> / </i></span>}
            <span class="pv-namewrap">
              <span class="pv-namemirror" aria-hidden="true">{nameShown + ' '}</span>
              <input class="pv-name" size={1} value={nameShown} title={nameShown} aria-label="File name" spellcheck={false}
                onFocus={() => setEditName(fileName)} onInput={(ev) => setEditName((ev.target as HTMLInputElement).value)} onBlur={commitName}
                onKeyDown={(ev) => { if (ev.isComposing) return; if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); else if (ev.key === 'Escape') { setEditName(null); (ev.target as HTMLInputElement).blur(); } }} />
            </span>
            {dirty && <span class="pv-dirty" title="Unsaved changes" role="img" aria-label="Unsaved changes">●</span>}
            {!dirty && saveInfo.ok && <span class="pv-sv" role="img" aria-label="Saved in this browser" title="Saved in this browser" />}
            {!dirty && saveInfo.ok && saveInfo.t && <span class="pv-svt" aria-hidden="true">Saved {saveInfo.t}</span>}
            {dirty && <span class="pv-svt pv-svt-w" aria-hidden="true">Unsaved</span>}
            {base && <a class="pv-from" href={base} target="_blank" rel="noopener noreferrer" title={base}>{sourceLabel(base)}</a>}
            {(canBack || canFwd) && (
              <span class="pv-histnav" role="group" aria-label="Linked documents">
                <button type="button" class="pv-linkbtn" aria-label="Back" title="Previous document" disabled={!canBack} onClick={() => goHistory(-1)}>←</button>
                <button type="button" class="pv-linkbtn" aria-label="Forward" title="Next document" disabled={!canFwd} onClick={() => goHistory(1)}>→</button>
              </span>
            )}
          </Title>
            {!fileUp && fileMenuEl}
          {modesEl}
          <span class="pv-acts">
            <GuideLink tool="markdown" />
            <input ref={file} type="file" accept=".md,.markdown,.txt,.textpack,text/markdown,text/plain" hidden aria-label="Choose a Markdown file" onChange={(ev) => { const i = ev.target as HTMLInputElement; onFile(i.files?.[0]); i.value = ''; }} />
            {slots.aa ? null : aaEl}
            {slots.ex ? null : exportEl}
          </span>
        </div>
    );
  const renderOutline = (embedded: boolean) => {
    // thu gọn nhánh (chỉ khi Inspector và chưa lọc): chữ trong nút giữ nguyên, mũi tên là ::after theo data-fold; bấm vào mép phải nút hoặc ←/→ để thu/mở
    const foldable = embedded && !railQ;
    const kids = (i: number) => foldable && (railItems[i + 1]?.level ?? 0) > railItems[i]!.level;
    const shown: { h: Head; i: number }[] = [];
    for (let i = 0, skip = 0; i < railItems.length; i++) {
      const h = railItems[i]!;
      if (skip && h.level > skip) continue;
      skip = foldable && olFold.has(h.line) && kids(i) ? h.level : 0;
      shown.push({ h, i });
    }
    const toggleFold = (line: number) => setOlFold((f) => { const n = new Set(f); if (n.has(line)) n.delete(line); else n.add(line); return n; });
    return (
    <nav class={embedded ? 'pv-outline' : 'pv-rail'} aria-label="Outline" ref={railBox}>
          <input class="pv-railq" ref={railInput} value={railQ} placeholder="Jump to heading" aria-label="Filter headings" spellcheck={false}
            onInput={(ev) => setRailQ((ev.target as HTMLInputElement).value)}
            onKeyDown={(ev) => {
              if (ev.isComposing) return;
              if (ev.key === 'ArrowDown') { ev.preventDefault(); setRailSel((i) => Math.min(railItems.length - 1, i + 1)); }
              else if (ev.key === 'ArrowUp') { ev.preventDefault(); setRailSel((i) => Math.max(0, i - 1)); }
              else if (ev.key === 'Enter') { ev.preventDefault(); const h = railItems[railSel]; if (h) (embedded && view === 'src' ? (goToLine(h.line), setRailQ('')) : jumpTo(h)); }
              else if (ev.key === 'Escape') { ev.preventDefault(); setRailQ(''); ta.current?.focus(); }
            }} />
          {railItems.length ? shown.map(({ h, i }) => (
            <button key={h.id} type="button" data-fold={kids(i) ? (olFold.has(h.line) ? 'closed' : 'open') : undefined} aria-expanded={kids(i) ? !olFold.has(h.line) : undefined} class={'pv-ol' + (railQ && i === railSel ? ' sel' : '') + (dropLine === h.line && dragLine && dragLine !== h.line ? ' drop' : '') + (dragLine === h.line ? ' drag' : '')}
              style={`padding-left:${16 + (Math.min(h.level, 3) - 1) * 14}px`} aria-current={active === h.id ? 'true' : undefined} data-line={h.line}
              title={railQ ? undefined : 'Drag to move the section, or Alt+↑/↓'}
              draggable={!railQ && editing} onDragStart={(ev) => { setDragLine(h.line); ev.dataTransfer?.setData('text/plain', String(h.line)); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(ev) => { if (!dragLine) return; ev.preventDefault(); setDropLine(h.line); }}
              onDrop={(ev) => { ev.preventDefault(); dropSection(h.line); }} onDragEnd={() => { setDragLine(0); setDropLine(-1); }}
              onKeyDown={(ev) => {
                if (ev.altKey && !railQ && editing && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); nudgeSection(h.line, ev.key === 'ArrowUp' ? -1 : 1); }
                else if (kids(i) && !ev.altKey && ((ev.key === 'ArrowLeft' && !olFold.has(h.line)) || (ev.key === 'ArrowRight' && olFold.has(h.line)))) { ev.preventDefault(); toggleFold(h.line); }
              }}
              onClick={(ev) => { if (kids(i) && ev.offsetX > (ev.currentTarget as HTMLElement).clientWidth - 28) { toggleFold(h.line); return; } if (embedded && view === 'src') { goToLine(h.line); setRailQ(''); } else jumpTo(h); }}>
              {h.level > 1 && <span class="pv-dim">└ </span>}{h.text}
            </button>
          )) : <p class="pv-olempty">{heads.length ? 'No match' : 'No headings'}</p>}
          {dragLine > 0 && <div class={'pv-oldrop' + (dropLine === 0 ? ' drop' : '')} onDragOver={(ev) => { ev.preventDefault(); setDropLine(0); }} onDrop={(ev) => { ev.preventDefault(); dropSection(0); }}>Move to the end</div>}
        </nav>
    );
  };
  return (
    <div class={'pv' + (wide ? ' pv-wide' : '')} lang="en" ref={root} data-pv data-sview={view} data-zen={zen ? '1' : undefined} data-wrap={wrapOn ? '1' : undefined} data-ws={ws ? '1' : undefined} data-wsbusy={wsBusy ? '1' : undefined} data-wsclosed={ws && !wsOpen ? '1' : undefined} data-insp={inspOpen ? '1' : undefined} data-zface={zen ? zp.face : undefined} data-zdim={zen ? zp.dim : undefined} data-zsize={zen ? zp.size : undefined} data-zcol={zen ? zp.col : undefined} data-zread={zen && zr ? '1' : undefined}>
      {newAsk && (
        <div class="pv-guard pv-urldlg" role="alertdialog" aria-label={newAsk === 'clear' ? 'Clear this document' : 'Start a new document'} data-focus-hide
          onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setNewAsk(''); ta.current?.focus(); } }}>
          <div class="pv-dlgh"><span class="pv-urllab">{newAsk === 'clear' ? 'Clear this document?' : 'Start a new document?'}</span><span class="pv-dlgsub">{newAsk === 'clear' ? 'All text is removed. It is kept: Open ▸ Restore previous brings it back.' : 'The current text is kept: Open ▸ Restore previous brings it back.'}</span></div>
          <span class="pv-guard-act"><button type="button" ref={(el) => el?.focus()} onClick={() => { setNewAsk(''); ta.current?.focus(); }}>Keep editing</button><button type="button" class="pv-guard-go" onClick={newAsk === 'clear' ? doClear : doNew}>{newAsk === 'clear' ? 'Clear document' : 'New document'}</button></span>
        </div>
      )}
      {urlDlg !== null && (
        <div class="pv-guard pv-urldlg" role="dialog" aria-label="Open from URL" data-focus-hide
          onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setUrlDlg(null); ta.current?.focus(); } else if (ev.key === 'Enter' && !ev.isComposing && (ev.target as HTMLElement).tagName === 'INPUT') { ev.preventDefault(); submitUrl(); } }}>
          <div class="pv-dlgh"><label class="pv-urllab" for="pv-url-in">Open a Markdown file from a link</label><span class="pv-dlgsub">A GitHub file link or any address of a .md file.</span></div>
          <div class="pv-field">
            <input id="pv-url-in" class="pv-urlin" type="url" inputMode="url" autoFocus spellcheck={false} placeholder="github.com/owner/repo/blob/main/README.md" value={urlDlg}
              aria-invalid={urlErr ? 'true' : undefined} aria-describedby={urlErr ? 'pv-url-err' : undefined} onInput={(ev) => { setUrlDlg((ev.target as HTMLInputElement).value); setUrlErr(''); }} />
            {urlErr && <span id="pv-url-err" class="pv-urlerr" role="alert">{urlErr}</span>}
          </div>
          <span class="pv-guard-act"><button type="button" onClick={() => { setUrlDlg(null); ta.current?.focus(); }}>Cancel</button><button type="button" class="pv-guard-go" onClick={submitUrl}>Open</button></span>
        </div>
      )}
      {xd && XC?.k === xd.k && <XC.C {...xd.p} copy={copyText} onClose={(t?: string) => { setXd(null); if (t) say(t); ta.current?.focus(); }}
        onOpen={(d: { md: string; theme?: unknown }) => openShared(d.md, d.theme ?? null)} current={dt?.t ?? {}} onTheme={(t: DocTheme) => themeOf(t, true)} src={src}
        onTemplate={(body: string, n: string) => { setXd(null); replaceDoc(body, 'NEW FROM ' + n.toUpperCase(), { reason: 'template' }, `Started from ${n}`); }} />}
      {pendingShare !== null && (
        <div class="pv-guard" role="alertdialog" aria-label="Open shared document" data-focus-hide>
          <span>Open the shared document from this link? It replaces the text on screen; yours stays in FILE → Restore previous. Images from other sites stay blocked until you allow them.</span>
          <span class="pv-guard-act"><button type="button" class="pv-guard-go" onClick={() => openShared()} autoFocus>OPEN</button><button type="button" onClick={() => { setPendingShare(null); say('SHARED DOCUMENT NOT OPENED'); }}>CANCEL</button></span>
        </div>
      )}
      {pendingShare === null && blockedN > 0 && (
        <div class="pv-guard" role="status" data-focus-hide>
          <span>{blockedN} image{blockedN > 1 ? 's' : ''} from other sites blocked in this shared document. Loading them tells those sites your IP address.</span>
          <span class="pv-guard-act"><button type="button" onClick={allowImages}>LOAD IMAGES</button></span>
        </div>
      )}
      {barEl}
      {fileSlot && createPortal(filesEl, fileSlot)}
      {fileSlot && fileUp && createPortal(fileMenuEl, fileSlot)}
      {slots.aa && createPortal(aaEl, slots.aa)}
      {slots.ex && createPortal(exportEl, slots.ex)}


      {phoneKeys && (
        <div class="pv-keys" aria-hidden="true" style={vvBottom === null ? 'bottom:0' : `top:${vvBottom - 44}px`}>
          {PHONE_KEYS.map(([id, label]) => <button key={id} type="button" tabIndex={-1} onPointerDown={(ev) => { ev.preventDefault(); apply(TOOLS[id]!.run); }}>{label}</button>)}
        </div>
      )}
      <div class="pv-split" data-view={view} ref={splitEl} style={`--pvr:${split}`}>
        {ws && PanelC && !zen && <PanelC {...panelProps()} />}
        {inspAvail && inspOpen && !InspC && <aside class="pv-insp" aria-label="Inspector" aria-busy="true" data-focus-hide />}
        {inspAvail && inspOpen && InspC && <InspC onFix={fixFrontmatter} focusLine={checkFocus} mode={skillMode ? 'skill' : 'doc'} report={skillRep} onOpenFinding={openFinding} tab={inspTab} onTab={pickInspTab} renderOutline={() => renderOutline(true)} fmRows={fm?.rows ?? []} onEditProp={editProp} issues={issues} onGoto={(l: number) => goToLine(l)} trailing={trailing} onFixTrailing={fixTrailingNow} src={lazy} goal={zp.goal} auth={authOn && auth.current ? auth.current.stats() : undefined} onAuthExport={() => { const j = auth.current?.json(); if (j) { download(withExt('authorship.json'), 'application/json', j); say('DOWNLOADED AUTHORSHIP RECORD'); } }} onAuthClear={() => { auth.current?.clear(); setAuthTick((n) => n + 1); say('AUTHORSHIP RECORD CLEARED'); }} renderHistory={() => <StudioHistory embedded initialTab={histSub.current} onTab={(t) => { histSub.current = t; }} src={src} baseline={baseline} onApply={applyFromPanel} onJump={(l) => goToLine(l)} onSnapshot={snapshotNow} onClose={() => {}} />} />}
        <section class="pv-pane pv-src" aria-label="Editor">
          <div class="pv-tools" data-focus-hide role="toolbar" aria-label="Formatting" ref={toolsRef}>
            <span class="pv-grp pv-fixed" role="group" aria-label="History">
              <button type="button" class="pv-tool" title="Undo (Ctrl/⌘+Z)" aria-label="undo Undo (Ctrl/⌘+Z)" disabled={!editing || !canUndo} onClick={() => stepHistory(false)}><Icon n="undo" /></button>
              <button type="button" class="pv-tool" title="Redo (Ctrl/⌘+⇧+Z)" aria-label="redo Redo (Ctrl/⌘+⇧+Z)" disabled={!editing || !canRedo} onClick={() => stepHistory(true)}><Icon n="redo" /></button>
            </span>
            {GROUPS.map((g, gi) => gi >= toolCut ? null : (
              <span class="pv-grp" key={gi} role="group" aria-label={GROUP_NAMES[gi]}>
                {g.map((t) => (
                  <button key={t.id} type="button" class={'pv-tool ' + (t.cls ?? '')} title={t.title} aria-label={`${t.label} ${t.title}`} disabled={!editing} onClick={() => apply(t.run)}>{t.icon ? <Icon n={t.icon} /> : t.label}</button>
                ))}
              </span>
            ))}
            {toolCut < GROUPS.length && (
              <span class="pv-grp pv-more">
                <button type="button" class="pv-tool" aria-haspopup="menu" aria-expanded={toolMore !== null} aria-label="More formatting tools" title="More formatting tools" disabled={!editing}
                  onClick={(ev) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setToolMore(toolMore ? null : { left: Math.min(r.left, window.innerWidth - 220), top: r.bottom + 4 }); }}><Icon n="more" /></button>
                {toolMore && (
                  <div class="pv-menu pv-more-menu" role="menu" style={matchMedia('(max-width: 899px)').matches ? undefined : `position:fixed;left:${toolMore.left}px;top:${toolMore.top}px;right:auto;min-width:200px`}>
                    {GROUPS.slice(toolCut).flat().map((t) => (
                      <button key={t.id} type="button" role="menuitem" aria-label={`${t.label} ${t.title}`} onClick={() => { setToolMore(null); apply(t.run); }}>{t.title}<span>{t.icon ? <Icon n={t.icon} /> : t.label}</span></button>
                    ))}
                  </div>
                )}
              </span>
            )}
            <span class="pv-grp pv-right">
              <button type="button" class="pv-tool" title="Find and replace (Ctrl/⌘+F)" aria-label="find Find and replace (Ctrl/⌘+F)" aria-pressed={find.open} disabled={!editing} onClick={() => (find.open ? closeFind() : openFind())}><Icon n="find" /></button>
            </span>
          </div>
          {/* thanh SAMPLE nằm NGAY DƯỚI thanh công cụ: hộp Find định vị ở top:44px (ngay dưới thanh công cụ) nên chỉ che tạm thanh này, không đè lên thanh công cụ */}
          {src === SAMPLE && !sampleBarOff && !zen && !ws && (
            <div class="pv-samplebar" role="note" data-focus-hide>
              <span class="pv-sample-tag">SAMPLE</span><span class="pv-sample-txt">Example text, not yours. Edit it freely or clear it.</span>
              <button type="button" onClick={doClear}>Clear</button><button type="button" onClick={() => setSampleBarOff(true)}>Keep this</button>
            </div>
          )}
          {find.open && editing && (
            <StudioFind
              q={find.q} r={find.r} regex={find.regex} cs={find.cs} count={found.matches.length} idx={fIdx} error={found.error} status={found.timedOut ? 'timeout' : found.pending ? 'pending' : undefined} inputRef={findInput}
              onQ={(q) => setFind((f) => ({ ...f, q, idx: 0 }))} onR={(r) => setFind((f) => ({ ...f, r }))}
              onRegex={() => setFind((f) => ({ ...f, regex: !f.regex, idx: 0 }))} onCase={() => setFind((f) => ({ ...f, cs: !f.cs, idx: 0 }))}
              onNext={() => goMatch(fIdx + 1)} onPrev={() => goMatch(fIdx - 1)} onReplace={replaceCurrent} onReplaceAll={replaceEvery} onClose={closeFind}
            />
          )}
          <div class="ed">
            <div class="ed-gut" ref={gut} aria-hidden="true" onClick={onGutClick}>
              <div class="ed-gutin" style={`height:${lineCount * lh + 2 * PAD}px`}>
                <div class="ed-gutwin" style={`top:${PAD + win.from * lh}px`} dangerouslySetInnerHTML={{ __html: gutHtml }} />
              </div>
            </div>
            <div class={'ed-main' + (focused ? ' on' : '')}>
              <div class="ed-layer" aria-hidden="true">
                <div class="ed-inner" ref={inner}>
                  {!wrapped && <div class="ed-cur" style={`top:${PAD + (pos.ln - 1) * lh}px`} />}
                  {wrapped && !zen && curBox && <div class="ed-cur" style={`top:${curBox.top}px;height:${curBox.h}px`} />}
                  {boxes.map((b) => <i key={b.key} class={'ed-find' + (b.on ? ' on' : '')} style={`left:${b.left}px;top:${b.top}px;width:${b.width}px`} />)}
                  {lintBoxes.map((b) => <i key={b.key} class="ed-lint" style={`left:${b.left}px;top:${b.top}px;width:${b.width}px`} />)}
                  <pre class="ed-hl" style={`top:${win.from * lh}px`}>{hlChunks.map((h, i) => <HlChunk key={i} html={h} />)}</pre>
                </div>
              </div>
              <textarea
                ref={ta} class="ed-ta" value={src} wrap={wrapped ? 'soft' : 'off'} spellcheck={spell !== 'off'} lang="en" autocomplete="off" autocapitalize="off"
                readOnly={wsBusy || wsStale || (ws !== null && wsPath === null)} aria-label="Markdown, press Esc to leave the editor" placeholder="Write or paste Markdown, or type / for blocks"
                aria-autocomplete="list" aria-controls={slash && slashItems.length ? 'pv-slash' : undefined}
                aria-activedescendant={slash && slashItems.length ? `pv-slash-${Math.min(slash.sel, slashItems.length - 1)}` : undefined}
                onInput={(ev) => { const it = (ev as InputEvent).inputType; hist.current.redo = it === 'historyUndo' || (it === 'historyRedo' && hist.current.redo); lastInput.current = performance.now(); setSrc((ev.target as HTMLTextAreaElement).value); caret(); if (!(ev as InputEvent).isComposing) syncSlash(); }}
                onKeyDown={onKeyDown} onClick={onEdClick} onScroll={onEdScroll} onPaste={onPaste}
                onFocus={() => { setFocused(true); preloadTurndown(); }} onBlur={() => { setFocused(false); setSlash(null); }}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={(ev) => {
                  const fs = [...(ev.dataTransfer?.files ?? [])];
                  if (!fs.length) return;
                  ev.preventDefault();
                  const imgs = fs.filter((f) => f.type.startsWith('image/'));
                  if (imgs.length) insertImages(imgs); else onFile(fs[0]);
                }}
              />
              {tcell && !slash && (
                <div class="pv-tbar" role="toolbar" aria-label="Table" style={tbarPos ? `top:${tbarPos.top}px;left:${tbarPos.left}px` : undefined} onPointerDown={(ev) => ev.preventDefault()}>
                  <span class="pv-tbar-g">
                    <button type="button" title="Insert a row above" aria-label="+ above Insert a row above" onClick={() => runTableOp('row-above')}><Icon n="rowabove" /></button>
                    <button type="button" title="Insert a row below" aria-label="+ below Insert a row below" onClick={() => runTableOp('row-below')}><Icon n="rowbelow" /></button>
                    <button type="button" title="Delete this row" aria-label="delete Delete this row" disabled={tcell.row <= 1} onClick={() => runTableOp('row-del')}><Icon n="rowdel" /></button>
                  </span><span class="pv-tbar-g">
                    <button type="button" title="Insert a column to the left" aria-label="+ left Insert a column to the left" onClick={() => runTableOp('col-left')}><Icon n="colleft" /></button>
                    <button type="button" title="Insert a column to the right" aria-label="+ right Insert a column to the right" onClick={() => runTableOp('col-right')}><Icon n="colright" /></button>
                    <button type="button" title="Delete this column" aria-label="delete Delete this column" onClick={() => runTableOp('col-del')}><Icon n="coldel" /></button>
                  </span><span class="pv-tbar-g">
                  {(['left', 'center', 'right'] as const).map((a) => {
                    const sep = tcell.rows[1]?.[tcell.col] ?? '';
                    const on = a === 'left' ? sep.startsWith(':') && !sep.endsWith(':') : a === 'center' ? sep.startsWith(':') && sep.endsWith(':') && sep.length > 1 : !sep.startsWith(':') && sep.endsWith(':');
                    return <button key={a} type="button" aria-pressed={on} title={`Align this column ${a}`} aria-label={a} onClick={() => runTableOp(`align-${a}`)}><Icon n={a === 'left' ? 'alignleft' : a === 'center' ? 'aligncenter' : 'alignright'} /></button>;
                  })}
                  </span><span class="pv-tbar-g">
                    <button type="button" title="Sort rows by this column, ascending" aria-label="A-Z Sort rows by this column, ascending" onClick={() => runTableOp('sort-asc')}><Icon n="sortasc" /></button>
                    <button type="button" title="Sort rows by this column, descending" aria-label="Z-A Sort rows by this column, descending" onClick={() => runTableOp('sort-desc')}><Icon n="sortdesc" /></button>
                  </span>
                </div>
              )}
              {selPos && (
                <div class="pv-selbar" aria-hidden="true" style={`left:${selPos.left}px;top:${selPos.top}px`} onPointerDown={(ev) => ev.preventDefault()}>
                  <button type="button" tabIndex={-1} class="pv-b" onClick={() => apply(TOOLS['b']!.run)}>B</button>
                  <button type="button" tabIndex={-1} onClick={() => apply(TOOLS['i']!.run)}>I</button>
                  <button type="button" tabIndex={-1} class="pv-s" onClick={() => apply(TOOLS['s']!.run)}>S</button>
                  <i />
                  <button type="button" tabIndex={-1} onClick={() => apply(TOOLS['link']!.run)}><Icon n="link" /></button>
                  <button type="button" tabIndex={-1} onClick={() => apply(TOOLS['code']!.run)}><Icon n="code" /></button>
                  <button type="button" tabIndex={-1} aria-haspopup="menu" aria-expanded={selMenu} aria-label="More transforms" title="Transform selection" onClick={() => setSelMenu(!selMenu)}>⋯</button>
                  {selMenu && (
                    <div class="pv-selmenu" role="menu" aria-label="Transform selection">
                      {QUICK_TRANSFORMS.map((id) => <button key={id} type="button" role="menuitem" tabIndex={-1} onClick={() => { setSelMenu(false); runTransform(id); }}>{TRANSFORMS.find((t) => t.id === id)!.label}</button>)}
                      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { setSelMenu(false); emit('search', '>transform'); }}>All transforms…</button>
                    </div>
                  )}
                </div>
              )}
              {slash && slashItems.length > 0 && slashPos && (
                <ul class={'pv-slash' + (slash.kind === 'slash' ? '' : ' pv-comp')} id="pv-slash" ref={slashBox} role="listbox" aria-label={slash.kind === 'slash' ? 'Insert block' : slash.kind === 'anchor' ? 'Link to heading' : slash.kind === 'footnote' ? 'Footnotes' : 'Pasted images'} tabIndex={0} style={`left:${slashPos.left}px;top:${slashPos.top}px`} onPointerDown={(ev) => ev.preventDefault()}>
                  {slashItems.map((it, k) => (
                    <li key={it.id} id={`pv-slash-${k}`} role="option" aria-selected={k === Math.min(slash.sel, slashItems.length - 1)} class="pv-slash-i"
                      onClick={() => pickSlash(it)} onMouseEnter={() => setSlash({ ...slash, sel: k })}>
                      <span>{it.label}</span><i>{it.hint}</i>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <div class="pv-sep" role="separator" aria-orientation="vertical" aria-label="Resize editor and preview" aria-valuemin={25} aria-valuemax={75} aria-valuenow={split} tabIndex={0}
          title="Drag to resize, double-click to reset"
          onPointerDown={dragSplit} onDblClick={() => setSplitSaved(50)}
          onKeyDown={(ev) => { if (ev.key === 'ArrowLeft') { ev.preventDefault(); setSplitSaved(split - 2); } else if (ev.key === 'ArrowRight') { ev.preventDefault(); setSplitSaved(split + 2); } else if (ev.key === 'Home') { ev.preventDefault(); setSplitSaved(50); } }} />
        <section class="pv-pane pv-view" aria-label="Preview">
          <div class="pv-vb">
            <div class="pv-out" ref={out} tabIndex={0} onClick={onPreviewClick} onDblClick={onPreviewDbl} onScroll={onPvScroll}>
              <div class="pv-page" data-stale={pvStale ? '1' : undefined} aria-busy={pvStale ? 'true' : undefined}>
                {printToc && heads.length > 0 && (
                  <nav class="pv-ptoc" aria-label="Contents">
                    <p class="pv-ptoc-h">Contents</p>
                    <ol>{heads.filter((h) => h.level <= 3).map((h) => <li key={h.id} class={'l' + h.level}><a href={'#' + h.id}>{h.text}</a></li>)}</ol>
                  </nav>
                )}
                <article class="md-doc" ref={doc} data-doc={docStyle === 'default' ? undefined : docStyle} dangerouslySetInnerHTML={{ __html: onHome ? html.replace(/<h1(?=[\s>])([^>]*)>/g, '<div role="heading" aria-level="2" data-h1$1>').replace(/<\/h1>/g, '</div>') : html }} />
                <div class="pv-cur" ref={curBar} aria-hidden="true" hidden />
                {src.trim() === '' && !pvStale && <div class="pv-empty"><p>Nothing to preview yet. Write in the editor and the formatted page appears here.</p>
                  <span class="pv-empty-acts"><button type="button" class="pv-btn" onClick={loadSample}>Load sample</button><button type="button" class="pv-btn" onClick={() => { void navigator.clipboard?.readText().then((x) => { if (x.trim()) replaceDoc(x, 'PASTED', { snapshot: false }, 'Pasted from the clipboard'); else say('CLIPBOARD IS EMPTY'); }).catch(() => say('ALLOW CLIPBOARD ACCESS, OR PRESS CTRL/⌘+V IN THE EDITOR')); }}>Paste from clipboard</button><button type="button" class="pv-btn" onClick={() => { void openFile(); }}>Open a file…</button></span></div>}
              </div>
            </div>
          </div>
        </section>
        {welcomeUp && <div class="wc-host" onClick={onWelcomeClick}><WelcomeCard /></div>}
      </div>

      {zen && (
        <ZenCards
          name={fileName} words={st.words} chars={st.chars} prefs={zp} read={zr} show={zShow} menu={zMenu} sel={zSelPos} saved={saveInfo} dark={zDark} hint={zHint}
          selection={zSel && !zr ? (() => { const x = src.slice(zSel.s, zSel.e); return { words: (x.match(/\S+/g) ?? []).length, chars: x.length }; })() : null}
          main={ZEN_MAIN} more={ZEN_MORE} progress={zr ? zProg : null} onSave={ex('Download Markdown (.md)')} onPresent={present} onMove={(from, before) => { const t = ta.current; if (!t) return; const r = moveSection(t.value, from, before); if (r) { commit(r); say('MOVED SECTION'); } else say('CANNOT MOVE A SECTION INTO ITSELF'); }} heads={heads.filter((h) => h.level <= 3)} activeId={zr ? active : (heads.filter((h) => h.level <= 3 && h.line <= pos.ln).pop()?.id ?? '')} onTool={(id) => { const t = TOOLS[id]; if (t) apply(t.run); }}
          onMenu={setZMenu} onRead={setZr} onPrefs={setZp} onExit={toggleZen}
          onTheme={() => emit('theme')} onJump={(id) => { const h = heads.find((x) => x.id === id); if (!h) return; if (zr) jumpTo(h); else goToLine(h.line); }}
          onCopy={(k) => (k === 'sel' ? copyText(zSel ? src.slice(zSel.s, zSel.e) : '') : k === 'md' ? copyText(src) : k === 'plain' ? copyText(htmlToPlain(cleanHtml(html))) : fullHtml().then((x) => inlineAssets(cleanHtml(x))).then((h) => copyRich(h, src)))}
        />
      )}
      {undoBar && <div class="pv-toast" role="status" data-focus-hide><span>{undoBar}.</span><button type="button" onClick={undoReplace}>Undo</button><button type="button" class="pv-toast-x" aria-label="Dismiss" onClick={() => { clearTimeout(undoTimer.current); setUndoBar(null); }}>×</button></div>}
      <div class="pv-mode" data-focus-hide>
        <span class="pv-modetag" data-busy={busy ? '1' : undefined}><i class="pv-dot" aria-hidden="true" /><span>{busy ? 'RENDERING' : 'READY'}</span></span>
        {!online && <span class="pv-offline" title="No network. Editing, preview and export still work; Open URL and web images do not.">Offline</span>}
        <span class="pv-pos">Ln {pos.ln}, Col {pos.col}</span>
        <button type="button" class="pv-modebtn pv-words" title="Every word in the file, code and tables included. Click for Checks → Writing, which counts prose only." onClick={() => toggleInspTab(skillMode ? 'findings' : 'checks')}>{num(st.words)} words<span class="pv-more"> · {num(st.chars)} chars · {st.minutes} min</span></button>
        {inspAvail && lineIssue && <button type="button" class="pv-modebtn pv-curlint" title="Open this issue in Checks" aria-label={`Issue on this line: ${lineIssue[0]}`} aria-expanded={inspOpen && inspTab === 'checks' && checkFocus?.line === pos.ln} onClick={() => toggleInspTab('checks', pos.ln)}><span class="pv-warn" aria-hidden="true">!</span> {lineIssue[0]}</button>}
        <span class="pv-mode-r">
        {inspAvail && <button type="button" class="pv-modebtn pv-chk" title={skillMode ? 'Open Findings in the inspector' : 'Open Checks in the inspector'} aria-expanded={inspOpen && inspTab === (skillMode ? 'findings' : 'checks')} onClick={() => toggleInspTab(skillMode ? 'findings' : 'checks')}>{skillMode ? (skillRep && skillRep.findings.length ? <><span class="pv-warn" aria-hidden="true">!</span> {skillRep.findings.length} {skillRep.findings.length === 1 ? 'finding' : 'findings'}</> : <><span class="pv-ok" aria-hidden="true">✓</span> No findings</>) : issues.length ? <><span class="pv-warn" aria-hidden="true">!</span> {issues.length} {issues.length === 1 ? 'issue' : 'issues'}</> : <><span class="pv-ok" aria-hidden="true">✓</span> No issues</>}</button>}
        {inspAvail && <span class="pv-sr" role="status" aria-live="polite">{skillMode ? (skillRep && skillRep.findings.length ? `${skillRep.findings.length} ${skillRep.findings.length === 1 ? 'finding' : 'findings'}` : 'No findings') : issues.length ? `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}` : 'No issues'}</span>}
        <button type="button" class="pv-modebtn" title="Changes since the last save and version history" aria-expanded={inspAvail && !skillMode ? inspHistory : histOpen} disabled={!editing} onClick={() => { if (inspAvail && !skillMode) { toggleInspTab('history'); return; } setHistOpen(!histOpen); }}>changes</button>
        <span role="status" aria-live="polite" class="pv-mode-s">
  {saveInfo.ok ? (saveInfo.t && <span class="pv-sr">Saved {saveInfo.t}</span>) : <span class="pv-warn">Not saved · browser storage is full or blocked, use Export</span>}
          {flash && <span class="pv-flash">{flash}</span>}
        </span>
        {view === 'split' && <button type="button" class="pv-modebtn pv-sync" aria-pressed={syncOn} aria-label="Sync scroll" title={syncOn ? 'Sync scroll: on. Source and preview scroll together' : 'Sync scroll: off. Source and preview scroll on their own'} onClick={toggleSync}><Icon n={syncOn ? 'sync' : 'syncoff'} s={14} /></button>}
        </span>
      </div>
      {assetsOpen && <StudioAssets src={src} say={say} onClose={() => { setAssetsOpen(false); refreshAssets(); ta.current?.focus(); }}
        onInsert={(id, name) => { const t = ta.current; if (!t) return; const md = `![${altFromName(name)}](asset:${id})`; const s = t.selectionStart, e = t.selectionEnd; commit({ text: t.value.slice(0, s) + md + t.value.slice(e), start: s + md.length, end: s + md.length }); }} />}
      {histOpen && editing && !inspHistory && <StudioHistory src={src} baseline={baseline} onApply={applyFromPanel} onJump={(l) => goToLine(l)} onSnapshot={snapshotNow} onClose={() => setHistOpen(false)} />}
      {menu && <div class="pv-scrim" aria-hidden="true" onClick={(ev) => { ev.preventDefault(); setMenu(''); }} />}
      {slides && <StudioSlides key={slides.k} html={html} start={slides.start} doc={docStyle} dt={slideDt} onClose={closeSlides} onPrint={() => { void fullHtml().then(printSlides); }} />}
    </div>
  );
}
