import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { midCut } from '../../lib/studio/tabs';

/** Thanh tab tài liệu trong `.pv-bar` (chỉ hiện khi có ≥ 2 tài liệu). Không có state tài liệu: nhận danh sách + callback. Điện thoại: nút chọn tài liệu mở bảng đáy. */
export interface TabItem { id: string; label: string; full: string; changed: boolean } // label: nhãn hiển thị (không đuôi .md); full: tên đầy đủ để đổi tên // changed: đã sửa so với file trên đĩa (chỉ tab có file)
interface Props {
  items: TabItem[];
  activeId: string;
  canAdd: boolean;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseRight: (id: string) => void;
  onReopen: () => void;
  canReopen: boolean;
}

const MIN_W = 112, MAX_W = 180, CTL_W = 38, MORE_W = 52, TAB_PAD = 44, DOT_W = 14; // TAB_PAD: lề trái + nút đóng + khe; DOT_W: chấm "đã sửa"

export function StudioTabs({ items, activeId, canAdd, onSwitch, onClose, onAdd, onRename, onDuplicate, onCloseOthers, onCloseRight, onReopen, canReopen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(10000);
  const [more, setMore] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState('');
  const [font, setFont] = useState('');
  const measure = useRef<CanvasRenderingContext2D | null>(null);
  const [ren, setRen] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null); // menu chuột phải (hoặc phím Menu / Shift+F10)
  useLayoutEffect(() => { // chỗ trống = tới mép trái nhóm chế độ (Edit/Split/Read) khi nó nằm đè theo đường chia, không thì cả bề rộng của ô
    const el = box.current; if (!el) return;
    const bar = el.closest('.pv-bar') as HTMLElement | null;
    const calc = () => {
      const want = parseFloat(bar?.style.getPropertyValue('--seg-want') ?? '');
      const left = el.getBoundingClientRect().left;
      const limit = bar && Number.isFinite(want) ? bar.getBoundingClientRect().left + want : (bar?.querySelector('.pv-seg') as HTMLElement | null)?.getBoundingClientRect().left;
      setRoom(Math.max(0, limit !== undefined && limit > left ? limit - left - 14 : el.clientWidth));
    };
    const ro = new ResizeObserver(calc); ro.observe(el); if (bar) ro.observe(bar);
    const mo = new MutationObserver(calc); if (bar) mo.observe(bar, { attributes: true, attributeFilter: ['style', 'data-seam'] });
    window.addEventListener('resize', calc); calc();
    return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', calc); };
  }, []);
  useLayoutEffect(() => { // phông thật của nhãn tab (đo bằng canvas); phông web tải xong thì đo lại
    const read = () => { const g = box.current?.querySelector('.pv-tabnm'); if (g) { const c = getComputedStyle(g); setFont(`${c.fontWeight} ${c.fontSize} ${c.fontFamily}`); } };
    read(); void document.fonts?.ready.then(read);
  }, [items.length]);
  useEffect(() => { // menu "+N", menu chuột phải và bảng điện thoại đóng khi bấm ra ngoài hoặc Esc
    if (!more && !sheet && !ctx) return;
    const off = (ev: Event) => { if (!(ev.target as HTMLElement).closest?.('.pv-tabmore, .pv-tabsheet, .pv-tabsw, .pv-tabctx')) { setMore(false); setSheet(false); setCtx(null); } };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setMore(false); setSheet(false); setCtx(null); } };
    document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc, true); };
  }, [more, sheet, ctx]);

  const fit = Math.max(2, Math.floor((room - CTL_W) / MIN_W));
  const over = items.length > fit;
  const cap = over ? Math.max(1, Math.floor((room - CTL_W - MORE_W) / MIN_W)) : items.length;
  const tabW = Math.max(MIN_W, Math.min(MAX_W, Math.floor((room - CTL_W - (over ? MORE_W : 0)) / Math.max(1, Math.min(cap, items.length))))); // ít tab thì rộng, nhiều tab thì thu lại tới MIN_W
  const text = (t: TabItem): string => { // cắt Ở GIỮA cho vừa ô chữ: phần đuôi (so-mot / so-hai) còn thấy
    if (!font) return t.label;
    measure.current ??= document.createElement('canvas').getContext('2d');
    const cx = measure.current; if (!cx) return t.label;
    cx.font = font;
    const w = tabW - TAB_PAD - (t.changed ? DOT_W : 0) - 2;
    return midCut(t.label, (s) => cx.measureText(s).width <= w);
  };
  const at = Math.max(0, items.findIndex((t) => t.id === activeId));
  const from = over && at >= cap ? at - cap + 1 : 0; // tab đang chọn luôn hiện, thứ tự giữ nguyên (cửa sổ liên tiếp kết thúc ở nó), không chen vào cuối dãy
  const shown = items.slice(from, from + cap);
  const hidden = items.filter((t) => !shown.includes(t));
  const filtered = hidden.filter((t) => !q || t.label.toLowerCase().includes(q.toLowerCase()));
  const cur = items.find((t) => t.id === activeId);

  const onKey = (ev: KeyboardEvent, i: number) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight' && ev.key !== 'Home' && ev.key !== 'End') return;
    ev.preventDefault();
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? shown.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + shown.length) % shown.length;
    box.current?.querySelectorAll<HTMLElement>('.pv-tabgo')[next]?.focus();
  };
  const commit = (id: string, v: string) => { setRen(null); if (v.trim()) onRename(id, v); };
  useEffect(() => { if (more && hidden.length <= 6) menu.current?.querySelector<HTMLButtonElement>('.pv-tabmgo')?.focus(); }, [more]); // menu ngắn: focus dòng đầu để dùng được bằng bàn phím ngay
  const onMenuKey = (ev: KeyboardEvent) => { // ↑/↓/Home/End đi qua các dòng; ô tìm giữ mũi tên trái/phải cho văn bản
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp' && ev.key !== 'Home' && ev.key !== 'End') return;
    const rows = [...(menu.current?.querySelectorAll<HTMLButtonElement>('.pv-tabmgo') ?? [])]; if (!rows.length) return;
    if ((ev.key === 'Home' || ev.key === 'End') && ev.target instanceof HTMLInputElement) return;
    ev.preventDefault();
    const i = rows.findIndex((b) => b.closest('.pv-tabmrow')?.contains(document.activeElement));
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? rows.length - 1 : ev.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    rows[n]?.focus();
  };

  return (
    <div class="pv-tabs" ref={box} style={{ maxWidth: room }}>
      <div class="pv-tablist" role="group" aria-label="Open documents">
        {shown.map((t, i) => (
          <div key={t.id} class="pv-tab" style={{ width: tabW }} data-active={t.id === activeId ? '1' : undefined} onAuxClick={(ev) => { if (ev.button === 1) { ev.preventDefault(); onClose(t.id); } }} onContextMenu={(ev) => { ev.preventDefault(); setMore(false); setCtx({ id: t.id, x: ev.clientX, y: ev.clientY }); }}>
            {ren === t.id
              ? <input class="pv-tabren" aria-label="Rename document" value={t.full || t.label} spellcheck={false} ref={(el) => { if (el && document.activeElement !== el) { el.focus(); el.select(); } }}
                  onKeyDown={(ev) => { if (ev.isComposing) return; if (ev.key === 'Enter') commit(t.id, (ev.target as HTMLInputElement).value); else if (ev.key === 'Escape') { ev.stopPropagation(); setRen(null); } }}
                  onBlur={(ev) => commit(t.id, (ev.target as HTMLInputElement).value)} />
              : <button type="button" class="pv-tabgo" aria-current={t.id === activeId ? 'true' : undefined} tabIndex={t.id === activeId ? 0 : -1} title={(t.full || t.label) + (t.changed ? ' · changed since the file was saved' : '') + (items.indexOf(t) < 9 ? ` · Alt+${items.indexOf(t) + 1}` : '')}
                  onClick={() => onSwitch(t.id)} onDblClick={() => { onSwitch(t.id); setRen(t.id); }} onKeyDown={(ev) => onKey(ev, i)}>
                  <span class="pv-tabnm">{text(t)}</span>{t.changed && <span class="pv-tabdot" role="img" aria-label="Unsaved changes" />}
                </button>}
            <button type="button" class="pv-tabx" aria-label={`Close ${t.label}`} title="Close (Alt+W)" tabIndex={t.id === activeId ? 0 : -1} onClick={() => onClose(t.id)}><Icon n="x" s={12} /></button>
          </div>
        ))}
        {over && (
          <span class="pv-tabmore">
            <button type="button" class="pv-tabbtn" aria-haspopup="true" aria-expanded={more} aria-label={`+${hidden.length} more documents`} onClick={() => { setMore(!more); setQ(''); }}>+{hidden.length}<Icon n="chev" s={12} /></button>
            {more && (
              <div class="pv-menu pv-tabmenu" ref={menu} onKeyDown={onMenuKey}>
                <div class="pv-tabmh"><span>More documents</span><span>{hidden.length}</span></div>
                {hidden.length > 6 && <input class="pv-tabq" aria-label="Find a document" placeholder="Find a document" value={q} spellcheck={false} ref={(el) => el?.focus()} onInput={(ev) => setQ((ev.target as HTMLInputElement).value)} />}
                <div role="menu" aria-label="More documents" class="pv-tabml">
                  {filtered.map((t) => (
                    <div key={t.id} class="pv-tabmrow">
                      <button type="button" role="menuitem" class="pv-tabmgo" title={t.full || t.label} onClick={() => { setMore(false); onSwitch(t.id); }}>
                        <span class="pv-tabmi">{t.label}</span>{t.changed && <span class="pv-tabdot" role="img" aria-label="Unsaved changes" />}
                        {items.indexOf(t) < 9 && <kbd>Alt+{items.indexOf(t) + 1}</kbd>}
                      </button>
                      <button type="button" role="menuitem" class="pv-tabmx" aria-label={`Close ${t.label}`} title="Close" onClick={() => { if (filtered.length < 2) setMore(false); onClose(t.id); }}><Icon n="x" s={12} /></button>
                    </div>
                  ))}
                </div>
                {!filtered.length && <span class="pv-tabnone">No match</span>}
              </div>
            )}
          </span>
        )}
      </div>
      {canAdd && <button type="button" class="pv-tabbtn pv-tabadd" aria-label="New tab" title="New document in a new tab (Alt+N)" onClick={onAdd}><span aria-hidden="true">+</span></button>}
      <button type="button" class="pv-tabsw" aria-haspopup="true" aria-expanded={sheet} onClick={() => setSheet(!sheet)}><span class="pv-tabnm">{cur?.label ?? ''}</span><span class="pv-tabcnt" aria-label={`${items.length} documents`}>{items.length}</span></button>
      {sheet && (
        <div class="pv-tabsheet" role="dialog" aria-label="Open documents">
          <div class="pv-tabsh"><span>Open documents</span><span>{items.length}</span></div>
          {items.map((t) => (
            <div key={t.id} class="pv-tabrow">
              <button type="button" class="pv-tabrowgo" aria-current={t.id === activeId ? 'true' : undefined} onClick={() => { setSheet(false); onSwitch(t.id); }}><span class="pv-tabnm">{t.label}</span>{t.changed && <span class="pv-tabdot" role="img" aria-label="Unsaved changes" />}</button>
              <button type="button" class="pv-tabrowx" aria-label={`Close ${t.label}`} onClick={() => onClose(t.id)}><Icon n="x" s={14} /></button>
            </div>
          ))}
          {canAdd && <button type="button" class="pv-tabrownew" onClick={() => { setSheet(false); onAdd(); }}>+ New document</button>}
        </div>
      )}
      {ctx && (() => {
        const i = items.findIndex((t) => t.id === ctx.id), tab = items[i];
        const run = (f: () => void) => () => { setCtx(null); f(); };
        const onKey = (ev: KeyboardEvent) => {
          if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
          ev.preventDefault();
          const b = [...(ev.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not([disabled])')], k = b.indexOf(document.activeElement as HTMLButtonElement);
          b[(k + (ev.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]?.focus();
        };
        return tab ? (
          <div class="pv-menu pv-tabctx" role="menu" aria-label={`Tab ${tab.label}`} style={{ left: Math.max(8, Math.min(ctx.x, window.innerWidth - 236)), top: ctx.y }} onKeyDown={onKey}>
            <button type="button" role="menuitem" ref={(el) => el?.focus()} onClick={run(() => { onSwitch(ctx.id); setRen(ctx.id); })}>Rename</button>
            <button type="button" role="menuitem" onClick={run(() => onDuplicate(ctx.id))}>Duplicate</button>
            <hr />
            <button type="button" role="menuitem" onClick={run(() => onClose(ctx.id))}>Close<span>Alt+W</span></button>
            <button type="button" role="menuitem" disabled={items.length < 2} onClick={run(() => onCloseOthers(ctx.id))}>Close others</button>
            <button type="button" role="menuitem" disabled={i >= items.length - 1} onClick={run(() => onCloseRight(ctx.id))}>Close tabs to the right</button>
            <hr />
            <button type="button" role="menuitem" disabled={!canReopen} onClick={run(onReopen)}>Reopen closed tab<span>Alt+Shift+T</span></button>
          </div>
        ) : null;
      })()}
    </div>
  );
}
