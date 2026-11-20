/**
 * Tự đóng cặp, cố ý hẹp: chỉ `(`, `"` và dấu huyền (`) khi KHÔNG chọn gì.
 * Không đụng `[` `]` `{` vì Telex dùng `[`/`]` để gõ ơ, ư (xem `wrapKey`); không đụng `'` vì là dấu nháy đơn/dấu lược trong chữ (don't);
 * `*` và `_` đã có kiểu bọc vùng chọn. Mọi hàm thuần, trả `Edit` hoặc null (null = để trình duyệt gõ bình thường).
 */
import type { Edit } from './edit';

const OPEN: Record<string, string> = { '(': ')', '"': '"', '`': '`' };
const lineBefore = (t: string, s: number): string => t.slice(t.lastIndexOf('\n', s - 1) + 1, s);
const count = (s: string, c: string): number => { let n = 0; for (const x of s) if (x === c) n++; return n; };
/** Chỗ sau con trỏ là ranh giới (hết dòng, khoảng trắng, hoặc dấu đóng/câu) thì mới chèn cặp. */
const edgeAfter = (c: string | undefined): boolean => c === undefined || /[\s)\]}.,;:!?]/.test(c);
/** Trước con trỏ là đầu dòng, khoảng trắng hoặc dấu mở thì dấu nháy/huyền là dấu MỞ (không phải đóng sau một chữ). */
const edgeBefore = (c: string | undefined): boolean => c === undefined || /[\s([{>\-–—]/.test(c);

export function autoPair(text: string, s: number, e: number, key: string): Edit | null {
  if (s !== e || key.length !== 1) return null;
  const prev = text[s - 1], next = text[s];
  // gõ ký tự đóng ngay trước ký tự đóng cùng loại đã có: nhảy qua thay vì nhân đôi
  if (next === key && (key === ')' || key === '"' || key === '`')) {
    const before = lineBefore(text, s);
    const unmatched = key === ')' ? count(before, '(') > count(before, ')') : count(before, key) % 2 === 1;
    if (unmatched) return { text, start: s + 1, end: s + 1 };
  }
  const close = OPEN[key];
  if (close === undefined) return null;
  if (key === '(' && prev === ']') return null; // `](` mở liên kết/ảnh: gợi ý link tự thêm dấu đóng, đóng cặp ở đây sẽ thành `))`
  if (key === '(' ? !edgeAfter(next) : !(edgeAfter(next) && edgeBefore(prev))) return null;
  return { text: text.slice(0, s) + key + close + text.slice(s), start: s + 1, end: s + 1 };
}

/** Backspace giữa một cặp rỗng do tự đóng cặp tạo ra (`()`, `""`, ``): xoá cả hai. */
export function backPair(text: string, s: number, e: number): Edit | null {
  if (s !== e || s === 0) return null;
  const a = text[s - 1], b = text[s];
  if (a === undefined || b === undefined || OPEN[a] !== b) return null;
  return { text: text.slice(0, s - 1) + text.slice(s + 1), start: s - 1, end: s - 1 };
}
