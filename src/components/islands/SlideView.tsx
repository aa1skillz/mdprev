import { useLayoutEffect, useRef } from 'preact/hooks';
import { STEP_SEL } from '../../lib/studio/present';

/** Khung logic của một slide (px). Ngang 16:9; màn dọc (điện thoại) dùng khung dọc để chữ không quá nhỏ. */
export const LAND = { w: 1280, h: 720 };
export const PORT = { w: 720, h: 1280 };
const PAD = 56; // lề trong khung logic
const STRIP = 30; // dải chừa ở đáy khung (px logic) cho mũi tên "còn nữa" khi slide cuộn được và bên dưới còn nội dung
/** Sàn thu nhỏ khi slide dài: chữ thân 32px còn ~17.6px trong khung logic (khung hình thật thường lớn hơn khung logic). Dài hơn nữa thì cuộn trong khung. */
export const FIT_FLOOR = 0.55;

/** Theme tài liệu đang chọn (biến màu + phông) để slide đi theo; cỡ chữ của slide là cố định nên không lấy `fontSize`. */
export interface SlideTheme { vars: [string, string][]; doc: { fontFamily?: string | undefined } }

interface Props {
  html: string;
  dt?: SlideTheme | null | undefined;
  /** Kiểu tài liệu (paper, compact) như bản xem. */
  doc?: string | undefined;
  /** Cố định khung ngang và tỉ lệ 1 (bản in), không theo cỡ hộp chứa. */
  fixed?: boolean;
  /** Luôn khung ngang (ô thu nhỏ, presenter). */
  landscape?: boolean;
  /** Hiện từng bullet: chỉ `rev` mục đầu của danh sách cấp 1 hiện, còn lại ẩn (giữ chỗ, không đổi bố cục). Bỏ trống = hiện hết. */
  rev?: number | undefined;
  class?: string;
}

/**
 * Một slide trên khung logic cố định, scale cả khung cho vừa hộp chứa.
 * Mọi thứ (hướng khung, cỡ khung, fit nội dung, tỉ lệ ngoài) được ghi thẳng vào DOM trong layout effect, trước khung hình đầu tiên.
 * Không có vòng phản hồi: hộp chứa không phụ thuộc nội dung; nội dung chỉ được đo khi HTML đổi, khi khung đổi hướng, hay khi ảnh/font nạp xong.
 */
