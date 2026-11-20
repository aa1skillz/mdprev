/**
 * Authorship cục bộ (gần đúng): đánh dấu khoảng chữ dán, kéo thả hoặc có sẵn khi mở file, phần còn lại coi là tự gõ.
 * Mọi thay đổi đi qua so khác biệt trước/sau (tiền tố và hậu tố chung) nên undo/redo, IME, slash, lệnh dòng đều dời khoảng đúng;
 * loại của phần chèn lấy từ sự kiện vừa xảy ra (paste, drop, mở file). Không phải bằng chứng chống giả mạo: chỉ là bản ghi tự khai.
 */
export type Kind = 'paste' | 'drop' | 'import';
export interface Span { s: number; e: number; k: Kind }

/** Vùng thay đổi duy nhất bao trùm: [at, at+del) của bản cũ thành [at, at+ins) của bản mới. Null nếu không đổi. */
export function diffEdit(prev: string, next: string): { at: number; del: number; ins: number } | null {
  if (prev === next) return null;
  const max = Math.min(prev.length, next.length);
  let a = 0;
  while (a < max && prev.charCodeAt(a) === next.charCodeAt(a)) a++;
  let b = 0;
  while (b < max - a && prev.charCodeAt(prev.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++;
  return { at: a, del: prev.length - a - b, ins: next.length - a - b };
}

/** Dời các khoảng theo một thay đổi; phần chèn mang loại `kind` (null = gõ tay, không đánh dấu). */
export function applyChange(spans: Span[], prev: string, next: string, kind: Kind | null): Span[] {
  const d = diffEdit(prev, next);
  if (!d) return spans;
  const { at, del, ins } = d;
  const end = at + del, shift = ins - del;
  const out: Span[] = [];
  for (const sp of spans) {
    if (sp.e <= at) out.push(sp); // trước vùng sửa
    else if (sp.s >= end) out.push({ s: sp.s + shift, e: sp.e + shift, k: sp.k }); // sau vùng sửa
    else { // chồng lên vùng sửa: giữ phần trước và phần sau
      if (sp.s < at) out.push({ s: sp.s, e: at, k: sp.k });
      if (sp.e > end) out.push({ s: end + shift, e: sp.e + shift, k: sp.k });
    }
  }
  if (kind && ins > 0) out.push({ s: at, e: at + ins, k: kind });
  out.sort((x, y) => x.s - y.s);
  const merged: Span[] = [];
  for (const sp of out) {
    if (sp.e <= sp.s) continue;
    const last = merged[merged.length - 1];
    if (last && last.k === sp.k && last.e >= sp.s) last.e = Math.max(last.e, sp.e);
    else merged.push({ ...sp });
  }
  return merged;
}

export function summarize(spans: Span[], len: number): Record<'typed' | Kind, number> {
  const r = { typed: 0, paste: 0, drop: 0, import: 0 };
  for (const sp of spans) r[sp.k] += Math.min(sp.e, len) - Math.min(sp.s, len);
  r.typed = Math.max(0, len - r.paste - r.drop - r.import);
  return r;
}
