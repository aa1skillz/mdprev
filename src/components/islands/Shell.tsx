import { useEffect, useRef, useState } from 'preact/hooks';
import { emit, on } from '../../lib/bus';
import { handleKey } from '../../lib/keys';
import { followSystem, isDark, setDark } from '../../lib/prefs';
import { Icon } from './icons';

type Help = [string, string];
const HELP: Help[] = [
  ['⌘/Ctrl /', 'command palette, anywhere (a bare / works outside text)'], ['?', 'keyboard shortcuts'], ['d', 'light / dark'], ['esc', 'close dialog'],
];
/** Phím của editor, chia nhóm để dễ tìm. */
const STUDIO_GROUPS: [string, Help[]][] = [
  ['Write', [
    ['⌘/Ctrl B I K', 'bold, italic, link'], ['⌘/Ctrl F', 'find and replace'], ['⌘/Ctrl S', 'save'], ['⌘/Ctrl Z', 'undo'],
    ['/', 'insert a block (at the start of a line)'], ['alt ↑ ↓', 'move line, or section in the outline'], ['⇧ alt ↑ ↓', 'duplicate line'], ['⌘/Ctrl ⇧ K', 'delete line'],
    ['⌘/Ctrl L', 'select line'], ['⌘/Ctrl D', 'select word, then next match'], ['tab', 'indent list item, next table cell'], ['enter', 'continue a list or quote, new table row'],
    ['⌘/Ctrl K, >table', 'table: rows, columns, align, sort'], ['⌘/Ctrl click', 'follow link (#heading, URL, .md)'],
  ]],
  ['Navigate', [['⌘/Ctrl ⇧ O · o', 'jump to heading'], ['⌘/Ctrl \\', 'file panel (skill copy)'], ['⌘/Ctrl ⇧ \\', 'inspector']]],
  ['Zen and present', [
    ['esc, then f', 'zen mode'], ['alt+v · v', 'zen: switch between write and read'],
    ['esc, then s', 'present from the start (g grid, n notes, b blank, p presenter)'], ['⇧S · alt+p', 'present from the current slide'],
  ]],
];
/** Chuỗi phím thành các ô <kbd>; dấu phẩy, "then" và dấu chấm giữa giữ là chữ thường. */
const keys = (k: string) => k.split(' ').map((t, i) => (t === ',' || t === 'then' || t === '·' || t.endsWith(',') ? <span key={i} class="hp-sep">{t}</span> : <kbd key={i}>{t}</kbd>));

const viewOf = () => document.body.dataset['view'] ?? '';

