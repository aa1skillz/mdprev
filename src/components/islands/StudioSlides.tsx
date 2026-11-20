import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { splitSlides } from '../../lib/studio/slides';
import { Icon } from './icons';
import { clock, PRESENT_CHANNEL, PRESENTER_NAME, revealCount, scrollWithin, syncScroll, type PresentMsg } from '../../lib/studio/present';

/** Bảng phím tắt của màn chiếu (một nguồn cho nút ? và phím ?). Giữ khớp với onKey bên dưới. */
const SHORTCUTS: [string, [string, string][]][] = [
  ['Move', [['← →', 'Previous / next slide'], ['↓ Space', 'Next; scrolls a long slide first'], ['↑ Backspace', 'Previous; scrolls back first'], ['Home End', 'First / last slide'], ['1–9, Enter', 'Go to a slide number'], ['g', 'All slides']]],
  ['Show', [['f', 'Fullscreen'], ['b .', 'Blank the screen'], ['n', 'Speaker notes'], ['p', 'Presenter window'], ['r', 'Reset the timer']]],
  ['Tools', [['i', 'Reveal bullets one at a time'], ['l', 'Laser pointer (click does not advance)'], ['Click', 'Zoom an image, diagram or table'], ['?', 'This list'], ['Esc', 'Close panel, then the slides']]],
];
import { url } from '../../lib/url';
import { SlideView, type SlideTheme } from './SlideView';

interface Props { html: string; start?: number; doc?: string; dt?: SlideTheme | null; onClose: () => void; onPrint?: () => void }

/** Đồng hồ riêng: nhịp mỗi giây chỉ vẽ lại con số, không vẽ lại slide. */
function Clock({ t0 }: { t0: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [t0]);
  return <span class="sl-time" title="Elapsed (r resets)">{clock(now - t0)}</span>;
}

/**
 * Chế độ trình chiếu: chia bản dựng theo `---` (hoặc h1/h2), phím mũi tên/space chuyển slide, Esc thoát, F toàn màn hình.
 * Thêm: slide tự thu nhỏ cho vừa chiều cao, lưới slide (G), gõ số rồi Enter để nhảy, màn trống (B), ghi chú (N, đoạn bắt đầu bằng `Note:`),
 * đồng hồ (R đặt lại), cửa sổ người trình bày (P) nối bằng BroadcastChannel.
 * Bắt phím ở pha capture của window và chặn mọi phím khác, để phím tắt của trang (h, a, d, f, ...) không chạy phía sau.
 */
