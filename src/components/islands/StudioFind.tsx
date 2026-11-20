import type { RefObject } from 'preact';

interface Props {
  q: string; r: string; regex: boolean; cs: boolean; count: number; idx: number; error: string | undefined; status?: 'timeout' | 'pending' | undefined; inputRef: RefObject<HTMLInputElement | null>;
  onQ(v: string): void; onR(v: string): void; onRegex(): void; onCase(): void; onNext(): void; onPrev(): void; onReplace(): void; onReplaceAll(): void; onClose(): void;
}

/**
 * Hộp find/replace nổi ở góc trên phải ô soạn (không đẩy nội dung xuống). Enter = kết quả kế, Shift+Enter = kết quả trước, Esc = đóng.
 * Esc dừng ở đây (stopPropagation) để không kéo theo việc thoát zen.
 */
export function StudioFind(p: Props) {
  const key = (ev: KeyboardEvent, replace: boolean) => {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); p.onClose(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (replace) p.onReplace(); else if (ev.shiftKey) p.onPrev(); else p.onNext(); }
  };
  return (
    <div class="pv-find" role="search" aria-label="Find and replace">
      <div class="pv-frow">
        <input ref={p.inputRef} class="pv-fin" value={p.q} placeholder="Find" aria-label="Find" spellcheck={false} onInput={(ev) => p.onQ((ev.target as HTMLInputElement).value)} onKeyDown={(ev) => key(ev, false)} />
        <span class="pv-fcount" role="status" aria-live="polite">{p.error ? 'invalid regex' : p.status === 'timeout' ? 'timed out' : p.status === 'pending' ? '…' : p.q ? (p.count ? `${p.idx + 1}/${p.count}` : 'no results') : ''}</span>
        <button type="button" class="pv-tool" title="Match case" aria-pressed={p.cs} onClick={p.onCase}>Aa</button>
        <button type="button" class="pv-tool" title="Regular expression ($1 in the replacement)" aria-pressed={p.regex} onClick={p.onRegex}>.*</button>
        <button type="button" class="pv-tool" title="Previous (Shift+Enter)" aria-label="prev Previous match" onClick={p.onPrev}>↑</button>
        <button type="button" class="pv-tool" title="Next (Enter)" aria-label="next Next match" onClick={p.onNext}>↓</button>
        <button type="button" class="pv-tool" title="Close (Esc)" aria-label="close Close find" onClick={p.onClose}>×</button>
      </div>
      <div class="pv-frow">
        <input class="pv-fin" value={p.r} placeholder="Replace" aria-label="Replace with" spellcheck={false} onInput={(ev) => p.onR((ev.target as HTMLInputElement).value)} onKeyDown={(ev) => key(ev, true)} />
        <button type="button" class="pv-tool" title="Replace this match (Enter in the replace field)" disabled={p.status === 'pending'} onClick={p.onReplace}>replace</button>
        <button type="button" class="pv-tool" title="Replace all matches" disabled={p.status === 'pending'} onClick={p.onReplaceAll}>replace all</button>
      </div>
    </div>
  );
}
