/** Kênh giữa màn chiếu (trong studio) và cửa sổ người trình bày (`/app/presenter/`). */
export const PRESENT_CHANNEL = 'mdprev-md-present';
export const PRESENTER_NAME = 'mdprev-md-presenter';

export type PresentMsg =
  | { t: 'state'; slides: { html: string; notes: string }[]; i: number; t0: number; blank: boolean; rev?: number; rt?: number; doc?: string; dt?: { vars: [string, string][]; doc: { fontFamily?: string | undefined } } | null }
  | { t: 'end' }
  | { t: 'hello' }
  | { t: 'go'; i: number }
  | { t: 'step'; d: number; s?: boolean } // s: lệnh từ phím cuộn (↓/Space/PageDown/↑...): bên nhận cuộn trong slide dài trước khi chuyển
  | { t: 'blank' }
  | { t: 'reset' }
  | { t: 'scroll'; i: number; f: number };

/** Các mục được hiện từng bước: li của danh sách cấp 1 trong slide (gốc là `.sl-doc`). */
export const STEP_SEL = ':scope > ul > li, :scope > ol > li';
/** Số bước hiện từng bullet của một slide (0 = không có danh sách). */
export function revealCount(html: string): number {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.querySelectorAll(STEP_SEL).length;
}

/** mm:ss (hoặc h:mm:ss khi quá một giờ). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

/** Slide dài: cuộn nội dung trong khung trước khi chuyển slide. `true` nếu đã cuộn (còn chỗ để cuộn theo hướng đó). */
export function scrollWithin(cv: HTMLElement | null | undefined, fwd: boolean): boolean {
  if (!cv) return false;
  const room = fwd ? cv.scrollHeight - cv.clientHeight - cv.scrollTop > 2 : cv.scrollTop > 2;
  if (room) cv.scrollBy({ top: (fwd ? 1 : -1) * cv.clientHeight * 0.8, behavior: 'smooth' });
  return room;
}

/**
 * Đồng bộ vị trí cuộn của slide hiện tại giữa màn chiếu và presenter, theo tỉ lệ 0..1 (hai khung có thể khác cỡ/hướng).
 * `root` chứa slide hiện tại (`.sv-canvas[data-overflow]`); trả về hàm gỡ. Áp dụng không hoạt ảnh, bỏ qua lệch <1% và không phát lại tin vừa nhận nên không dội ngược.
 */
export function syncScroll(bc: BroadcastChannel, root: () => HTMLElement | null, index: () => number): { onMsg: (m: PresentMsg) => void; stop: () => void } {
  const canvas = () => root()?.querySelector<HTMLElement>('.sv-canvas[data-overflow="1"]') ?? null;
  const frac = (cv: HTMLElement) => { const r = cv.scrollHeight - cv.clientHeight; return r > 0 ? cv.scrollTop / r : 0; };
  let mute = 0; // sự kiện scroll do chính ta áp dụng từ bên kia không được dội ngược (làm đứt hoạt ảnh cuộn mượt ở bên gửi)
  const onScroll = (ev: Event) => {
    const cv = ev.target as HTMLElement;
    if (cv !== canvas() || performance.now() < mute) return;
    bc.postMessage({ t: 'scroll', i: index(), f: frac(cv) } satisfies PresentMsg);
  };
  document.addEventListener('scroll', onScroll, true); // `root` có thể chưa render lúc gắn (presenter chờ state): nghe ở document, lọc theo canvas hiện tại
  return {
    onMsg: (m) => {
      if (m.t !== 'scroll' || m.i !== index()) return;
      const cv = canvas(); if (!cv || Math.abs(frac(cv) - m.f) < 0.01) return;
      mute = performance.now() + 120;
      cv.scrollTo({ top: m.f * (cv.scrollHeight - cv.clientHeight), behavior: 'instant' });
    },
    stop: () => document.removeEventListener('scroll', onScroll, true),
  };
}
