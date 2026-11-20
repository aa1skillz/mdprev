/** Vị trí cuộn của bản xem ứng với dòng nguồn `topLine` (có phần lẻ): tìm khối `data-line` ở trên, nội suy tới khối kế tiếp. Dùng cho studio và cửa sổ pop-out. */
export interface LineEl { line: number; el: HTMLElement }

export function collectLineEls(root: HTMLElement): LineEl[] {
  return [...root.querySelectorAll<HTMLElement>('[data-line]')].map((el) => ({ line: Number(el.dataset['line']), el })).sort((a, b) => a.line - b.line);
}

const relTop = (el: HTMLElement, o: HTMLElement) => el.getBoundingClientRect().top - o.getBoundingClientRect().top + o.scrollTop;

export function scrollTopForLine(o: HTMLElement, idx: LineEl[], topLine: number): number {
  let a = -1;
  for (let i = 0; i < idx.length; i++) { if (idx[i]!.line <= topLine) a = i; else break; }
  if (a < 0) return 0;
  const A = idx[a]!;
  const B = idx.slice(a + 1).find((x) => x.line > A.line);
  const ta = relTop(A.el, o);
  const tb = B ? relTop(B.el, o) : ta + A.el.offsetHeight;
  const frac = B ? Math.min(1, Math.max(0, (topLine - A.line) / (B.line - A.line))) : 0;
  return ta + frac * (tb - ta) - 16;
}
