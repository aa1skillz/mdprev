import { describe, expect, it } from 'vitest';
import { MAX_CLOSED, MAX_TABS, activate, activateIndex, activateOffset, closeTab, displayNames, getActive, initialState, isChangedVsFile, isPristine, makeTab, moveTab, openTab, renameTab, reopenClosed, restore, midCut, toMeta } from '../src/lib/studio/tabs';

const doc = (text: string, name = '') => makeTab({ text, name });
const opened = (s: ReturnType<typeof initialState>, text: string) => { const r = openTab(s, { text }); expect(r.id).not.toBeNull(); return r.state; };

describe('openTab', () => {
  it('tab đang chọn rỗng và nguyên vẹn thì dùng lại, không đẻ tab thừa', () => {
    const s = initialState();
    const r = openTab(s, { text: '# A', name: 'a.md' });
    expect(r.reused).toBe(true);
    expect(r.state.tabs).toHaveLength(1);
    expect(getActive(r.state).text).toBe('# A');
    expect(r.state.activeId).toBe(s.activeId);
  });
  it('có nội dung thì mở tab MỚI ngay sau tab đang chọn và chọn nó', () => {
    let s = initialState(doc('one'));
    s = opened(s, 'two'); s = opened(s, 'three');
    s = activateIndex(s, 0);
    s = opened(s, 'four');
    expect(s.tabs.map((t) => t.text)).toEqual(['one', 'four', 'two', 'three']);
    expect(getActive(s).text).toBe('four');
  });
  it('tab rỗng nhưng có tên/file/URL gốc thì KHÔNG phải nguyên vẹn', () => {
    expect(isPristine(makeTab())).toBe(true);
    expect(isPristine(makeTab({ name: 'x.md' }))).toBe(false);
    expect(isPristine(makeTab({ hasFile: true }))).toBe(false);
    expect(isPristine(makeTab({ base: 'https://a/b.md' }))).toBe(false);
  });
  it(`đầy ${MAX_TABS} tab thì từ chối và không đổi gì`, () => {
    let s = initialState(doc('0'));
    for (let i = 1; i < MAX_TABS; i++) s = opened(s, String(i));
    expect(s.tabs).toHaveLength(MAX_TABS);
    const r = openTab(s, { text: 'x' });
    expect(r.id).toBeNull();
    expect(r.state).toBe(s);
  });
});

describe('closeTab / reopenClosed', () => {
  it('đóng tab đang chọn thì chọn tab kế bên (cùng vị trí, hoặc tab cuối)', () => {
    let s = initialState(doc('a')); s = opened(s, 'b'); s = opened(s, 'c');
    s = activateIndex(s, 1);
    s = closeTab(s, s.activeId);
    expect(getActive(s).text).toBe('c');
    s = closeTab(s, s.activeId);
    expect(getActive(s).text).toBe('a');
  });
  it('đóng tab không chọn thì giữ nguyên tab đang chọn', () => {
    let s = initialState(doc('a')); s = opened(s, 'b');
    const a = s.tabs[0]!.id;
    s = closeTab(s, a);
    expect(getActive(s).text).toBe('b');
  });
  it('đóng tab cuối cùng vẫn còn một tab rỗng', () => {
    let s = initialState(doc('a'));
    s = closeTab(s, s.activeId);
    expect(s.tabs).toHaveLength(1);
    expect(isPristine(getActive(s))).toBe(true);
    expect(s.closed.map((t) => t.text)).toEqual(['a']);
  });
  it('mở lại theo thứ tự mới đóng nhất trước; tab rỗng đóng đi không vào ngăn xếp', () => {
    let s = initialState(doc('a')); s = opened(s, 'b'); s = opened(s, 'c');
    s = closeTab(s, s.tabs[2]!.id); s = closeTab(s, s.tabs[1]!.id);
    expect(s.closed.map((t) => t.text)).toEqual(['b', 'c']);
    let r = reopenClosed(s); expect(getActive(r.state).text).toBe('b');
    r = reopenClosed(r.state); expect(getActive(r.state).text).toBe('c');
    expect(reopenClosed(r.state).id).toBeNull();
    const e = initialState(); expect(closeTab(openTab(e, { text: 'x' }).state, openTab(e, { text: 'x' }).state.activeId).closed).toHaveLength(1);
  });
  it('mở lại khi chỉ còn một tab rỗng thì thay tab rỗng đó', () => {
    let s = initialState(doc('a')); s = closeTab(s, s.activeId);
    const r = reopenClosed(s);
    expect(r.state.tabs.map((t) => t.text)).toEqual(['a']);
  });
  it(`giữ tối đa ${MAX_CLOSED} tab đã đóng`, () => {
    let s = initialState(doc('0'));
    for (let i = 1; i <= MAX_CLOSED + 5; i++) { s = opened(s, String(i)); s = closeTab(s, s.activeId); }
    expect(s.closed).toHaveLength(MAX_CLOSED);
    expect(s.closed[0]!.text).toBe(String(MAX_CLOSED + 5));
  });
  it('đầy tab thì không mở lại được và không mất tab đã đóng', () => {
    let s = initialState(doc('0')); s = opened(s, 'x'); s = closeTab(s, s.activeId);
    for (let i = 1; i < MAX_TABS; i++) s = opened(s, String(i));
    const r = reopenClosed(s);
    expect(r.full).toBe(true);
    expect(r.state.closed).toHaveLength(1);
  });
});

