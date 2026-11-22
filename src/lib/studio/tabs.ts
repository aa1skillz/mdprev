/**
 * Nhiều tài liệu (tab) trong một ô soạn.
 *
 * Phần THUẦN (không đụng trình duyệt): mô hình + các thao tác bất biến, có test.
 * Phần LƯU: metadata nhỏ ở localStorage `mdprev-md-tabs` (đồng bộ, để khởi động không chờ), nội dung tab ở IndexedDB
 * `mdprev-md-tabs` (DB MỚI: bản cũ bỏ qua, nên rollback an toàn). Văn bản tab đang chọn luôn được ghi gương vào
 * `mdprev-md` / `mdprev-md-name` như trước (bản cũ vẫn mở đúng tài liệu đó).
 */

export const MAX_TABS = 12;
export const MAX_CLOSED = 10;

export type TabView = 'split' | 'src' | 'pv';
const isTabView = (v: unknown): v is TabView => v === 'split' || v === 'src' || v === 'pv';

export interface Tab {
  id: string;
  name: string; // '' = chưa đặt tên (hiện "Untitled.md")
  text: string | null; // null = chưa nạp từ IndexedDB (chỉ tab không chọn)
  baseline: string; // "Revert all"
  savedFile: string | null; // nội dung lần lưu gần nhất ra FILE trên máy (null = chưa có file)
  base: string | null; // URL gốc nếu mở từ link (mdBase)
  sel: { s: number; e: number };
  top: number;
  updatedAt: number;
  hasFile: boolean; // đã mở/lưu từ file trên máy: chỉ tab này mới có chấm "đã sửa so với file"
  view?: TabView; // chế độ Edit/Split/Read riêng của tab; chưa đặt thì dùng chế độ đang có
}

export interface TabsState {
  tabs: Tab[]; // thứ tự hiển thị
  activeId: string;
  closed: Tab[]; // mới đóng nhất ở đầu, tối đa MAX_CLOSED
}

let seq = 0;
export const newId = (): string => 't' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

export function makeTab(p: Partial<Tab> = {}): Tab {
  const text = p.text === undefined ? '' : p.text;
  return {
    id: p.id ?? newId(), name: p.name ?? '', text, baseline: p.baseline ?? (text ?? ''), savedFile: p.savedFile ?? null, base: p.base ?? null,
    sel: p.sel ?? { s: 0, e: 0 }, top: p.top ?? 0, updatedAt: p.updatedAt ?? Date.now(), hasFile: p.hasFile ?? false,
    ...(isTabView(p.view) ? { view: p.view } : {}),
  };
}

export const initialState = (tab: Tab = makeTab()): TabsState => ({ tabs: [tab], activeId: tab.id, closed: [] });
export const getActive = (s: TabsState): Tab => s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0]!;
/** Tab rỗng, chưa đụng tới: được dùng lại thay vì đẻ thêm tab thừa. */
export const isPristine = (t: Tab): boolean => t.text === '' && t.name === '' && !t.hasFile && t.base === null;
/** Chấm "đã sửa so với file trên đĩa": chỉ tab có file. */
export const isChangedVsFile = (t: Tab): boolean => t.hasFile && t.savedFile !== null && t.text !== null && t.text !== t.savedFile;

const patch = (s: TabsState, id: string, p: Partial<Tab>): TabsState => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...p } : t)) });
/** Ghi lại trạng thái tab (văn bản, con trỏ, cuộn…) khi đang chọn hoặc trước khi rời. */
export const updateTab = (s: TabsState, id: string, p: Partial<Tab>): TabsState => patch(s, id, { ...p, updatedAt: Date.now() });

export type OpenResult = { state: TabsState; id: string; reused: boolean } | { state: TabsState; id: null; reused: false; full: true };

/** Mở tài liệu mới thành tab MỚI (chọn luôn). Nếu tab đang chọn rỗng và nguyên vẹn thì dùng lại nó. Đầy MAX_TABS thì từ chối. */
export function openTab(s: TabsState, p: Partial<Tab>): OpenResult {
  const cur = getActive(s);
  if (isPristine(cur)) {
    const t = makeTab({ ...p, id: cur.id });
    return { state: { ...s, tabs: s.tabs.map((x) => (x.id === cur.id ? t : x)) }, id: cur.id, reused: true };
  }
  if (s.tabs.length >= MAX_TABS) return { state: s, id: null, reused: false, full: true };
  const t = makeTab(p);
  const i = s.tabs.findIndex((x) => x.id === s.activeId);
  const tabs = [...s.tabs.slice(0, i + 1), t, ...s.tabs.slice(i + 1)]; // ngay sau tab đang chọn
  return { state: { ...s, tabs, activeId: t.id }, id: t.id, reused: false };
}

