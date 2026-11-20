/** Chuẩn hóa không dấu, chữ thường. Dùng chung cho lọc mục lục và gợi ý. */
export function nrm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