describe('chuyển, đổi tên, sắp xếp', () => {
  it('Alt+PgUp/PgDn vòng quanh; một tab thì không đổi', () => {
    let s = initialState(doc('a')); s = opened(s, 'b'); s = opened(s, 'c');
    expect(getActive(activateOffset(s, 1)).text).toBe('a');
    expect(getActive(activateOffset(activateIndex(s, 0), -1)).text).toBe('c');
    const one = initialState(doc('a')); expect(activateOffset(one, 1)).toBe(one);
  });
  it('activate id lạ hoặc chỉ số ngoài khoảng thì bỏ qua', () => {
    const s = initialState(doc('a'));
    expect(activate(s, 'nope')).toBe(s); expect(activateIndex(s, 5)).toBe(s);
  });
  it('đổi tên cắt khoảng trắng và giới hạn độ dài', () => {
    const s = initialState(doc('a'));
    expect(getActive(renameTab(s, s.activeId, '  notes.md  ')).name).toBe('notes.md');
    expect(getActive(renameTab(s, s.activeId, 'x'.repeat(500))).name).toHaveLength(120);
  });
  it('moveTab', () => {
    let s = initialState(doc('a')); s = opened(s, 'b'); s = opened(s, 'c');
    expect(moveTab(s, s.tabs[0]!.id, 2).tabs.map((t) => t.text)).toEqual(['b', 'c', 'a']);
  });
  it('tên hiển thị: tên đã đặt > tiêu đề > Untitled.md; trùng thì đánh số', () => {
    const tabs = [doc('# Hello', ''), doc('x', 'a.md'), doc('', ''), doc('', 'a.md')];
    expect(displayNames(tabs, (t) => (t.startsWith('# ') ? t.slice(2) : ''))).toEqual(['Hello', 'a.md', 'Untitled.md', 'a.md (2)']);
  });
});

describe('chấm "đã sửa so với file"', () => {
  it('chỉ tab có file và nội dung khác bản lưu ra file', () => {
    expect(isChangedVsFile(makeTab({ text: 'x', hasFile: false, savedFile: null }))).toBe(false);
    expect(isChangedVsFile(makeTab({ text: 'x', hasFile: true, savedFile: 'x' }))).toBe(false);
    expect(isChangedVsFile(makeTab({ text: 'xy', hasFile: true, savedFile: 'x' }))).toBe(true);
  });
});

describe('restore (khởi động + migrate)', () => {
  it('chưa có metadata: tạo tab 1 từ mdprev-md / mdprev-md-name (migrate không phá hủy)', () => {
    const s = restore(null, '# Old doc', 'old.md');
    expect(s.tabs).toHaveLength(1);
    expect(getActive(s)).toMatchObject({ text: '# Old doc', name: 'old.md', baseline: '# Old doc' });
  });
  it('metadata hỏng thì quay về migrate, không ném lỗi', () => {
    expect(getActive(restore('{oops', 'T', 'n.md')).text).toBe('T');
    expect(getActive(restore('{"v":2}', 'T', '')).text).toBe('T');
  });
  it('khôi phục thứ tự và tab đang chọn; văn bản tab chọn lấy từ gương, tab khác chờ nạp (null)', () => {
    let s = initialState(doc('a', 'a.md')); s = opened(s, 'b'); s = renameTab(s, s.activeId, 'b.md');
    const r = restore(toMeta(s), 'B-FROM-MIRROR', 'b.md');
    expect(r.tabs.map((t) => t.name)).toEqual(['a.md', 'b.md']);
    expect(getActive(r).text).toBe('B-FROM-MIRROR');
    expect(r.tabs[0]!.text).toBeNull();
  });
  it('id đang chọn không còn trong danh sách thì chọn tab đầu', () => {
    const m = JSON.stringify({ v: 1, order: [{ id: 'x', name: '', hasFile: false, base: null }], active: 'gone', closed: [] });
    expect(restore(m, 'T', '').activeId).toBe('x');
  });
  it('khôi phục không vượt quá MAX_TABS và giữ ngăn xếp đã đóng', () => {
    const order = Array.from({ length: 20 }, (_, i) => ({ id: 'i' + i, name: '', hasFile: false, base: null }));
    const r = restore(JSON.stringify({ v: 1, order, active: 'i0', closed: ['c1', 'c2'] }), 'T', '');
    expect(r.tabs).toHaveLength(MAX_TABS); expect(r.closed.map((t) => t.id)).toEqual(['c1', 'c2']);
  });
});

