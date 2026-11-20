import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { diffRpc } from '../../lib/diff/client';
import { splitLines } from '../../lib/diff/engine';
import { deleteSnapshot, listSnapshots, MAX_SNAPS, type Snap } from '../../lib/studio/history';
import { hunksOf, revertHunk, type Hunk } from '../../lib/studio/hunks';

interface Props {
  src: string;
  baseline: string;
  /** Áp văn bản mới qua commit() của ô soạn (một bước undo). `backup`: chụp bản hiện tại trước khi ghi đè. */
  onApply: (text: string, caret: number, msg: string, backup: boolean) => void;
  onJump: (line: number) => void;
  onSnapshot: () => Promise<boolean>;
  onClose: () => void;
  /** Nhúng trong tab History của Inspector: không phải hộp thoại cố định, không có nút đóng, không lấy focus khi dựng. */
  embedded?: boolean;
  /** Ngăn con ban đầu và gọi khi đổi: để Inspector giữ ngăn con khi người dùng chuyển tab rồi quay lại. */
  initialTab?: 'changes' | 'history';
  onTab?: (t: 'changes' | 'history') => void;
}
type Tab = 'changes' | 'history';
interface Calc { base: string; cur: string; hunks: Hunk[]; truncated: boolean }

const PREVIEW = 4;
const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`);

/** Ngăn kéo Changes (so với bản đã lưu) và History (các bản chụp trong IndexedDB). Chỉ được dựng khi mở, nên đóng thì không tốn gì. */
export function StudioHistory({ src, baseline, onApply, onJump, onSnapshot, onClose, embedded = false, initialTab = 'changes', onTab }: Props) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const setTab = (t: Tab) => { setTabState(t); onTab?.(t); };
  const [snaps, setSnaps] = useState<Snap[] | null | undefined>(undefined);
  const [sel, setSel] = useState<number | null>(null);
  const [calc, setCalc] = useState<Calc | null>(null);
  const [busy, setBusy] = useState(false);
  const [askAll, setAskAll] = useState(false); // Revert all hỏi bằng lần bấm thứ hai (confirm() gốc bị nhiều trình duyệt tự bỏ qua)
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const good = useRef<Snap[] | null>(null);
  // IndexedDB lỗi chập chờn: thử lại một lần, và nếu vẫn lỗi thì giữ danh sách đã có thay vì ẩn hết snapshot
  const reload = () => { void listSnapshots().then((s) => (s === null ? new Promise<Snap[] | null>((r) => setTimeout(() => void listSnapshots().then(r), 400)) : s)).then((s0) => { const s = s0 ?? good.current; good.current = s; setSnaps(s); setSel((c) => (c !== null && s?.some((x) => x.id === c) ? c : s?.[0]?.id ?? null)); }); };
  useEffect(() => { reload(); if (!embedded) box.current?.focus(); }, []);

  const snap = snaps?.find((s) => s.id === sel) ?? null;
  const base = tab === 'changes' ? baseline : snap?.text ?? null;

  // Tính lại từ đầu mỗi khi văn bản hoặc mốc so sánh đổi (vị trí dòng đổi sau mỗi lần hoàn tác)
  useEffect(() => {
    if (base === null) { setCalc(null); setBusy(false); return; }
    const my = ++seq.current;
    if (base === src) { setBusy(false); setErr(''); setCalc({ base, cur: src, hunks: [], truncated: false }); return; }
    setBusy(true);
    const id = setTimeout(() => {
      void diffRpc.call({ a: base, b: src, o: { ignoreSpace: false, ignoreCase: false } }).then((o) => {
        if (my !== seq.current || o.kind === 'superseded') return;
        setBusy(false);
        if (o.kind === 'ok') { setErr(''); setCalc({ base, cur: src, hunks: hunksOf(o.res.blocks), truncated: o.res.truncated }); }
        else { setCalc(null); setErr(o.kind === 'timeout' ? 'Comparing took too long.' : 'Could not compare.'); }
      });
    }, 220);
    return () => clearTimeout(id);
  }, [base, src]);

  const lines = useMemo(() => (calc ? { a: splitLines(calc.base), b: splitLines(calc.cur) } : null), [calc]);
  const live = !!calc && calc.cur === src && calc.base === base;

  const doRevert = (h: Hunk) => { if (!calc || !live) return; const r = revertHunk(src, calc.base, h); onApply(r.text, r.caret, 'REVERTED CHANGE', false); };

  return (
    <div class={'hs' + (embedded ? ' hs-embedded' : '')} role={embedded ? 'region' : 'dialog'} aria-label="Changes and history" tabIndex={-1} ref={box}>
      <div class="hs-h">
        <span class="pv-seg" role="group" aria-label="Panel">
          <button type="button" aria-pressed={tab === 'changes'} onClick={() => setTab('changes')}>CHANGES</button>
          <button type="button" aria-pressed={tab === 'history'} onClick={() => { setTab('history'); reload(); }}>HISTORY</button>
        </span>
        {!embedded && <button type="button" class="pv-linkbtn" onClick={onClose}>CLOSE</button>}
      </div>

      {tab === 'history' && (
        <div class="hs-snaps">
          <div class="hs-row"><span class="pv-dim">{snaps ? `${snaps.length} of ${MAX_SNAPS} snapshots` : ''}</span>
            <button type="button" class="pv-linkbtn" disabled={snaps === null} onClick={() => { void onSnapshot().then(reload); }}>SNAPSHOT NOW</button>
          </div>
          {snaps === undefined && <p class="hs-msg pv-dim">└ loading…</p>}
          {snaps === null && <p class="hs-msg pv-warn">History is unavailable: this browser blocks IndexedDB here.</p>}
          {snaps && snaps.length === 0 && <p class="hs-msg pv-dim">No snapshots yet. One is taken when you save, open a file, replace the document, or after a few minutes of editing.</p>}
          {snaps && snaps.length > 0 && (
            <ul class="hs-list">
              {snaps.map((s) => (
                <li key={s.id}>
                  <button type="button" aria-pressed={s.id === sel} onClick={() => setSel(s.id)}>
                    <b>{when(s.t)}</b><span class="pv-dim"> · {s.reason}{s.name ? ` · ${s.name}` : ''}</span>
                    <span class="hs-meta pv-dim">{s.lines.toLocaleString('en-US')} lines · {kb(s.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div class="hs-b" aria-live="polite">
        {base === null ? (tab === 'history' && snaps ? <p class="hs-msg pv-dim">Select a snapshot to compare it with the current text.</p> : null) : err ? <p class="hs-msg pv-warn">✗ {err}</p>
          : !calc ? <p class="hs-msg pv-dim">└ comparing…</p>
            : (
              <>
                <div class="hs-row">
                  <span class={busy || !live ? 'pv-dim' : ''}>{calc.hunks.length === 0 && !calc.truncated ? (tab === 'changes' ? '✓ Same as when this page was opened or last saved' : '✓ Same as this snapshot') : `${calc.hunks.length.toLocaleString('en-US')} ${calc.hunks.length === 1 ? 'change' : 'changes'} ${tab === 'changes' ? 'since opened or last saved' : 'from this snapshot'}`}</span>
                  {tab === 'changes'
                    ? <button type="button" class="pv-linkbtn" disabled={calc.hunks.length === 0 || !live} onClick={() => { if (askAll) { setAskAll(false); onApply(baseline, 0, 'REVERTED TO SAVED', true); } else setAskAll(true); }} onBlur={() => setAskAll(false)} title="Discards all changes since this page was opened or last saved. Ctrl/⌘+Z undoes it.">{askAll ? 'CLICK AGAIN TO DISCARD' : 'REVERT ALL'}</button>
                    : <button type="button" class="pv-linkbtn" disabled={!snap || !live} onClick={() => { if (snap) onApply(snap.text, 0, 'RESTORED SNAPSHOT', true); }}>RESTORE THIS</button>}
                </div>
                {calc.truncated && <p class="hs-msg pv-warn">Too many changes to list one by one. Use {tab === 'changes' ? 'REVERT ALL' : 'RESTORE THIS'}.</p>}
                <ol class="hs-hunks">
                  {calc.hunks.slice(0, 200).map((h) => (
                    <li key={h.id} class="hs-hunk">
                      <div class="hs-hh">
                        <b>{h.bn ? `L${h.b + 1}${h.bn > 1 ? `–${h.b + h.bn}` : ''}` : `before L${h.b + 1}`}</b>
                        <span class="pv-dim"> · <span class="hs-plus">+{h.bn}</span> <span class="hs-minus">−{h.an}</span></span>
                        <span class="hs-acts">
                          <button type="button" class="pv-linkbtn" onClick={() => onJump(Math.min(h.b + 1, Math.max(1, lines?.b.length ?? 1)))}>GO</button>
                          <button type="button" class="pv-linkbtn" disabled={!live} onClick={() => doRevert(h)}>REVERT</button>
                        </span>
                      </div>
                      <pre class="hs-pre">{lines && <>
                        {lines.a.slice(h.a, h.a + Math.min(h.an, PREVIEW)).map((l, k) => <span key={'d' + k} class="hs-d">{'− ' + (l || ' ')}{'\n'}</span>)}
                        {h.an > PREVIEW && <span class="pv-dim">{`  … ${h.an - PREVIEW} more removed\n`}</span>}
                        {lines.b.slice(h.b, h.b + Math.min(h.bn, PREVIEW)).map((l, k) => <span key={'a' + k} class="hs-a">{'+ ' + (l || ' ')}{'\n'}</span>)}
                        {h.bn > PREVIEW && <span class="pv-dim">{`  … ${h.bn - PREVIEW} more added\n`}</span>}
                      </>}</pre>
                    </li>
                  ))}
                </ol>
                {calc.hunks.length > 200 && <p class="hs-msg pv-dim">{calc.hunks.length - 200} more changes not shown.</p>}
              </>
            )}
      </div>

      {tab === 'history' && snap && (
        <div class="hs-f"><button type="button" class="pv-linkbtn" onClick={() => { void deleteSnapshot(snap.id).then(reload); }}>DELETE THIS SNAPSHOT</button></div>
      )}
    </div>
  );
}
