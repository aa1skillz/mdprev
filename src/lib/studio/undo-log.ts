/**
 * Nhật ký undo theo từng tài liệu: phần THUẦN (không DOM), có test.
 *
 * Ô soạn dùng ngăn xếp undo GỐC của trình duyệt (execCommand), thứ không đọc ra hay ghi vào được, và bị xoá mỗi khi gán `value`
 * (đổi tab, reload). Nhật ký này chạy song song: ghi lại từng bước (diff nhỏ nhất) từ sự kiện input; khi cần khôi phục thì
 * DỰNG LẠI ngăn xếp gốc bằng replay (xem `replayUndo` ở MarkdownStudio): đặt ô về văn bản đầu rồi `insertText` từng bước, rồi undo
 * các bước nằm sau con trỏ để chúng thành redo. Gõ mới vẫn hoàn toàn native.
 *
 * Bước lưu `d` (đoạn bị thay) và `i` (đoạn mới) nên KHÔNG cần lưu văn bản gốc: lùi từ văn bản hiện tại là ra.
 * Con trỏ `idx`: steps[0..idx) là undo được, steps[idx..) là redo được.
 */
import { diffSpan } from './edit';

export interface UStep { f: number; d: string; i: string }
export interface ULog { steps: UStep[]; idx: number; run: boolean } // run: bước trên cùng còn nhận thêm chữ gõ liền kề
export const MAX_STEPS = 100;
export const MAX_CHARS = 200_000;
/** Replay chạy qua `execCommand('insertText')`, đắt theo số xuống dòng và cỡ tài liệu (đo: ~8 ms/dòng Chromium, ~60 ms/dòng WebKit trên tài liệu 5000 dòng). Bước lớn hơn mức này là RÀO CHẮN: không replay nổi nên bỏ nó và mọi bước trước nó. */
export const MAX_STEP_CHARS = 8_000;
export const MAX_STEP_LINES = 60;

export const emptyLog = (): ULog => ({ steps: [], idx: 0, run: false });
const fwd = (t: string, s: UStep): string => t.slice(0, s.f) + s.i + t.slice(s.f + s.d.length);
const back = (t: string, s: UStep): string => t.slice(0, s.f) + s.d + t.slice(s.f + s.i.length);
const backOk = (t: string, s: UStep): boolean => t.startsWith(s.i, s.f);
const fwdOk = (t: string, s: UStep): boolean => t.startsWith(s.d, s.f);
const chars = (l: ULog): number => l.steps.reduce((n, s) => n + s.d.length + s.i.length, 0);

/** Băm 32 bit (FNV-1a) + độ dài: chỉ để biết nhật ký đã lưu có thuộc về văn bản đang có không. */
export function hashText(t: string): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 0x01000193); }
  return `${t.length}:${(h >>> 0).toString(36)}`;
}

/** Gõ thường (chữ, xoá lùi/tiến) mới được gộp vào bước trước; dán, cắt, kéo thả, lệnh của thanh định dạng luôn là bước riêng. */
const typing = (it: string): boolean => it === 'insertText' || it === 'deleteContentBackward' || it === 'deleteContentForward' || it === 'insertCompositionText';

function merge(top: UStep, s: UStep, composing: boolean): boolean {
  if (composing && s.f >= top.f && s.f + s.d.length <= top.f + top.i.length) { // IME (Telex…): mỗi phím sửa lại chữ đang soạn nằm trong phần vừa chèn: vẫn là một bước, như ngăn xếp gốc
    const o = s.f - top.f; top.i = top.i.slice(0, o) + s.i + top.i.slice(o + s.d.length); return true;
  }
  if (top.d === '' && s.d === '' && s.f === top.f + top.i.length) { top.i += s.i; return true; } // gõ tiếp ngay sau
  if (top.i === '' && s.i === '' && s.f + s.d.length === top.f) { top.f = s.f; top.d = s.d + top.d; return true; } // Backspace liên tiếp
  if (top.i === '' && s.i === '' && s.f === top.f) { top.d += s.d; return true; } // Delete liên tiếp
  return false;
}

const lines = (t: string): number => { let n = 0; for (let k = t.indexOf('\n'); k !== -1; k = t.indexOf('\n', k + 1)) n++; return n; };
const heavy = (s: UStep): boolean => s.d.length + s.i.length > MAX_STEP_CHARS || lines(s.d) + lines(s.i) > MAX_STEP_LINES;

function trim(l: ULog): void {
  for (let k = l.steps.length - 1; k >= 0; k--) { // bước quá nặng để replay: bỏ nó và mọi thứ trước nó (phần redo thì bỏ nó và mọi thứ sau nó)
    if (!heavy(l.steps[k]!)) continue;
    if (k < l.idx) { l.steps.splice(0, k + 1); l.idx -= k + 1; } else l.steps.length = k;
    break;
  }
  while (l.steps.length > MAX_STEPS || chars(l) > MAX_CHARS) {
    if (l.idx > 0) { l.steps.shift(); l.idx--; } // bỏ bước cũ nhất: mốc đầu nhích lên
    else if (l.steps.length) l.steps.pop(); // chỉ còn redo: bỏ cái mới nhất
    else break;
  }
}

