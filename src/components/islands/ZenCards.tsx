import { Icon, type IconName } from './icons';
import { useEffect, useRef, useState } from 'preact/hooks';

export type ZDim = 'off' | 'soft' | 'strong';
export type ZFace = 'sans' | 'mono';
export type ZSize = 's' | 'm' | 'l';
export type ZCol = 'narrow' | 'normal' | 'wide';
export type ZCopy = 'md' | 'rich' | 'plain';
export type ZChrome = 'auto' | 'always' | 'hidden';
export type ZFocus = 'paragraph' | 'sentence';
export type ZTw = 'center' | 'third' | 'free';
export interface ZPrefs { face: ZFace; dim: ZDim; goal: number; size: ZSize; col: ZCol; copy: ZCopy; focus: ZFocus; tw: ZTw; chrome: ZChrome; pin: boolean; hinted: boolean }
export const GOALS = [0, 300, 500, 800, 1500] as const;
export const DEFAULT_ZPREFS: ZPrefs = { face: 'sans', dim: 'soft', goal: 0, size: 'm', col: 'normal', copy: 'md', focus: 'paragraph', tw: 'center', chrome: 'auto', pin: false, hinted: false };
export const CHROMES: ZChrome[] = ['auto', 'always', 'hidden'];

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'; // nhãn phím mở lệnh zen
const WPM = 200; // cùng tốc độ đọc với số phút ở thanh trạng thái thường
const mins = (words: number) => Math.max(1, Math.round(words / WPM));
const num = (n: number) => n.toLocaleString('en-US');
const COPY_NAME: Record<ZCopy | 'sel', string> = { md: 'Markdown', rich: 'rich text', plain: 'plain text', sel: 'selection' };
const COPY_HINT: Record<ZCopy, string> = { md: 'Source with # and ** marks', rich: 'Formatted, for Ghost, Docs, email', plain: 'Text only, no marks' };

interface Opt<T> { v: T; t: string }
/** Hàng cài đặt: nhãn bên trái, nhóm nút chọn bên phải (thay cho nút xoay vòng). */
function Seg<T extends string | number>({ label, value, opts, onPick, off, hint }: { label: string; value: T; opts: Opt<T>[]; onPick: (v: T) => void; off?: boolean; hint?: string | undefined }) {
  return (
    <div class={'zc-r2' + (off ? ' off' : '')}>
      <span class="zc-lab"><span class="zc-lt">{label}{hint && <kbd>{hint}</kbd>}</span></span>
      <span class="zc-seg" role="group" aria-label={label}>
        {opts.map((o) => <button key={String(o.v)} type="button" aria-pressed={o.v === value} disabled={off} onClick={() => onPick(o.v)}>{o.t}</button>)}
      </span>
    </div>
  );
}

interface ToolBtn { id: string; label: string; title: string; cls?: string | undefined; icon?: IconName | undefined }
export interface ZHead { id: string; text: string; level: number; line?: number }

interface Props {
  name: string;
  words: number; chars: number;
  selection: { words: number; chars: number } | null;
  saved: { ok: boolean; t: string };
  prefs: ZPrefs; read: boolean; show: boolean; menu: boolean; dark: boolean; hint: boolean;
  /** vị trí thanh công cụ nổi trong viewport (null: ẩn). */
  sel: { left: number; top: number; bottom: number } | null;
  main: ToolBtn[]; more: ToolBtn[]; heads: ZHead[]; activeId: string;
  /** % đã đọc ở mặt Read (null: mặt Write hoặc trang không cuộn được). */
  progress: number | null; onSave: () => void;
  onTool: (id: string) => void; onMenu: (open: boolean) => void;
  onRead: (read: boolean) => void; onPrefs: (p: ZPrefs) => void; onExit: () => void;
  onTheme: () => void; onJump: (id: string) => void; onCopy: (kind: ZCopy | 'sel') => Promise<boolean>;
  /** Trình chiếu: từ đầu hoặc từ slide đang viết. */
  onPresent: (here: boolean) => void;
  /** Kéo thả trong outline: chuyển mục ở dòng `from` tới trước mục ở dòng `before` (0 = cuối tài liệu). */
  onMove?: (from: number, before: number) => void;
}

