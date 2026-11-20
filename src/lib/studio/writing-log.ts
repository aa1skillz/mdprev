/** Nhật ký số từ viết mỗi ngày (chỉ lưu trong trình duyệt này, không gửi đi): nền cho "chuỗi ngày" ở tab Checks. */
export type WritingLog = Record<string, number>;
const KEY = 'mdprev-writing-log';
/** Một ngày tính vào chuỗi khi viết được từng này từ. */
export const STREAK_MIN = 50;

export const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addWords(log: WritingLog, day: string, n: number): WritingLog {
  const next: WritingLog = { ...log, [day]: (log[day] ?? 0) + n };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete next[k];
  return next;
}

/** Số ngày liên tiếp đạt ngưỡng, tính tới hôm nay; hôm nay chưa đạt thì tính tới hôm qua. */
export function streak(log: WritingLog, today: Date): number {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if ((log[dayKey(d)] ?? 0) < STREAK_MIN) d.setDate(d.getDate() - 1);
  let n = 0;
  while ((log[dayKey(d)] ?? 0) >= STREAK_MIN) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function readLog(): WritingLog {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown; return v && typeof v === 'object' ? (v as WritingLog) : {}; } catch { return {}; }
}
/** Cộng n từ vào hôm nay. Người gọi bỏ các bước tăng lớn (dán, nạp tài liệu). */
export function bumpToday(n: number): void {
  try { localStorage.setItem(KEY, JSON.stringify(addWords(readLog(), dayKey(new Date()), n))); } catch { /* bị chặn: bỏ qua */ }
}

/** Xoá toàn bộ nhật ký viết (chuỗi ngày, số từ mỗi ngày) khỏi trình duyệt này. */
export function clearLog(): void {
  try { localStorage.removeItem(KEY); } catch { /* bị chặn: bỏ qua */ }
}
