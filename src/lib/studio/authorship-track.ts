/**
 * Bộ theo dõi authorship trong trình duyệt (nạp lười, chỉ khi người dùng bật). Nghe paste/drop/beforeinput trên ô soạn để biết
 * loại của lần sửa tới, dời khoảng bằng so khác biệt (authorship.ts), lưu IndexedDB (không ghi vào file .md), tô bằng CSS.highlights
 * như Find: không đụng DOM của lớp tô `.ed-hl` (sửa DOM lớp này làm hỏng nhóm hoàn tác).
 */
import { applyChange, summarize, type Kind, type Span } from './authorship';

const DB = 'mdprev-authorship', STORE = 'docs', KEY = 'main';
const PENDING_MS = 5000; // dán HTML chuyển sang Markdown bất đồng bộ: loại "paste" còn hiệu lực một lúc
const MEMO = 200;

interface Rec { text: string; spans: Span[]; t: number }
function db(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch { res(null); }
  });
}
async function readRec(): Promise<Rec | null> {
  const d = await db(); if (!d) return null;
  return new Promise((res) => { try { const q = d.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res((q.result as Rec | undefined) ?? null); q.onerror = () => res(null); } catch { res(null); } });
}
async function writeRec(r: Rec | null): Promise<void> {
  const d = await db(); if (!d) return;
  try { const s = d.transaction(STORE, 'readwrite').objectStore(STORE); if (r) s.put(r, KEY); else s.delete(KEY); } catch { /* bỏ qua */ }
}
/** Băm nhanh (FNV-1a) để nhận lại trạng thái cũ khi hoàn tác/làm lại. */
const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + ':' + s.length; };

export interface Tracker {
  update(text: string): void;
  /** Lần đổi văn bản tới là tài liệu mới (mở file, template…): coi cả văn bản là "có sẵn", không phải tự gõ. */
  mark(k: Kind): void;
  paint(hl: Element | null, on: boolean): void;
  stats(): Record<'typed' | Kind, number> & { len: number };
  json(): string;
  clear(): void;
  destroy(): void;
}

export async function createTracker(ta: HTMLTextAreaElement, initial: string): Promise<Tracker> {
  const rec = await readRec();
  let text = initial;
  // bản ghi cũ: dời theo phần đã đổi ở nơi khác (tab khác, lúc tắt theo dõi) và coi phần đó là "có sẵn"; chưa có thì cả văn bản là có sẵn
  let spans: Span[] = rec ? applyChange(rec.spans, rec.text, initial, 'import') : initial ? [{ s: 0, e: initial.length, k: 'import' }] : [];
  let pending: { k: Kind; t: number } | null = null;
  let history = false;
  let reset = false;
  const memo = new Map<string, Span[]>([[hash(text), spans]]);
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = window.setTimeout(() => void writeRec({ text, spans, t: Date.now() }), 800); };
  save();

  const onBefore = (e: InputEvent) => {
    const it = e.inputType;
    if (it === 'insertFromPaste' || it === 'insertFromPasteAsQuotation') pending = { k: 'paste', t: Date.now() };
    else if (it === 'insertFromDrop') pending = { k: 'drop', t: Date.now() };
    else if (it === 'historyUndo' || it === 'historyRedo') history = true;
  };
  const onPaste = () => { pending = { k: 'paste', t: Date.now() }; }; // studio có thể tự chèn (bảng, HTML → Markdown): beforeinput không có
  const onDrop = () => { pending = { k: 'drop', t: Date.now() }; };
  const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) history = true; };
  ta.addEventListener('beforeinput', onBefore, true);
  ta.addEventListener('paste', onPaste, true);
  ta.addEventListener('drop', onDrop, true);
  ta.addEventListener('keydown', onKey, true);

  let painted = '';
  const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  const unpaint = () => { reg?.delete('mdprev-auth'); painted = ''; };

  return {
    update(next) {
      if (next === text) return;
      if (reset) { reset = false; spans = next ? [{ s: 0, e: next.length, k: 'import' }] : []; }
      else {
        const known = history ? memo.get(hash(next)) : undefined;
        if (known) spans = known; // hoàn tác/làm lại về trạng thái đã thấy: lấy lại đúng khoảng của lúc đó (kể cả chữ dán)
        else spans = applyChange(spans, text, next, pending && Date.now() - pending.t < PENDING_MS ? pending.k : null);
      }
      pending = null; history = false;
      text = next;
      memo.set(hash(next), spans);
      if (memo.size > MEMO) memo.delete(memo.keys().next().value!);
      save();
    },
    mark(k) { if (k === 'import') reset = true; else pending = { k, t: Date.now() }; },
    paint(hl, on) {
      if (!reg || !H) return;
      if (!on || !hl) { unpaint(); return; }
      const lines = hl.querySelectorAll('.l');
      const starts = [0]; for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
      if (lines.length !== starts.length) return; // lớp tô chưa theo kịp
      const key = hash(text) + JSON.stringify(spans.length) + lines.length;
      if (key === painted && reg.has('mdprev-auth')) return;
      const locate = (off: number): [Node, number] => {
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= off) lo = mid; else hi = mid - 1; }
        const el = lines[lo]!;
        let rem = off - starts[lo]!;
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) { const len = (n as Text).data.length; if (rem <= len) return [n, rem]; rem -= len; }
        return [el, el.childNodes.length];
      };
      try {
        const rs = spans.filter((s) => s.k !== 'import').slice(0, 3000).map((s) => { const [a, b] = locate(s.s), [c, d] = locate(s.e); const r = new Range(); r.setStart(a, b); r.setEnd(c, d); return r; });
        reg.set('mdprev-auth', new H(...rs));
        painted = key;
      } catch { unpaint(); }
    },
    stats() { return { ...summarize(spans, text.length), len: text.length }; },
    json() { return JSON.stringify({ format: 'mdprev-authorship', version: 1, note: 'Local, self-reported, approximate record. Not proof against tampering.', length: text.length, spans }, null, 1); },
    clear() { spans = text ? [{ s: 0, e: text.length, k: 'import' }] : []; memo.clear(); save(); unpaint(); },
    destroy() {
      clearTimeout(saveT); void writeRec({ text, spans, t: Date.now() });
      ta.removeEventListener('beforeinput', onBefore, true); ta.removeEventListener('paste', onPaste, true);
      ta.removeEventListener('drop', onDrop, true); ta.removeEventListener('keydown', onKey, true);
      unpaint();
    },
  };
}