export function StudioSlides({ html, start = 0, doc, dt, onClose, onPrint }: Props) {
  const slides = useMemo(() => splitSlides(html), [html]);
  const [i, setI] = useState(start);
  const [fs, setFs] = useState(false);
  const [grid, setGrid] = useState(false);
  const [gsel, setGsel] = useState(0);
  const [blank, setBlank] = useState(false);
  const [notes, setNotes] = useState(false);
  const [buf, setBuf] = useState('');
  const [t0, setT0] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);
  const chan = useRef<BroadcastChannel | null>(null);
  const n = useRef(slides.length);
  n.current = slides.length;
  const close = useRef(onClose);
  close.current = onClose;
  const idx = Math.min(i, Math.max(0, slides.length - 1));

  const [help, setHelp] = useState(false);
  const [zoom, setZoom] = useState('');
  const [laser, setLaser] = useState(false);
  const [reveal, setReveal] = useState(() => { try { return localStorage.getItem('mdprev-slides-reveal') === '1'; } catch { return false; } });
  const [rev, setRev] = useState(0); // số bullet đã hiện của slide hiện tại (chỉ dùng khi reveal bật)
  const totals = useMemo(() => slides.map((s) => revealCount(s.html)), [slides]);
  const dot = useRef<HTMLElement>(null);
  const jump = (to: number) => { setI(Math.max(0, Math.min(n.current - 1, to))); setRev(0); };
  /** Một đường đi cho mọi nguồn (phím, click, vuốt, nút, presenter): hiện bullet kế → cuộn trong slide dài (phím cuộn) → sang slide.
   *  Lùi: bớt một bullet → cuộn lên → về slide trước (hiện đủ). */
  const step = (d: number, sk = false) => {
    const L = live.current;
    const cv = () => box.current?.querySelector<HTMLElement>('.sl-slide .sv-canvas[data-overflow="1"]');
    if (d > 0) {
      if (L.reveal && L.rev < (L.totals[L.idx] ?? 0)) { setRev(L.rev + 1); return; }
      if (sk && scrollWithin(cv(), true)) return;
      if (L.idx < n.current - 1) { setI(L.idx + 1); setRev(0); }
    } else {
      if (L.reveal && L.rev > 0) { setRev(L.rev - 1); return; }
      if (sk && scrollWithin(cv(), false)) return;
      if (L.idx > 0) { setI(L.idx - 1); setRev(L.reveal ? (L.totals[L.idx - 1] ?? 0) : 0); }
    }
  };
  const toggleReveal = () => { const v = !live.current.reveal; setReveal(v); setRev(0); try { localStorage.setItem('mdprev-slides-reveal', v ? '1' : '0'); } catch { /* bỏ qua */ } };
  const toggleFs = () => {
    const el = box.current; if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void el.requestFullscreen?.().catch(() => undefined);
    } catch { /* trình duyệt từ chối: giữ chế độ cửa sổ */ }
  };
  const presenter = () => { window.open(url('/app/presenter/'), PRESENTER_NAME, 'popup,width=1100,height=720'); };
  const openGrid = () => { setGsel(idx); setGrid(true); };
  // hàm mới nhất cho listener phím (đăng ký một lần)
  const live = useRef({ toggleFs, presenter, openGrid, grid, gsel, buf, blank, idx, help, zoom, laser, reveal, rev, totals, toggleReveal });
  live.current = { toggleFs, presenter, openGrid, grid, gsel, buf, blank, idx, help, zoom, laser, reveal, rev, totals, toggleReveal };

  // layout effect: gắn listener ngay khi DOM được chèn, không có khoảng hở nào để phím lọt ra trang phía sau
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const cols = () => { const g = gridEl.current; return g ? Math.max(1, getComputedStyle(g).gridTemplateColumns.split(' ').length) : 1; };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.isComposing || ev.metaKey || ev.ctrlKey || ev.altKey) return; // tổ hợp phím của trình duyệt (tải lại, đổi thẻ...) vẫn chạy
      const k = ev.key;
      const L = live.current;
      const onBtn = (ev.target as HTMLElement | null)?.closest?.('button');
      if (onBtn && (k === 'Enter' || k === ' ')) { ev.stopPropagation(); return; } // để nút tự kích hoạt
      if (k === 'Tab') { // Tab y trong hộp thoại: xoay vòng giữa các nút đang hiện, không ra trang phía sau
        const bs = Array.from(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []).filter((b) => b.offsetParent !== null);
        if (bs.length) { const at = bs.indexOf(document.activeElement as HTMLButtonElement); bs[(at + (ev.shiftKey ? -1 : 1) + bs.length) % bs.length]!.focus(); }
      } else if (L.zoom) { if (k === 'Escape') setZoom(''); // ảnh/sơ đồ/bảng đang phóng to: Esc đóng, phím khác không làm gì
      } else if (L.help) { if (k === 'Escape' || k === '?') setHelp(false);
      } else if (L.grid) {
        const c = cols(), last = n.current - 1;
        if (k === 'Escape' || k === 'g' || k === 'G' || k === 'o' || k === 'O') setGrid(false);
        else if (k === 'ArrowRight') setGsel((s) => Math.min(last, s + 1));
        else if (k === 'ArrowLeft') setGsel((s) => Math.max(0, s - 1));
        else if (k === 'ArrowDown') setGsel((s) => Math.min(last, s + c));
        else if (k === 'ArrowUp') setGsel((s) => Math.max(0, s - c));
        else if (k === 'Home') setGsel(0);
        else if (k === 'End') setGsel(last);
        else if (k === 'Enter' || k === ' ') { jump(L.gsel); setGrid(false); }
      } else if (/^[0-9]$/.test(k)) setBuf((b) => (b + k).slice(-3));
      else if (k === 'Escape') { if (L.buf) setBuf(''); else if (L.blank) setBlank(false); else close.current(); }
      else if (k === 'Enter' && L.buf) { jump(Number(L.buf) - 1); setBuf(''); }
      else if (k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') { setBlank(false); step(1, true); }
      else if (k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { setBlank(false); step(-1, true); }
      else if (k === 'ArrowRight') { setBlank(false); step(1); }
      else if (k === 'ArrowLeft') { setBlank(false); step(-1); }
      else if (k === '?') setHelp(true);
      else if (k === 'i' || k === 'I') L.toggleReveal();
      else if (k === 'l' || k === 'L') setLaser((x) => !x);
      else if (k === 'Home') jump(0);
      else if (k === 'End') jump(n.current - 1);
      else if (k === 'f' || k === 'F') L.toggleFs();
      else if (k === 'g' || k === 'G' || k === 'o' || k === 'O') L.openGrid();
      else if (k === 'b' || k === 'B' || k === '.') setBlank((b) => !b);
      else if (k === 'n' || k === 'N') setNotes((x) => !x);
      else if (k === 'p' || k === 'P') L.presenter();
      else if (k === 'r' || k === 'R') setT0(Date.now());
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); // Tab giữ focus trong hộp thoại; các phím còn lại không lọt ra trang
    };
    const onFs = () => setFs(!!document.fullscreenElement);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement === box.current) void document.exitFullscreen().catch(() => undefined);
      prev?.focus?.();
    };
  }, []);

  useEffect(() => { if (grid) gridEl.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [grid, gsel]);
  // con trỏ chuột ẩn khi đứng yên 2 giây: ghi thẳng thuộc tính, không vẽ lại slide
  useEffect(() => {
    let id = 0;
    const move = (ev?: Event) => {
      box.current?.removeAttribute('data-idle'); clearTimeout(id); id = window.setTimeout(() => box.current?.setAttribute('data-idle', '1'), 2000);
      const p = ev as PointerEvent | undefined;
      if (p && dot.current) dot.current.style.transform = `translate(${p.clientX}px,${p.clientY}px)`; // chấm laser theo con trỏ, ghi thẳng DOM (không vẽ lại slide)
    };
    move();
    const kb = (ev: KeyboardEvent) => { if (ev.key === 'Tab') { box.current?.setAttribute('data-kb', '1'); box.current?.removeAttribute('data-idle'); } };
    const mouse = () => box.current?.removeAttribute('data-kb');
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', kb, true);
    window.addEventListener('pointerdown', mouse, true);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('keydown', kb, true); window.removeEventListener('pointerdown', mouse, true); clearTimeout(id); };
  }, []);

  // cửa sổ người trình bày
  const state = useRef<PresentMsg>({ t: 'end' });
  state.current = { t: 'state', slides: slides.map((s) => ({ html: s.html, notes: s.notes })), i: idx, t0, blank, doc: doc ?? 'default', dt: dt ?? null, ...(reveal ? { rev, rt: totals[idx] ?? 0 } : {}) };
  useEffect(() => {
    let bc: BroadcastChannel;
    try { bc = new BroadcastChannel(PRESENT_CHANNEL); } catch { return; }
    chan.current = bc;
    const sync = syncScroll(bc, () => box.current, () => live.current.idx);
    bc.onmessage = (e: MessageEvent<PresentMsg>) => {
      const m = e.data;
      sync.onMsg(m);
      if (m.t === 'hello') bc.postMessage(state.current);
      else if (m.t === 'go') { setBlank(false); jump(m.i); }
      else if (m.t === 'step') { setBlank(false); step(m.d, !!m.s); } // cờ s: phím cuộn → hiện bullet/cuộn trong slide dài trước khi chuyển
      else if (m.t === 'blank') setBlank((b) => !b);
      else if (m.t === 'reset') setT0(Date.now());
    };
    return () => { sync.stop(); try { bc.postMessage({ t: 'end' } satisfies PresentMsg); } catch { /* bỏ qua */ } bc.close(); chan.current = null; };
  }, []);
  useEffect(() => { chan.current?.postMessage(state.current); }, [slides, idx, t0, blank, reveal, rev]);

  const touch = useRef(0);
  const onClick = (ev: MouseEvent) => {
    const tg = ev.target as HTMLElement;
    if (tg.closest('a,button,.cb')) return;
    if (help) { setHelp(false); return; }
    if (blank) { setBlank(false); return; }
    if (laser) return; // đang chỉ bằng laser: click không chuyển slide
    const fig = tg.closest('img,svg,table');
    if (fig && fig.closest('.sl-slide')) { setZoom(fig.outerHTML); return; } // phóng to hình, sơ đồ, bảng
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    step(ev.clientX - r.left < r.width * 0.3 ? -1 : 1);
  };
  const cur = slides[idx];

  return (
    <div class="sl" role="dialog" aria-modal="true" aria-label="Slides" ref={box} tabIndex={-1} data-grid={grid ? '1' : undefined} data-help={help ? '1' : undefined} data-laser={laser ? '1' : undefined} data-dt={dt ? '' : undefined} style={dt ? dt.vars.map(([k, v]) => `${k}:${v}`).join(';') : undefined}
      onTouchStart={(ev) => { touch.current = ev.touches[0]?.clientX ?? 0; }}
      onTouchEnd={(ev) => { if (grid) return; const dx = (ev.changedTouches[0]?.clientX ?? 0) - touch.current; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }}>
      <div class="sl-bar" aria-hidden="true"><i style={`width:${slides.length ? ((idx + 1) / slides.length) * 100 : 0}%`} /></div>
      {grid ? (
        <div class="sl-grid" ref={gridEl} role="listbox" aria-label="All slides">
          {slides.map((s, k) => (
            <button key={k} type="button" role="option" class="sl-thumb" aria-selected={k === idx} aria-current={k === gsel ? 'true' : undefined}
              onClick={() => { jump(k); setGrid(false); }} onMouseEnter={() => setGsel(k)}>
              <span class="sl-tn"><span class="pv-sr">Slide </span>{k + 1}</span>
              <span class="sl-tv" aria-hidden="true" inert><SlideView html={s.html} doc={doc} dt={dt} landscape class="sl-tsv" /></span>
            </button>
          ))}
        </div>
      ) : (
        <div class="sl-stage" onClick={onClick}>
          {blank ? <div class="sl-blank" aria-label="Screen blanked, press B to show" /> : cur ? (
            <SlideView key={idx} html={cur.html} doc={doc} dt={dt} rev={reveal ? rev : undefined} class="sl-slide" />
          ) : <p class="sl-empty">Nothing to present yet. Write some Markdown first.</p>}
        </div>
      )}
      {notes && !grid && (
        <section class="sl-notes" aria-label="Speaker notes">
          {cur?.notes ? <div class="md-doc" dangerouslySetInnerHTML={{ __html: cur.notes }} /> : <p class="sl-nonote">No notes for this slide. Start a paragraph with Note: to add some.</p>}
        </section>
      )}
      {zoom && <div class="sl-zoom" role="dialog" aria-label="Zoomed figure" onClick={() => setZoom('')}><div class="md-doc sl-zoom-body" dangerouslySetInnerHTML={{ __html: zoom }} /></div>}
      {help && (
        <div class="sl-help" role="dialog" aria-label="Slide shortcuts">
          <button type="button" class="sl-help-x" aria-label="Close shortcuts" onClick={() => setHelp(false)}><Icon n="x" /></button>
          {SHORTCUTS.map(([g, rows]) => (
            <section key={g}><h2>{g}</h2><dl>{rows.map(([k, d]) => <div key={k}><dt>{k.split(' ').map((x) => <kbd key={x}>{x}</kbd>)}</dt><dd>{d}</dd></div>)}</dl></section>
          ))}
        </div>
      )}
      <i class="sl-laser" ref={dot} aria-hidden="true" />
      <div class="sl-foot">
        <span class="sl-count" role="status" aria-live="polite">{buf ? `go to ${buf}` : slides.length ? `${idx + 1} / ${slides.length}` : '0 / 0'}</span>
        <Clock t0={t0} />
        <span class="sl-btns">
          <button type="button" aria-label="Prev" title="Previous slide (←)" disabled={idx <= 0 && !(reveal && rev > 0)} onClick={() => step(-1)}><Icon n="chevl" /></button>
          <button type="button" aria-label="Next" title="Next slide (→)" disabled={idx >= slides.length - 1 && !(reveal && rev < (totals[idx] ?? 0))} onClick={() => step(1)}><Icon n="chevr" /></button>
          <span class="sl-gap" aria-hidden="true" />
          <button type="button" aria-label="Grid" aria-pressed={grid} title="All slides (g)" onClick={() => (grid ? setGrid(false) : openGrid())}><Icon n="grid" /></button>
          <button type="button" class="sl-wide" aria-label="Notes" aria-pressed={notes} title="Speaker notes (n)" onClick={() => setNotes(!notes)}><Icon n="notes" /></button>
          <button type="button" class="sl-wide" aria-label="Reveal bullets" aria-pressed={reveal} title="Reveal bullets one at a time (i)" onClick={toggleReveal}><Icon n="list" /></button>
          <button type="button" class="sl-wide" aria-label="Presenter" title="Presenter window with notes, next slide and timer (p)" onClick={presenter}><Icon n="monitor" /></button>
          {onPrint && <button type="button" class="sl-wide" aria-label="PDF" title="Save all slides as a PDF, one slide per page" onClick={onPrint}><Icon n="download" /></button>}
          <button type="button" aria-label="Fullscreen" aria-pressed={fs} title="Fullscreen (f)" onClick={toggleFs}><Icon n="expand" /></button>
          <span class="sl-gap" aria-hidden="true" />
          <button type="button" aria-label="Close" title="Close (esc)" onClick={() => close.current()}><Icon n="x" /></button>
        </span>
        <button type="button" class="sl-hint" aria-label="Slide shortcuts" aria-expanded={help} title="Shortcuts (?)" onClick={() => setHelp((h) => !h)}><Icon n="help" /></button>
      </div>
    </div>
  );
}