export const activate = (s: TabsState, id: string): TabsState => (s.tabs.some((t) => t.id === id) ? { ...s, activeId: id } : s);
export const activateOffset = (s: TabsState, d: number): TabsState => {
  const i = s.tabs.findIndex((t) => t.id === s.activeId), n = s.tabs.length;
  return n < 2 ? s : { ...s, activeId: s.tabs[(i + d + n) % n]!.id };
};
export const activateIndex = (s: TabsState, i: number): TabsState => (s.tabs[i] ? { ...s, activeId: s.tabs[i]!.id } : s);

/** Đóng tab: vào ngăn xếp "đóng gần đây"; chọn tab kế bên; đóng tab cuối thì còn lại một tab rỗng (luôn ≥ 1 tab). */
export function closeTab(s: TabsState, id: string): TabsState {
  const i = s.tabs.findIndex((t) => t.id === id);
  if (i < 0) return s;
  const gone = s.tabs[i]!;
  const closed = isPristine(gone) ? s.closed : [gone, ...s.closed].slice(0, MAX_CLOSED);
  const rest = s.tabs.filter((t) => t.id !== id);
  if (!rest.length) { const t = makeTab(); return { tabs: [t], activeId: t.id, closed }; }
  const activeId = s.activeId !== id ? s.activeId : rest[Math.min(i, rest.length - 1)]!.id;
  return { tabs: rest, activeId, closed };
}

/** Mở lại tab đóng gần nhất (đặt về chỗ cũ nếu còn, không thì cuối). Đầy tab thì từ chối. */
export function reopenClosed(s: TabsState): { state: TabsState; id: string | null; full?: true } {
  const t = s.closed[0];
  if (!t) return { state: s, id: null };
  let tabs = s.tabs;
  if (isPristine(getActive(s)) && tabs.length === 1) tabs = []; // thay tab rỗng duy nhất
  else if (tabs.length >= MAX_TABS) return { state: s, id: null, full: true };
  return { state: { tabs: [...tabs, t], activeId: t.id, closed: s.closed.slice(1) }, id: t.id };
}

export const renameTab = (s: TabsState, id: string, name: string): TabsState => patch(s, id, { name: name.trim().slice(0, 120) });
export function moveTab(s: TabsState, id: string, to: number): TabsState {
  const i = s.tabs.findIndex((t) => t.id === id);
  if (i < 0) return s;
  const tabs = s.tabs.slice(); const [t] = tabs.splice(i, 1); tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, t!);
  return { ...s, tabs };
}

/** Tên hiển thị: tên đã đặt, không thì tiêu đề (dòng # đầu), không thì "Untitled.md"; tab trùng tên được đánh số (2), (3). */
export function displayNames(tabs: Tab[], titleOf: (text: string) => string): string[] {
  const base = tabs.map((t) => t.name || (t.text ? titleOf(t.text) : '') || 'Untitled.md');
  const seen = new Map<string, number>();
  return base.map((n) => { const c = (seen.get(n) ?? 0) + 1; seen.set(n, c); return c > 1 ? `${n} (${c})` : n; });
}

/**
 * Cắt nhãn Ở GIỮA cho vừa `fits` (hàm đo độ rộng thật do giao diện truyền vào): giữ đầu và ĐUÔI, vì phần phân biệt hai tài liệu
 * ("…so-mot" / "…so-hai", "(2)") thường nằm ở cuối. Vừa sẵn thì trả nguyên. Đuôi giữ ít nhất `tail` ký tự (hoặc 40% phần giữ lại nếu nhiều hơn).
 */
export function midCut(name: string, fits: (label: string) => boolean, tail = 5): string {
  if (fits(name)) return name;
  const c = Array.from(name), n = c.length;
  if (n < 3) return name;
  const mk = (k: number): string => { // k = số ký tự giữ lại (đầu + đuôi), cộng dấu …
    const t = Math.max(1, Math.min(k - 1, Math.max(Math.min(tail, k - 2), Math.round(k * 0.4))));
    return c.slice(0, k - t).join('') + '…' + c.slice(n - t).join('');
  };
  let lo = 2, hi = n - 1, best = mk(2);
  while (lo <= hi) { const k = (lo + hi) >> 1; if (fits(mk(k))) { best = mk(k); lo = k + 1; } else hi = k - 1; }
  return best;
}

