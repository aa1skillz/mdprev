import { useEffect, useRef, useState } from 'preact/hooks';
import { ensureKatexCss } from '../../lib/studio/katex-css';
import { Icon } from './icons';
import { clock, PRESENT_CHANNEL, scrollWithin, syncScroll, type PresentMsg } from '../../lib/studio/present';
import { SlideView } from './SlideView';
import { themeForStorageEvent } from '../../lib/prefs';

type State = Extract<PresentMsg, { t: 'state' }>;

/** Cửa sổ người trình bày: slide hiện tại, slide kế, ghi chú, đồng hồ. Điều khiển màn chiếu trong studio qua BroadcastChannel. */
export default function StudioPresenter() {
  const [st, setSt] = useState<State | null>(null);
  const [ended, setEnded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ch = useRef<BroadcastChannel | null>(null);
  const cur_ = useRef<HTMLElement>(null);
  const iRef = useRef(0);
  iRef.current = st?.i ?? 0;
  const revRef = useRef<{ rev: number; rt: number } | null>(null); // trạng thái hiện từng bullet (null = tắt)
  revRef.current = st && st.rev !== undefined && st.rt !== undefined ? { rev: st.rev, rt: st.rt } : null;
  const num = (k: string, d: number) => { try { const v = localStorage.getItem(k); const x = v === null ? NaN : Number(v); return Number.isFinite(x) ? x : d; } catch { return d; } };
  const keep = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* bỏ qua */ } };
  const [goal, setGoal] = useState(() => num('mdprev-pr-goal', 0)); // thời lượng dự kiến (phút), 0 = tắt đếm ngược
  const [ns, setNs] = useState(() => num('mdprev-pr-ns', 1)); // hệ số cỡ chữ ghi chú
  const send = (m: PresentMsg) => ch.current?.postMessage(m);

  useEffect(() => {
    const bc = new BroadcastChannel(PRESENT_CHANNEL);
    ch.current = bc;
    const sync = syncScroll(bc, () => cur_.current, () => iRef.current);
    bc.onmessage = (e: MessageEvent<PresentMsg>) => {
      const m = e.data;
      if (!m || typeof m !== 'object') return;
      sync.onMsg(m);
      if (m.t === 'state') { setSt(m); setEnded(false); }
      else if (m.t === 'end') setEnded(true);
    };
    bc.postMessage({ t: 'hello' } satisfies PresentMsg);
    const id = setInterval(() => setNow(Date.now()), 1000);
    const key = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.isComposing) return;
      const k = ev.key;
      const fwd = k === 'ArrowDown' || k === 'PageDown' || k === ' ';
      const scrollKey = fwd || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace';
      const R = revRef.current; // đang hiện từng bullet: màn chiếu lo (bullet trước, cuộn sau), presenter không tự cuộn
      if (scrollKey && !(R && (fwd ? R.rev < R.rt : R.rev > 0)) && scrollWithin(cur_.current?.querySelector<HTMLElement>('.sv-canvas[data-overflow="1"]'), fwd)) { /* cuộn trong slide dài; màn chiếu theo qua kênh */ }
      else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') bc.postMessage({ t: 'step', d: 1, s: scrollKey } satisfies PresentMsg);
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') bc.postMessage({ t: 'step', d: -1, s: scrollKey } satisfies PresentMsg);
      else if (k === 'b' || k === 'B' || k === '.') bc.postMessage({ t: 'blank' } satisfies PresentMsg);
      else if (k === 'r' || k === 'R') bc.postMessage({ t: 'reset' } satisfies PresentMsg);
      else return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    };
    window.addEventListener('keydown', key, true); // pha capture: phím tắt chung của trang không chạy
    const theme = (e: StorageEvent) => { const t = themeForStorageEvent(e.key, e.newValue, matchMedia('(prefers-color-scheme: dark)').matches); if (t) document.documentElement.dataset['theme'] = t; };
    window.addEventListener('storage', theme);
    return () => { sync.stop(); bc.close(); clearInterval(id); window.removeEventListener('keydown', key, true); window.removeEventListener('storage', theme); };
  }, []);
  useEffect(() => { if (st?.slides.some((s) => s.html.includes('class="katex') || s.notes.includes('class="katex'))) void ensureKatexCss(); }, [st]);
  useEffect(() => { document.title = st ? `${st.i + 1} / ${st.slides.length} · Presenter` : 'Presenter'; }, [st]);

  const cur = st?.slides[st.i];
  const next = st ? st.slides[st.i + 1] : undefined;
  return (
    <div class="pr" lang="en">
      <div class="pr-bar" role="status">
        <span class="pr-count">{st ? `${st.i + 1} / ${st.slides.length}` : '- / -'}{st?.blank && <span class="pr-flag">BLANK</span>}</span>
        <span class="pr-time" title="Elapsed">{st ? clock(now - st.t0) : '00:00'}</span>
        <label class="pr-goal"><span>Goal (min)</span><input type="number" min="0" max="600" step="5" value={goal || ''} placeholder="off" onInput={(e) => { const v = Math.max(0, Math.min(600, Math.floor(Number((e.currentTarget as HTMLInputElement).value) || 0))); setGoal(v); keep('mdprev-pr-goal', v); }} /></label>
        {goal > 0 && st && (() => { const rem = goal * 60000 - (now - st.t0); return <span class="pr-left" data-s={rem < 0 ? 'over' : rem < 120000 ? 'warn' : undefined} title="Time left of the goal">{clock(Math.abs(rem))} {rem < 0 ? 'over' : 'left'}</span>; })()}
        <span class="pr-btns">
          <button type="button" disabled={!st || st.i <= 0} aria-label="Prev" title="Previous slide" onClick={() => send({ t: 'step', d: -1 })}><Icon n="chevl" /></button>
          <button type="button" disabled={!st || st.i >= st.slides.length - 1} aria-label="Next" title="Next slide" onClick={() => send({ t: 'step', d: 1 })}><Icon n="chevr" /></button>
          <button type="button" disabled={!st} aria-pressed={!!st?.blank} aria-label="Blank" title="Blank the audience screen" onClick={() => send({ t: 'blank' })}><Icon n="blank" /></button>
          <button type="button" disabled={!st} aria-label="Reset timer" title="Reset the timer" onClick={() => send({ t: 'reset' })}><Icon n="reset" /></button>
        </span>
      </div>
      {!st || ended ? (
        <p class="pr-wait">{ended ? 'Slides closed. Press present in the editor to start again.' : 'Waiting for slides. Start presenting in the editor, then press p.'}</p>
      ) : (
        <div class="pr-main">
          <section class="pr-cur" aria-label="Current slide" ref={cur_}><SlideView html={cur?.html ?? ''} doc={st.doc} dt={st.dt} rev={st.rev} landscape class="pr-sv" /></section>
          <div class="pr-side">
            <section class="pr-next" aria-label="Next slide">
              <h2 class="pr-h">Next</h2>
              {next ? <div class="pr-nv" aria-hidden="true" inert><SlideView html={next.html} doc={st.doc} dt={st.dt} landscape class="pr-nsv" /></div> : <p class="pr-none">End of slides</p>}
            </section>
            <section class="pr-notes" aria-label="Speaker notes">
              <div class="pr-nh"><h2 class="pr-h">NOTES</h2>
                <span class="pr-ns">
                  <button type="button" aria-label="A− smaller notes" disabled={ns <= 0.8} onClick={() => { const v = Math.max(0.8, Math.round((ns - 0.2) * 10) / 10); setNs(v); keep('mdprev-pr-ns', v); }}>A−</button>
                  <button type="button" aria-label="A+ larger notes" disabled={ns >= 2} onClick={() => { const v = Math.min(2, Math.round((ns + 0.2) * 10) / 10); setNs(v); keep('mdprev-pr-ns', v); }}>A+</button>
                </span>
              </div>
              {cur?.notes ? <article class="md-doc" style={`font-size:calc(var(--t-lg) * ${ns})`} dangerouslySetInnerHTML={{ __html: cur.notes }} /> : <p class="pr-none">No notes. Start a paragraph with Note: in the slide.</p>}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
