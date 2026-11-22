/**
 * Khoá ổn định cho các <details> trong bản xem: chữ của summary + thứ tự lần xuất hiện của summary đó.
 * Chèn/xoá <details> khác ở phía trên không đổi khoá của các khối còn lại (khác với chỉ số vị trí).
 */
export function detailsKeys(summaries: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return summaries.map((s) => {
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    return s + '\u0000' + n;
  });
}
