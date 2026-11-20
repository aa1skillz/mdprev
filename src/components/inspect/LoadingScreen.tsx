export interface Step { label: string; state: 'done' | 'now' | 'todo'; right?: string | undefined }
interface Props {
  title: string;
  source: string;
  steps: Step[];
  /** 0..1, hoặc null khi chưa biết */
  progress: number | null;
  note?: string | undefined;
  onCancel(): void;
}

const MARK = { done: '✓', now: '…', todo: '○' } as const;

/** Đang nhập: bốn bước, thanh tiến trình thật và nút huỷ. */
export function LoadingScreen({ title, source, steps, progress, note, onCancel }: Props) {
  return (
    <section class="ix-loading" aria-labelledby="ix-load-h" aria-busy="true">
      <div class="ix-lbl">Importing</div>
      <h1 id="ix-load-h">{title}</h1>
      <div class="ix-src">{source}</div>
      <ol style="list-style:none;padding:0;margin:0" aria-live="polite">
        {steps.map((s) => (
          <li class="ix-step" data-s={s.state}>
            <span class="g" aria-hidden="true">{MARK[s.state]}</span>
            <span>{s.label}<span class="ix-sr"> ({s.state === 'done' ? 'done' : s.state === 'now' ? 'in progress' : 'waiting'})</span></span>
            <span class="r">{s.right ?? ''}</span>
          </li>
        ))}
      </ol>
      {progress !== null && <div class="ix-bar2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Import progress"><i style={`width:${Math.round(progress * 100)}%`} /></div>}
      <div class="ix-act">
        <button type="button" class="ix-btn" onClick={onCancel}>Cancel</button>
        {note && <span class="ix-fine">{note}</span>}
      </div>
      <p class="ix-fine" style="margin-top:34px">Nothing is uploaded. The files are read in this browser and never run.</p>
    </section>
  );
}