describe('nhiều cửa sổ', () => {
  it('tab chưa nạp (text null) không bị coi là rỗng nên không bị dùng lại', () => {
    const s = initialState(makeTab({ text: null, name: 'x.md' }));
    expect(isPristine(getActive(s))).toBe(false);
    const r = openTab({ ...s, tabs: [{ ...s.tabs[0]!, name: '' }] }, { text: 'y' });
    expect(r.reused).toBe(false);
  });
  it('bản gương thuộc tab nào thì tab đó được chọn khi khởi động', () => {
    const m = JSON.stringify({ v: 1, order: [{ id: 'a', name: '', hasFile: false, base: null }, { id: 'b', name: '', hasFile: false, base: null }], active: 'a', closed: [] });
    expect(restore(m, 'MIRROR', '', 'b').activeId).toBe('b');
    expect(restore(m, 'MIRROR', '', null).activeId).toBe('a');
  });
  it('restore: gương thuộc id không có trong metadata thì thành tab riêng, KHÔNG đổi văn bản của tab đang chọn trong metadata', () => {
    const m = JSON.stringify({ v: 1, order: [{ id: 'a', name: 'a.md', hasFile: false, base: null }], active: 'a', closed: [] });
    const r = restore(m, 'MIRROR OF X', 'x.md', 'x');
    expect(r.tabs.map((t) => t.id)).toEqual(['a', 'x']);
    expect(r.activeId).toBe('x');
    expect(r.tabs.find((t) => t.id === 'x')!.text).toBe('MIRROR OF X');
    expect(r.tabs.find((t) => t.id === 'a')!.text).toBeNull();
  });
});

describe('nhãn tab hẹp (cắt ở giữa)', () => {
  const fit = (n: number) => (s: string) => s.length <= n;
  it('vừa sẵn thì giữ nguyên', () => { expect(midCut('so-mot', fit(20))).toBe('so-mot'); });
  it('giữ đầu và ĐUÔI, cắt ở giữa: hai tên cùng phần đầu vẫn phân biệt được', () => {
    const a = midCut('kiem-tra-ten-tab-dai-so-mot', fit(16)), b = midCut('kiem-tra-ten-tab-dai-so-hai', fit(16));
    expect(a).not.toBe(b); expect(a.length).toBeLessThanOrEqual(16);
    expect(a.endsWith('so-mot')).toBe(true); expect(b.endsWith('so-hai')).toBe(true); expect(a).toContain('…'); expect(a.startsWith('kiem')).toBe(true);
  });
  it('lấy bản dài nhất còn vừa', () => { expect(midCut('kiem-tra-ten-tab-dai-so-mot', fit(16)).length).toBe(16); expect(midCut('kiem-tra-ten-tab-dai-so-mot', fit(12)).length).toBe(12); });
  it('untitled (2)/(3) vẫn phân biệt được qua số cuối khi bị cắt', () => {
    const l = ['untitled', 'untitled (2)', 'untitled (3)'].map((n) => midCut(n, fit(9)));
    expect(new Set(l).size).toBe(3); expect(l[1]!.endsWith('(2)')).toBe(true); expect(l[2]!.endsWith('(3)')).toBe(true);
  });
  it('quá hẹp thì còn ít nhất đầu…cuối, không ném lỗi; tên rất ngắn giữ nguyên', () => {
    expect(midCut('kiem-tra-so-mot', fit(1))).toBe('k…t'); expect(midCut('ab', fit(1))).toBe('ab');
  });
  it('tiếng Việt có dấu không bị chẻ giữa ký tự', () => { expect(midCut('ghi-chép-tiếng-việt-dài-hơn-nhiều', fit(14))).toMatch(/^ghi.*….*$/u); });
});

describe('chế độ xem riêng từng tab', () => {
  it('lưu vào metadata và đọc lại; giá trị lạ bị bỏ', () => {
    let s = initialState(makeTab({ text: 'a', view: 'split' }));
    s = opened(s, 'b');
    s = { ...s, tabs: s.tabs.map((t, i) => (i === 1 ? { ...t, view: 'pv' as const } : t)) };
    const r = restore(toMeta(s), 'a', '', s.tabs[0]!.id);
    expect(r.tabs.map((t) => t.view)).toEqual(['split', 'pv']);
    const bad = JSON.parse(toMeta(s)); bad.order[0].view = 'zzz';
    expect(restore(JSON.stringify(bad), 'a', '', s.tabs[0]!.id).tabs[0]!.view).toBeUndefined();
  });
  it('metadata cũ không có view vẫn đọc được', () => {
    const s = initialState(makeTab({ text: 'a' }));
    expect(restore(toMeta(s), 'a', '', s.tabs[0]!.id).tabs[0]!.view).toBeUndefined();
  });
});