/** Island toàn cục: phím tắt, bảng phím, hộp chép thủ công, sáng/tối. */
export default function Shell() {
  const [help, setHelp] = useState(false);
  const [fb, setFb] = useState<string | null>(null);
  const helpFrom = useRef<HTMLElement | null>(null);
  useEffect(() => { // hộp ?: đóng thì trả focus về chỗ đã mở nó (nếu còn), không để rơi về <body>
    if (help) { helpFrom.current = document.activeElement as HTMLElement | null; return; }
    const el = helpFrom.current; helpFrom.current = null;
    if (el && el !== document.body && el.isConnected) el.focus({ preventScroll: true });
  }, [help]);
  const searchOpen = useRef(false);
  const fbRef = useRef<HTMLTextAreaElement>(null);

  const toggleTheme = () => setDark(!isDark());

  useEffect(() => {
    const offs = [
      on('help', () => setHelp(true)), on('theme', toggleTheme), on('theme-system', followSystem),
      on<string>('copy-fallback', (t) => { setFb(t); setTimeout(() => { fbRef.current?.focus(); fbRef.current?.select(); }, 80); }),
      on<boolean>('search-state', (open) => { searchOpen.current = !!open; }),
    ];
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return; // đang gõ bằng IME (Telex...): không coi là phím tắt
      if (viewOf() === 'markdown-popout' || viewOf() === 'markdown-presenter') return; // cửa sổ pop-out và presenter có phím riêng
      const t = e.target as HTMLElement | null;
      const r = handleKey({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, targetTag: t?.tagName ?? '' }, searchOpen.current);
      const a = r.action;
      if (r.preventDefault) e.preventDefault();
      if (a.type === 'help') setHelp(true);
      else if (a.type === 'theme') toggleTheme();
      else if (a.type === 'escape') { setHelp(false); setFb(null); emit('key', a); }
      else if (a.type === 'search') emit('search', true);
      else if (a.type !== 'none') emit('key', a);
    };
    window.addEventListener('keydown', onKey);
    // tooltip chung: thay tooltip gốc bằng một phần tử duy nhất (không bị cắt trong khung overflow); title được cất đi lúc hiện và trả lại khi ẩn nên tên truy cập và test không đổi
    let tip: HTMLDivElement | null = null, cur: HTMLElement | null = null, timer = 0;
    const hide = () => {
      clearTimeout(timer);
      if (tip) tip.hidden = true;
      if (cur) { const t = cur.dataset['tip']; if (t !== undefined && !cur.hasAttribute('title')) cur.setAttribute('title', t); delete cur.dataset['tip']; cur = null; }
    };
    const show = (el: HTMLElement, stash = true) => {
      const t = el.getAttribute('title');
      if (!t) return;
      if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); tip.setAttribute('data-noprint', ''); document.body.append(tip); }
      if (stash) { el.dataset['tip'] = t; el.removeAttribute('title'); } // hover: cất title để không có hai tooltip; focus bàn phím: giữ title (tên truy cập khi nhãn bị ẩn)
      cur = el;
      tip.textContent = t; tip.hidden = false;
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const below = r.bottom + 8 + h <= window.innerHeight - 4;
      tip.style.top = `${below ? r.bottom + 8 : Math.max(4, r.top - 8 - h)}px`;
      tip.style.left = `${Math.max(4, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 4))}px`;
    };
    const fine = !matchMedia('(hover: none)').matches;
    const over = (e: Event) => { if (!fine) return; const el = (e.target as HTMLElement).closest?.<HTMLElement>('[title]'); if (!el || el === cur) return; hide(); timer = window.setTimeout(() => show(el), 420); };
    const focus = (e: Event) => { const el = (e.target as HTMLElement).closest?.<HTMLElement>('[title]'); if (!el || !el.matches(':focus-visible')) return; hide(); show(el, false); };
    document.addEventListener('pointerover', over); document.addEventListener('pointerout', hide); document.addEventListener('pointerdown', hide);
    document.addEventListener('focusin', focus); document.addEventListener('focusout', hide); document.addEventListener('keydown', hide, true); window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('keydown', onKey); offs.forEach((f) => f());
      hide(); tip?.remove();
      document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', hide); document.removeEventListener('pointerdown', hide);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', hide); document.removeEventListener('keydown', hide, true); window.removeEventListener('scroll', hide, true);
    };
  }, []);

  const row = (k: string, d: string) => <div class="hp-row" key={k + d}><span class="hp-k">{keys(k)}</span><span class="hp-d">{d}</span></div>;
  return (
    <>
      {help && (
        <div data-noprint class="hp-scrim" onClick={() => setHelp(false)}>
          <div class="hp" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div class="hp-head"><h2>Keyboard shortcuts</h2><button type="button" class="hp-x" aria-label="Close" title="Close (esc)" onClick={() => setHelp(false)} autoFocus><Icon n="x" s={16} /></button></div>
            <div class="hp-body">
              <section><h3>General</h3>{HELP.map(([k, d]) => row(k, d))}</section>
              {viewOf() === 'app' && <section><h3>Change marks</h3><div class="hp-row"><span class="hp-k"><i class="hp-bar hp-add" /></span><span class="hp-d">added since the last save</span></div><div class="hp-row"><span class="hp-k"><i class="hp-bar hp-chg" /></span><span class="hp-d">changed since the last save</span></div><div class="hp-row"><span class="hp-k"><i class="hp-bar hp-warn" /></span><span class="hp-d">a line with an issue (dashed underline); see Checks</span></div></section>}
              {viewOf() === 'app' && STUDIO_GROUPS.map(([g, items]) => <section key={g}><h3>{g}</h3>{items.map(([k, d]) => row(k, d))}</section>)}
            </div>
          </div>
        </div>
      )}
      {fb !== null && (
        <div data-noprint onClick={() => setFb(null)} style="position:fixed;inset:0;z-index:80;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:20px">
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Copy manually" style="width:100%;max-width:720px;background:var(--bg);border:1px solid var(--ink);padding:20px;font-family:'JetBrains Mono',monospace">
            <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.06em;color:var(--sub)">THE BROWSER BLOCKED COPYING · PRESS CTRL/⌘ + C</p>
            <textarea ref={fbRef} readOnly value={fb} style="width:100%;height:260px;box-sizing:border-box;background:var(--code-bg);color:var(--code-fg);border:0;padding:14px;font:inherit;font-size:13px;line-height:1.6;resize:vertical" />
            <div style="margin-top:14px"><button type="button" onClick={() => setFb(null)} style="font:inherit;font-size:12px;letter-spacing:0.04em;padding:8px 14px;border:1px solid var(--ink);background:transparent;color:var(--ink);cursor:pointer">CLOSE</button></div>
          </div>
        </div>
      )}
    </>
  );
}