// ---------- metadata nhỏ (localStorage) ----------
export const META_KEY = 'mdprev-md-tabs';
interface Meta { v: 1; order: { id: string; name: string; hasFile: boolean; base: string | null; view?: TabView }[]; active: string; closed: string[] }
export const toMeta = (s: TabsState): string => JSON.stringify({ v: 1, order: s.tabs.map((t) => ({ id: t.id, name: t.name, hasFile: t.hasFile, base: t.base, ...(t.view ? { view: t.view } : {}) })), active: s.activeId, closed: s.closed.map((t) => t.id) } satisfies Meta);

/**
 * Dựng trạng thái lúc khởi động, ĐỒNG BỘ: tab đang chọn lấy văn bản từ `mdprev-md` (nguồn sự thật, rollback-safe);
 * tab khác có text = null cho tới khi `hydrate` đọc IndexedDB. Chưa có metadata thì tạo tab 1 từ `mdprev-md`/`mdprev-md-name` (không xoá khoá cũ).
 */
export function restore(metaRaw: string | null, activeText: string, activeName: string, mirrorId: string | null = null): TabsState {
  let m: Meta | null = null;
  try { const j = metaRaw ? (JSON.parse(metaRaw) as Meta) : null; if (j && j.v === 1 && Array.isArray(j.order) && j.order.length) m = j; } catch { /* hỏng thì làm lại từ khoá cũ */ }
  if (!m) return initialState(makeTab({ text: activeText, name: activeName, baseline: activeText }));
  // bản gương mdprev-md thuộc về tab ghi nó gần nhất (có thể là cửa sổ khác): tin id đó hơn metadata nếu hợp lệ
  const mirrorOwn = !!mirrorId && m.order.some((o) => o.id === mirrorId);
  const order = mirrorId && !mirrorOwn ? [...m.order.slice(0, MAX_TABS - 1), { id: mirrorId, name: activeName, hasFile: false, base: null }] : m.order; // gương của tab không có trong metadata: thành tab riêng, KHÔNG đưa văn bản sang tab khác
  const active = mirrorId ? mirrorId : m.order.some((o) => o.id === m.active) ? m.active : m.order[0]!.id;
  const tabs = order.slice(0, MAX_TABS).map((o) => makeTab({ id: o.id, name: o.name, hasFile: o.hasFile, base: o.base, ...(o.view ? { view: o.view } : {}), text: o.id === active ? activeText : null, baseline: o.id === active ? activeText : '' }));
  const act = tabs.find((t) => t.id === active)!; act.name = activeName; // tên tab đang chọn lấy từ gương
  return { tabs, activeId: active, closed: m.closed.filter((id) => id !== active).slice(0, MAX_CLOSED).map((id) => makeTab({ id, text: null })) };
}

// ---------- IndexedDB (nội dung tab) ----------
const DB = 'mdprev-md-tabs', STORE = 'tabs';
const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = <T,>(mode: IDBTransactionMode, f: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> => open().then((db) => new Promise<T>((res, rej) => {
  const t = db.transaction(STORE, mode); const rq = f(t.objectStore(STORE));
  t.oncomplete = () => { db.close(); res(rq.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error); };
}));

export const saveTabRecord = (t: Tab): Promise<unknown> => tx('readwrite', (s) => s.put(t));
export const deleteTabRecord = (id: string): Promise<unknown> => tx('readwrite', (s) => s.delete(id));
export const loadTabRecord = (id: string): Promise<Tab | undefined> => tx<Tab | undefined>('readonly', (s) => s.get(id) as IDBRequest<Tab | undefined>);
/** Điền text/baseline/vị trí cho các tab chưa nạp (không đè tab đã có text). Lỗi IndexedDB thì giữ nguyên (tab thành rỗng khi chọn, không mất tab đang chọn). */
export async function hydrate(s: TabsState): Promise<TabsState> {
  let out = s;
  const need = [...s.tabs, ...s.closed].filter((t) => t.text === null);
  for (const t of need) {
    const rec = await loadTabRecord(t.id).catch(() => undefined);
    if (!rec) continue;
    const fill = (x: Tab): Tab => (x.id === t.id && x.text === null ? { ...x, ...rec, name: x.name || rec.name } : x);
    out = { ...out, tabs: out.tabs.map(fill), closed: out.closed.map(fill) };
  }
  return out;
}
/** Xoá bản ghi của tab đã bị đẩy khỏi ngăn xếp "đóng gần đây" (hoặc đóng lại tab rỗng). */
export const pruneRecords = async (keep: Set<string>): Promise<void> => {
  const all = await tx<string[]>('readonly', (s) => s.getAllKeys() as IDBRequest<string[]>).catch(() => [] as string[]);
  await Promise.all(all.filter((k) => !keep.has(k)).map((k) => deleteTabRecord(k).catch(() => undefined)));
};