/** Ba vùng chrome của zen, cùng ẩn/hiện theo `show`: rail outline bên trái, nút Copy + ⋯ ở góc trên phải, pill thống kê ở giữa dưới; cộng thanh công cụ nổi trên vùng bôi đen. */
export default function ZenCards({ name, words, chars, selection, saved, prefs, read, show, menu, dark, hint, sel, main, more, heads, activeId, progress, onSave, onTool, onMenu, onRead, onPrefs, onExit, onTheme, onJump, onCopy, onPresent, onMove }: Props) {
  const [extra, setExtra] = useState(false);
  const [note, setNote] = useState('');
  const noteT = useRef(0);
  const [outline, setOutline] = useState(false);
  const [rail, setRail] = useState(false); // rail mở bằng chạm (iOS không có hover)
  const [cmenu, setCmenu] = useState(false);
  const [copied, setCopied] = useState<ZCopy | 'sel' | ''>('');
  const flashT = useRef(0);
  const pct = prefs.goal > 0 ? Math.min(100, Math.round((words / prefs.goal) * 100)) : 0;
  const st = selection ?? { words, chars };
  const keep = (e: Event) => e.preventDefault(); // bấm nút không được lấy focus khỏi ô soạn (mất vùng bôi đen)
  const below = sel ? sel.top < 64 : false;
  const warn = !saved.ok && !selection;
  const pinned = menu || cmenu || rail; // đang mở menu thì chrome luôn hiện, bất kể chế độ
  const on = pinned || (prefs.chrome === 'always' ? true : prefs.chrome === 'hidden' ? false : show || !!selection || hint);
  const onCorner = on || warn; // mọi chế độ (kể cả lúc đang gõ hay Hidden) đều không giấu cảnh báo mất dữ liệu
  const ghost = prefs.chrome === 'hidden' && !pinned ? ' zc-ghost' : '';
  const reading = read && progress !== null;
  const left = reading ? Math.max(0, Math.ceil(mins(words) * (1 - progress / 100))) : 0;
  const caption = selection ? 'selected text' : saved.ok ? (saved.t ? `Saved ${saved.t}` : '') : 'Not saved · storage is blocked, use Export';

  const doCopy = (kind: ZCopy | 'sel') => {
    void onCopy(kind).then((ok) => {
      if (!ok) return;
      setCopied(kind); clearTimeout(flashT.current);
      flashT.current = window.setTimeout(() => setCopied(''), 1600);
    });
  };
  const primary: ZCopy | 'sel' = selection ? 'sel' : prefs.copy;
  const pick = (k: ZCopy) => { onPrefs({ ...prefs, copy: k }); setCmenu(false); doCopy(k); };

  // Alt+C chép bằng định dạng đang chọn; đọc closure mới nhất qua ref vì listener chỉ đăng ký một lần
  const live = useRef({ doCopy, primary, prefs, onPrefs });
  live.current = { doCopy, primary, prefs, onPrefs };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.code === 'KeyC') { e.preventDefault(); live.current.doCopy(live.current.primary); }
      else if (e.code === 'KeyH') { // Alt+H: đổi chế độ chrome Auto > Always > Hidden
        e.preventDefault();
        const c = live.current.prefs.chrome;
        live.current.onPrefs({ ...live.current.prefs, chrome: CHROMES[(CHROMES.indexOf(c) + 1) % CHROMES.length]! });
      }
    };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); clearTimeout(flashT.current); clearTimeout(noteT.current); };
  }, []);
  // đổi chế độ chrome (từ menu, Alt+H hay Palette): báo một dòng, vì ở Hidden chính menu đã ẩn
  const firstChrome = useRef(true);
  useEffect(() => {
    // lần dựng đầu: chỉ báo khi zen mở ở chế độ Hidden (màn hình trống, người dùng cần biết vì sao và cách thoát)
    if (firstChrome.current) { firstChrome.current = false; if (prefs.chrome !== 'hidden') return; }
    setNote(`Controls ${prefs.chrome} · Alt+H to change`);
    clearTimeout(noteT.current); noteT.current = window.setTimeout(() => setNote(''), 2400);
  }, [prefs.chrome]);
  // Esc đóng menu định dạng chép (hoặc rail đang mở) trước; bắt ở pha capture để Zen không thoát luôn
  useEffect(() => {
    if (!cmenu && !rail) return;
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; e.stopImmediatePropagation(); e.preventDefault(); setCmenu(false); setRail(false); };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [cmenu, rail]);
  // bấm ra ngoài thì đóng menu định dạng chép và rail đang mở
  useEffect(() => {
    if (!cmenu && !rail) return;
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (cmenu && !t?.closest?.('.zc-split, .zc-cmenu')) setCmenu(false);
      if (rail && !t?.closest?.('.zc-rail')) setRail(false);
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [cmenu, rail]);

  // kéo thả mục trong outline: trong lúc kéo, rail giữ mở (đang kéo thì :hover và pointermove không đáng tin)
  const [drag, setDrag] = useState(0);
  const [over, setOver] = useState(-1);
  const canDrag = !!onMove && !read;
  const endDrag = () => { setDrag(0); setOver(-1); setRail(false); };
  const dropAt = (before: number) => { const from = drag; endDrag(); if (from && from !== before) onMove?.(from, before); };
  const outlineList = (cls: string, dnd = false) => (
    <span class={cls} role="group" aria-label="Outline">
      {heads.map((h) => (
        <button key={h.id} type="button" title={dnd && canDrag ? `${h.text} (drag to move the section)` : h.text}
          class={[h.id === activeId ? 'cur' : '', drag && over === h.line && drag !== h.line ? 'drop' : '', drag === h.line ? 'drag' : ''].filter(Boolean).join(' ')}
          aria-current={h.id === activeId ? 'true' : undefined} style={`padding-left:${10 + (Math.min(h.level, 3) - 1) * 14}px`}
          draggable={dnd && canDrag && !!h.line}
          onDragStart={(ev) => { if (!h.line) return; setDrag(h.line); setRail(true); ev.dataTransfer?.setData('text/plain', String(h.line)); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(ev) => { if (!drag || !h.line) return; ev.preventDefault(); setOver(h.line); }}
          onDrop={(ev) => { ev.preventDefault(); if (h.line) dropAt(h.line); }} onDragEnd={endDrag}
          onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onJump(h.id); onMenu(false); setOutline(false); setRail(false); }}>{h.text}</button>
      ))}
      {dnd && canDrag && <span class={'zc-oldrop' + (drag ? '' : ' idle') + (over === 0 ? ' drop' : '')} aria-hidden="true" onDragOver={(ev) => { ev.preventDefault(); setOver(0); }} onDrop={(ev) => { ev.preventDefault(); dropAt(0); }}>Move to the end</span>}
    </span>
  );

  return (
    <>
      <h1 class="pv-sr">Zen: {name}</h1>
      {read ? (progress !== null && <i class="zc-bar zc-prog" aria-hidden="true" style={`width:${progress}%`} />) : (prefs.goal > 0 && <i class="zc-bar" aria-hidden="true" style={`width:${pct}%`} />)}
      {note && <p class="zc-note" role="status">{note}</p>}

      {sel && !read && (
        <div class={'zc zc-sel' + (below ? ' below' : '')} role="toolbar" aria-label="Format selection" onMouseDown={keep}
          style={`left:clamp(min(190px, 50vw), ${Math.round(sel.left)}px, calc(100vw - min(190px, 50vw)));top:${Math.round(below ? sel.bottom + 10 : sel.top - 10)}px`}>
          <span class="zc-row">
            {main.map((t) => <button key={t.id} type="button" class={'zc-t ' + (t.cls ?? '')} title={t.title} aria-label={`${t.label} ${t.title}`} onClick={() => onTool(t.id)}>{t.icon ? <Icon n={t.icon} s={15} /> : t.label}</button>)}
            <button type="button" class="zc-t" title="More formatting" aria-label="… More formatting" aria-expanded={extra} onClick={() => setExtra(!extra)}>…</button>
          </span>
          {extra && <span class="zc-row zc-extra">{more.map((t) => <button key={t.id} type="button" class={'zc-t ' + (t.cls ?? '')} title={t.title} aria-label={`${t.label} ${t.title}`} onClick={() => onTool(t.id)}>{t.icon ? <Icon n={t.icon} s={15} /> : t.label}</button>)}</span>}
        </div>
      )}

      {heads.length > 0 && (
        <nav class={'zc-keep zc-rail' + (on || prefs.pin ? ' on' : '') + (rail ? ' open' : '') + (prefs.pin ? ' pinned' : ghost)} aria-label="Outline">
          <button type="button" class="zc-ticks" aria-expanded={rail} aria-label="Outline" title="Outline" onClick={() => setRail(!rail)}>
            {heads.map((h) => <i key={h.id} class={'zc-tick l' + Math.min(h.level, 3) + (h.id === activeId ? ' cur' : '')} />)}
          </button>
          <div class="zc zc-rail-list">
            <div class="zc-ol-h">
              <span>Outline</span>
              <button type="button" class="zc-pin" aria-pressed={prefs.pin} aria-label={prefs.pin ? 'Unpin outline' : 'Pin outline'} title={prefs.pin ? 'Unpin: show only on hover' : 'Pin: keep the outline open'} onClick={(ev) => { (ev.currentTarget as HTMLElement).blur(); onPrefs({ ...prefs, pin: !prefs.pin }); }}>{prefs.pin ? 'Pinned' : 'Pin'}</button>
            </div>
            {outlineList('zc-ol', true)}
          </div>
        </nav>
      )}

      <div class={'zc-keep zc-top' + (on ? ' on' : '') + ghost}>
        <span class="zc-flash" role="status" aria-live="polite">{copied ? `Copied ${COPY_NAME[copied]}` : ''}</span>
        <span class="zc zc-split" onMouseDown={keep}>
          <button type="button" class={'zc-copy' + (copied ? ' ok' : '')} aria-label={primary === 'sel' ? 'Copy selection' : `Copy ${COPY_NAME[primary]}`}
            title={primary === 'sel' ? 'Copy the selected Markdown source (Alt+C)' : `Copy the whole document as ${COPY_NAME[primary]} (Alt+C)`} onClick={() => doCopy(primary)}>
            <Icon n={copied ? 'check' : 'copy'} s={15} />
            <span class="zc-copy-t">{primary === 'sel' ? 'Copy selection' : 'Copy'}</span>
          </button>
          <button type="button" class="zc-caret" aria-haspopup="menu" aria-expanded={cmenu} aria-label="Copy format" title="Choose copy format" onClick={() => { setCmenu(!cmenu); onMenu(false); }}><Icon n="chev" s={14} /></button>
          <i class="zc-sep" aria-hidden="true" />
          <button type="button" class="zc-more" aria-haspopup="true" aria-expanded={menu} aria-label="Zen settings" title="Zen settings" onClick={() => { onMenu(!menu); setCmenu(false); }}><Icon n="more" s={18} /></button>
          <button type="button" class="zc-x" aria-label="Exit Zen" title="Exit Zen (Esc)" onClick={onExit}><Icon n="x" s={16} /></button>
        </span>

        {cmenu && (
          <div class="zc zc-cmenu" role="menu" aria-label="Copy format">
            {(['md', 'rich', 'plain'] as const).map((k) => (
              <button key={k} type="button" class="zc-mi" role="menuitemradio" aria-checked={prefs.copy === k} onClick={() => pick(k)}>
                <span class="zc-ck">{prefs.copy === k && <Icon n="check" s={14} />}</span>
                <span class="zc-mt"><b>{k === 'md' ? 'Markdown' : k === 'rich' ? 'Rich text' : 'Plain text'}</b><i>{COPY_HINT[k]}</i></span>
              </button>
            ))}
            <button type="button" class="zc-mi zc-save" role="menuitem" onClick={() => { setCmenu(false); onSave(); }} title="Download the document as a .md file">
              <span class="zc-ck" />
              <span class="zc-mt"><b>Save as .md</b><i>Download the Markdown file</i></span>
            </button>
            <span class="zc-menu-foot"><kbd>Alt C</kbd> copies in the checked format</span>
          </div>
        )}

        {menu && (
          <div class="zc zc-menu" role="group" aria-label="Zen settings">
            <div class="zc-sec">Text</div>
            <Seg label="Size" value={prefs.size} opts={[{ v: 's', t: 'S' }, { v: 'm', t: 'M' }, { v: 'l', t: 'L' }]} onPick={(v) => onPrefs({ ...prefs, size: v })} />
            <Seg label="Width" value={prefs.col} opts={[{ v: 'narrow', t: 'Narrow' }, { v: 'normal', t: 'Normal' }, { v: 'wide', t: 'Wide' }]} onPick={(v) => onPrefs({ ...prefs, col: v })} />
            <div class="zc-sec">View</div>
            <Seg label="Theme" value={dark ? 'dark' : 'light'} opts={[{ v: 'light', t: 'Light' }, { v: 'dark', t: 'Dark' }]} onPick={(v) => { if ((v === 'dark') !== dark) onTheme(); }} hint="d" />
            <Seg label="Controls" value={prefs.chrome} opts={[{ v: 'auto', t: 'Auto' }, { v: 'always', t: 'Always' }, { v: 'hidden', t: 'Hidden' }]} onPick={(v) => onPrefs({ ...prefs, chrome: v })} hint="Alt H" />
            <div class="zc-sec">Writing</div>
            {read && <p class="zc-sec-note">These apply in Write. Switch with Alt V.</p>}
            <Seg label="Font" value={prefs.face} opts={[{ v: 'sans', t: 'Sans' }, { v: 'mono', t: 'Mono' }]} onPick={(v) => onPrefs({ ...prefs, face: v })} off={read} />
            <Seg label="Focus" value={prefs.focus} opts={[{ v: 'paragraph', t: 'Paragraph' }, { v: 'sentence', t: 'Sentence' }]} onPick={(v) => onPrefs({ ...prefs, focus: v })} off={read} />
            <Seg label="Fade" value={prefs.dim} opts={[{ v: 'off', t: 'Off' }, { v: 'soft', t: 'Soft' }, { v: 'strong', t: 'Strong' }]} onPick={(v) => onPrefs({ ...prefs, dim: v })} off={read} />
            <Seg label="Typewriter" value={prefs.tw} opts={[{ v: 'center', t: 'Center' }, { v: 'third', t: 'Third' }, { v: 'free', t: 'Free' }]} onPick={(v) => onPrefs({ ...prefs, tw: v })} off={read} />
            <Seg label="Word goal" value={prefs.goal} opts={GOALS.map((g) => ({ v: g as number, t: g ? String(g) : 'Off' }))} onPick={(v) => onPrefs({ ...prefs, goal: v })} off={read} />
            {heads.length > 0 && (
              <span class="zc-narrow-only">
                <button type="button" class="zc-adv" aria-expanded={outline} onClick={() => setOutline(!outline)} title="Jump to a heading">Outline<b>{outline ? '−' : '+'}</b></button>
                {outline && outlineList('zc-ol zc-ol-menu')}
              </span>
            )}
            <div class="zc-sec">Slides</div>
            <div class="zc-r2">
              <span class="zc-lab"><span class="zc-lt">Present<kbd>Alt P</kbd></span></span>
              <span class="zc-seg" role="group" aria-label="Present">
                <button type="button" onClick={() => { onMenu(false); onPresent(false); }} title="Present from the first slide">Start</button>
                <button type="button" onClick={() => { onMenu(false); onPresent(true); }} title="Present from the slide you are writing (Alt+P)">Here</button>
              </span>
            </div>
            <div class="zc-foot">
              <button type="button" class="zc-exit" onClick={onExit} title="Leave zen (Esc)">Exit Zen<kbd>Esc</kbd></button>
            </div>
          </div>
        )}
      </div>

      {hint && <p class="zc-hint" role="note">Alt+V write or read · Alt+C copy · Alt+H controls · Alt+P present · {MOD}/ commands · Esc leaves zen</p>}
      <div class={'zc-keep zc-corner' + (onCorner ? ' on' : '') + ghost}>
        <div class="zc zc-stats">
          <span class="zc-stat" role="status" aria-label={selection ? 'Selection statistics' : 'Document statistics'}>
            {caption && <span class={'zc-cap' + (warn ? ' warn' : selection ? ' always' : ' idle')}>{caption}</span>}
            <span class="zc-vals">
              <span>{!warn && !selection && saved.ok && <i class="zc-dot" aria-hidden="true" />}<b>{num(st.words)}</b> words</span>
              <span class={'x' + (selection ? '' : ' idle')}><b>{num(st.chars)}</b> characters</span>
              {reading && !selection ? <span><b>{progress}%</b><span class="x"> · <b>{left}</b> min left</span></span> : <span class="x"><b>{mins(st.words)}</b> min</span>}
            </span>
          </span>
          <i class="zc-sep" aria-hidden="true" />
          <span class="zc-mode" role="group" aria-label="Zen face">
            <button type="button" aria-pressed={!read} onClick={() => onRead(false)} title="Write (Alt+V)">Write</button>
            <button type="button" aria-pressed={read} onClick={() => onRead(true)} title="Read the rendered preview (Alt+V)">Read</button>
          </span>
        </div>
      </div>
    </>
  );
}