/**
 * Ghi một lần đổi văn bản `oldT` → `newT`. Undo/redo của trình duyệt được nhận ra bằng NỘI DUNG (văn bản mới trùng một mốc trong nhật ký),
 * nên dù ngăn xếp gốc gộp bước khác ta cũng không lệch. Không nhận ra thì coi là sửa mới (xoá phần redo).
 * `brk`: sửa này không được gộp, và gõ kế tiếp cũng không gộp vào nó (lệnh của thanh định dạng).
 */
export function record(l: ULog, oldT: string, newT: string, inputType: string, brk = false): ULog {
  if (oldT === newT) return l;
  if (inputType === 'historyUndo') {
    let s = oldT;
    for (let k = l.idx - 1; k >= 0; k--) { const st = l.steps[k]!; if (!backOk(s, st)) break; s = back(s, st); if (s === newT) { l.idx = k; l.run = false; return l; } }
  } else if (inputType === 'historyRedo') {
    let s = oldT;
    for (let k = l.idx; k < l.steps.length; k++) { const st = l.steps[k]!; if (!fwdOk(s, st)) break; s = fwd(s, st); if (s === newT) { l.idx = k + 1; l.run = false; return l; } }
  }
  const sp = diffSpan(oldT, newT);
  const step: UStep = { f: sp.from, d: oldT.slice(sp.from, sp.aEnd), i: newT.slice(sp.from, sp.bEnd) };
  l.steps.length = l.idx; // sửa mới: phần redo bỏ
  const top = l.steps[l.idx - 1];
  const can = !brk && typing(inputType) && l.run && top !== undefined;
  if (!(can && merge(top!, step, inputType === 'insertCompositionText'))) { l.steps.push(step); l.idx = l.steps.length; }
  l.run = !brk && typing(inputType);
  trim(l);
  return l;
}
/** Ngắt mạch gõ liền (con trỏ nhảy chỗ khác, đổi focus): chữ gõ kế tiếp là bước mới, giống ngăn xếp gốc. */
export const breakRun = (l: ULog): void => { l.run = false; };
/** Có gì để undo / redo (chưa tính trạng thái của ngăn xếp gốc). */
export const canUndoLog = (l: ULog): boolean => l.idx > 0;
export const canRedoLog = (l: ULog): boolean => l.idx < l.steps.length;

export interface UndoRec { v: 1; steps: UStep[]; idx: number; h: string }
/** Bản lưu: kèm mã băm văn bản HIỆN TẠI (trạng thái tại `idx`) để lúc đọc lại kiểm xem còn khớp. Không có gì để undo/redo thì trả null. */
export function pack(l: ULog, text: string): UndoRec | null {
  if (!l.steps.length) return null;
  return { v: 1, steps: l.steps.map((s) => ({ f: s.f, d: s.d, i: s.i })), idx: l.idx, h: hashText(text) };
}
export interface Replay { base: string; steps: UStep[]; idx: number }
const weight = (s: UStep): number => 1 + lines(s.d) + lines(s.i) + (s.d.length + s.i.length) / 500;
/** Cắt bản replay cho vừa ngân sách thời gian của tài liệu cỡ này (nhiều dòng thì mỗi bước replay đắt hơn): bỏ bước undo CŨ nhất (mốc đầu nhích lên), hết thì bỏ redo mới nhất. */
export function fitReplay(p: Replay, docLines: number): Replay {
  const budget = Math.max(12, Math.min(400, Math.floor(80_000 / Math.max(docLines, 100))));
  let { base, steps, idx } = p, total = steps.reduce((n, s) => n + weight(s), 0), drop = 0;
  while (total > budget && drop < idx) { total -= weight(steps[drop]!); base = fwd(base, steps[drop]!); drop++; }
  steps = steps.slice(drop); idx -= drop;
  while (total > budget && steps.length > idx) total -= weight(steps.pop()!);
  return { base, steps, idx };
}
/** Đọc lại bản lưu cho văn bản `text`. Sai khuôn, không khớp mã băm, hoặc bước không ăn khớp với văn bản thì trả null (bỏ, không đoán). */
export function unpack(rec: unknown, text: string): Replay | null {
  const r = rec as Partial<UndoRec> | null | undefined;
  if (!r || r.v !== 1 || !Array.isArray(r.steps) || typeof r.idx !== 'number' || r.h !== hashText(text)) return null;
  const steps = r.steps as UStep[];
  if (steps.length < 1 || steps.length > MAX_STEPS || !Number.isInteger(r.idx) || r.idx < 0 || r.idx > steps.length) return null;
  for (const s of steps) if (!s || !Number.isInteger(s.f) || s.f < 0 || typeof s.d !== 'string' || typeof s.i !== 'string') return null;
  let t = text;
  for (let k = r.idx; k < steps.length; k++) { if (!fwdOk(t, steps[k]!)) return null; t = fwd(t, steps[k]!); } // tới cuối nhánh redo
  let b = text;
  for (let k = r.idx - 1; k >= 0; k--) { if (!backOk(b, steps[k]!)) return null; b = back(b, steps[k]!); }
  return { base: b, steps, idx: r.idx };
}
/** Dựng nhật ký sống từ bản đọc lại. */
export const logOf = (p: Replay): ULog => ({ steps: p.steps.map((s) => ({ ...s })), idx: p.idx, run: false });
