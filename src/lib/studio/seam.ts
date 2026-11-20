/** Toạ độ x (viewport) của tâm nhóm chế độ xem Edit/Split/Read/Zen ở header: trục đường chia khi Split, tâm vùng nội dung khi Edit hoặc Read. Hàm thuần để test. */
export type SeamView = 'split' | 'src' | 'pv';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** `split`: hình chữ nhật của `.pv-split` (left, width); `ratio` 0..1 là tỉ lệ cột soạn; `panelWidth` là bề rộng panel file bên trái đang hiện (0 nếu không có hoặc đang đóng); `rightWidth` là bề rộng panel inspector bên phải đang hiện (0 nếu đóng). */
export function seamCenter(split: { left: number; width: number }, ratio: number, view: SeamView, panelWidth: number, rightWidth = 0): number {
  const inner = split.width - panelWidth - rightWidth;
  const start = split.left + panelWidth;
  return view === 'split' ? start + inner * clamp(ratio, 0.25, 0.75) : start + inner / 2;
}