export function SlideView({ html, doc, dt, fixed = false, landscape = false, rev, class: cls = '' }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const pos = useRef<HTMLElement>(null);
  const more = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLElement>(null);
  const fittedFor = useRef(''); // "w|html|doc" lần fit gần nhất

  const edges = (cv: HTMLElement) => {
    cv.dataset['top'] = cv.scrollTop > 2 ? '0' : '1';
    cv.dataset['end'] = cv.scrollTop + cv.clientHeight >= cv.scrollHeight - 2 ? '1' : '0';
    const room = cv.scrollHeight - cv.clientHeight;
    const over = cv.dataset['overflow'] === '1';
    const hasMore = over && room - cv.scrollTop > 2, hasLess = over && cv.scrollTop > 2;
    // Cắt theo dòng, không làm mờ chữ: dòng vắt qua mép khung bị ẩn hẳn (không có nửa dòng chữ); khi bên dưới còn nội dung thì chừa một dải
    // ở đáy cho mũi tên "còn nữa". Khung cắt bằng clip-path nên chữ trong vùng thấy được luôn nét.
    const H = cv.clientHeight, c = content.current;
    let cutT = 0, cutB = H;
    if (c && over) {
      const edgeB = hasMore ? H - STRIP : H, cr = cv.getBoundingClientRect(), s = cr.height / Math.max(1, H);
      const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT), rg = document.createRange();
      cutB = edgeB;
      for (let nd = w.nextNode(); nd; nd = w.nextNode()) {
        if (!nd.nodeValue?.trim()) continue;
        rg.selectNodeContents(nd);
        for (const r of Array.from(rg.getClientRects())) {
          const t = (r.top - cr.top) / s, b = (r.bottom - cr.top) / s;
          if (t < edgeB && b > edgeB) cutB = Math.min(cutB, t);
          if (hasLess && t < 0 && b > 0) cutT = Math.max(cutT, b);
        }
      }
    }
    cv.style.clipPath = over ? `inset(${cutT}px 0 ${Math.max(0, H - cutB)}px 0)` : '';
    cv.dataset['cut'] = String(Math.round(cutB)); // vị trí mép dưới thấy được (px khung logic), để kiểm thử
    if (more.current) more.current.dataset['on'] = hasMore ? '1' : '';
    // chỉ báo vị trí cuộn (vạch mảnh bên phải): kích thước = phần nhìn thấy, vị trí = phần đã cuộn
    const ps = pos.current;
    if (ps) {
      ps.dataset['on'] = cv.dataset['overflow'] === '1' && room > 0 ? '1' : '';
      ps.style.setProperty('--s', (cv.clientHeight / Math.max(1, cv.scrollHeight)) * 100 + '%');
      ps.style.setProperty('--p', (room > 0 ? (cv.scrollTop / room) * 100 : 0) + '%');
    }
  };
  const timer = useRef(0);
  const onScroll = () => {
    const cv = canvas.current; if (!cv) return;
    edges(cv); cv.dataset['scrolling'] = '';
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => delete cv.dataset['scrolling'], 900);
  };

  const fit = (W0: number, H0: number) => {
    const c = content.current, cv = canvas.current; if (!c || !cv) return;
    const W = W0 - 2 * PAD, H = H0 - 2 * PAD;
    c.style.transform = 'none'; c.style.width = W + 'px'; c.style.top = PAD + 'px';
    // Thu nhỏ f thì khung nội dung rộng ra W/f nên chữ xuống dòng ít hơn: chiều cao sau thu không tỉ lệ với f. Ước lượng từ chiều cao khi chưa nới
    // quá bi quan (slide dài bị kẹt ở sàn dù vừa ở ~0.6), nên tìm f lớn nhất còn vừa bằng chia đôi trong [sàn, 1].
    const at = (g: number) => { c.style.width = W / g + 'px'; return c.scrollHeight * g; };
    let f = 1;
    if (at(1) > H) {
      if (at(FIT_FLOOR) > H) f = FIT_FLOOR; // dài hơn nữa: về sàn rồi cuộn trong khung
      else { let lo = FIT_FLOOR, hi = 1; for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; if (at(m) <= H) lo = m; else hi = m; } f = lo; }
    }
    c.style.width = W / f + 'px';
    c.style.transform = f < 1 ? `scale(${f})` : 'none';
    const h1 = c.scrollHeight * f;
    c.style.top = PAD + Math.max(0, (H - h1) / 2) + 'px';
    cv.dataset['overflow'] = h1 > H0 - PAD - 16 ? '1' : ''; // cuộn chỉ khi nội dung chạm mép khung (còn dư chút lề đáy thì vẫn coi là vừa)
    cv.scrollTop = 0; edges(cv);
  };
  /** Hướng khung + cỡ khung + fit (khi cần) + tỉ lệ ngoài. `force`: đo lại nội dung dù khung không đổi (ảnh, font vừa nạp). */
  const layout = (force = false) => {
    const b = box.current, cv = canvas.current; if (!b || !cv) return;
    const bw = b.clientWidth, bh = b.clientHeight;
    const port = !fixed && !landscape && bh > bw * 1.15;
    const sz = port ? PORT : LAND;
    if (cv.style.width !== sz.w + 'px') { cv.style.width = sz.w + 'px'; cv.style.height = sz.h + 'px'; }
    const key = `${sz.w}|${html}|${doc ?? ''}|${dt?.doc.fontFamily ?? ''}`;
    if (force || fittedFor.current !== key) { fit(sz.w, sz.h); fittedFor.current = key; }
    if (fixed) { cv.style.transform = 'none'; return; }
    if (!bw || !bh) return;
    const s = Math.min(bw / sz.w, bh / sz.h);
    cv.style.transform = `translate(-50%, -50%) scale(${s})`;
    const fr = frame.current; // lớp chỉ báo trùng đúng khung đã scale; --k để chỉ báo co theo
    if (fr) { const fw = sz.w * s, fh = sz.h * s; fr.style.cssText = `left:${(bw - fw) / 2}px;top:${(bh - fh) / 2}px;width:${fw}px;height:${fh}px;--k:${s}`; }
  };
  const live = useRef(layout); live.current = layout;

  useLayoutEffect(() => {
    live.current();
    const c = content.current;
    const imgs = c ? [...c.querySelectorAll('img')].filter((im) => !im.complete) : [];
    const again = () => live.current(true);
    imgs.forEach((im) => im.addEventListener('load', again, { once: true }));
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) again(); }).catch(() => undefined);
    return () => { alive = false; imgs.forEach((im) => im.removeEventListener('load', again)); };
  }, [html, doc, fixed, landscape]);

  // hiện từng bullet: ẩn bằng visibility (giữ chỗ nên fit/cuộn không đổi); mục vừa hiện được cuộn vào tầm nhìn nếu slide dài
  const shown = useRef(-1);
  useLayoutEffect(() => {
    const c = content.current, cv = canvas.current; if (!c) return;
    const lis = Array.from(c.querySelectorAll<HTMLElement>(STEP_SEL));
    lis.forEach((li, k) => li.classList.toggle('sl-hid', rev !== undefined && k >= rev));
    if (rev !== undefined && rev > shown.current && rev > 0 && cv && cv.dataset['overflow'] === '1') {
      const li = lis[rev - 1];
      if (li) {
        const s = cv.getBoundingClientRect().height / Math.max(1, cv.clientHeight); // tỉ lệ scale ngoài
        const over = (li.getBoundingClientRect().bottom - cv.getBoundingClientRect().bottom) / s + 24;
        if (over > 0) cv.scrollTop += over;
      }
    }
    shown.current = rev ?? -1;
    if (cv) edges(cv);
  }, [rev, html]);

  // đổi cỡ hộp chứa (cửa sổ, ngăn ghi chú): chỉ tỉ lệ ngoài và (nếu đổi hướng) cỡ khung; hộp không phụ thuộc nội dung nên không lặp
  useLayoutEffect(() => {
    const b = box.current; if (!b || fixed) return;
    const ro = new ResizeObserver(() => live.current());
    ro.observe(b);
    return () => ro.disconnect();
  }, [fixed]);

  return (
    <div class={'sv ' + cls + (fixed ? ' sv-fixed' : '')} ref={box} data-dt={dt ? '' : undefined} style={dt ? dt.vars.map(([k, v]) => `${k}:${v}`).join(';') + (dt.doc.fontFamily ? `;--sl-font:${dt.doc.fontFamily}` : '') : undefined}>
      <div class="sv-canvas" ref={canvas} onScroll={onScroll}>
        <article class="md-doc sl-doc" data-doc={doc && doc !== 'default' ? doc : undefined} style={dt?.doc.fontFamily ? `font-family:${dt.doc.fontFamily}` : undefined} ref={content} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      {/* lớp chỉ báo bám đúng khung slide (khung 16:9 nằm giữa ô chứa, có thể có dải trống hai bên): vạch cuộn và mũi tên "còn nữa" */}
      <div class="sv-frame" ref={frame} aria-hidden="true">
        <i class="sv-pos" ref={pos} />
        <i class="sv-more" ref={more}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg></i>
      </div>
    </div>
  );
}
