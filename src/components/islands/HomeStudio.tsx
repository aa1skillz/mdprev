import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';

/**
 * Trang chủ `/`: ai đã có tài liệu riêng (hoặc mở link chia sẻ) thì editor nạp ngay. Khách lần đầu thấy khung tĩnh dựng sẵn và
 * editor (~170 KB JS) chỉ nạp khi họ bấm vào khung, hoặc Tab tới nó, nên trang đầu nhẹ và nhanh. Khung tĩnh là một nút bàn phím
 * được: thiếu điều đó, người dùng bàn phím sẽ không bao giờ có editor.
 */
function focusEditorSoon(): void {
  const t0 = performance.now();
  const tick = () => {
    const ta = document.querySelector<HTMLTextAreaElement>('.pv .ed-ta');
    if (ta) { ta.focus({ preventScroll: true }); return; }
    if (performance.now() - t0 < 5000) setTimeout(tick, 50);
  };
  tick();
}

export default function HomeStudio() {
  const [Studio, setStudio] = useState<ComponentType | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const facade = document.querySelector<HTMLElement>('.studio-facade');
    let started = false;

    const load = async (focus: boolean): Promise<void> => {
      if (started) return;
      started = true;
      root.dataset['studio'] = 'loading';
      try {
        const m = await import('./MarkdownStudio');
        setStudio(() => m.default);
        if (focus) focusEditorSoon();
      } catch {
        started = false; // không nạp được (mạng): cho phép bấm lại
        delete root.dataset['studio'];
      }
    };

    if (root.dataset['returning'] === '1' || !facade) { void load(false); return; }
    // Thẻ chào trong khung tĩnh: nút mang data-wact (start | open | sample). Nạp editor rồi MarkdownStudio đọc `__mdAct` khi mount.
    // "Inspect a skill" là liên kết thường: để trình duyệt điều hướng, không nạp editor. Phím in được đầu tiên cũng nạp editor và được
    // chuyển cho nó (`__mdKey`) để không nuốt mất chữ đầu tiên.
    const w = window as unknown as { __mdAct?: string; __mdKey?: string; __mdLive?: boolean };
    const go = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('a[href]')) return;
      const act = t?.closest?.<HTMLElement>('[data-wact]')?.dataset['wact'];
      if (act) w.__mdAct = act;
      void load(true);
    };
    // Tab tới nút của thẻ chưa làm gì: nạp editor sẽ thay khung (nút biến mất giữa lúc Enter). Chỉ Tab vào phần khác của khung mới nạp.
    const warm = (e: Event) => { if ((e.target as HTMLElement | null)?.closest?.('.welcome')) return; go(e); };
    // Gõ nhanh trong lúc editor đang nạp (vài trăm ms): gom mọi phím in được vào `__mdKey` để không rơi mất chữ nào; ô soạn nhận cả chuỗi khi lên.
    const typed = (ev: KeyboardEvent) => {
      // `__mdLive`: MarkdownStudio đã gắn bộ bắt phím của nó (đặt trong effect mount). Chỉ khi đó mới thôi gom: giữa lúc ô soạn vừa dựng xong và lúc effect
      // chạy có một khung hình mà không ai nhận phím (WebKit lộ ra), nên "có ô soạn" chưa đủ để ngừng gom.
      if (w.__mdLive || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing || ev.key.length !== 1 || ev.key === '/' || ev.key === '?') return; // "/" (palette) và "?" (trợ giúp) mở lớp phủ chứ không phải để gõ chữ
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.('button, a[href], input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], .pal')) return;
      w.__mdKey = (w.__mdKey ?? '') + ev.key; ev.preventDefault(); void load(true);
    };
    document.addEventListener('keydown', typed);
    // chạm vào đâu trong khung cũng nạp editor; nút của thẻ là nút thật nên bàn phím (Tab tới, Enter) cũng dùng được
    facade.addEventListener('pointerdown', go);
    facade.addEventListener('focusin', warm);
    facade.addEventListener('click', go);
    return () => { document.removeEventListener('keydown', typed); facade.removeEventListener('pointerdown', go); facade.removeEventListener('focusin', warm); facade.removeEventListener('click', go); };
  }, []);

  return Studio ? <Studio /> : null;
}
