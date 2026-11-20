import { useRef } from 'preact/hooks';

interface Props {
  code: string;
  message: string;
  resetAt: number | undefined;
  onBack(): void;
  onRetry(): void;
  onZip(f: File): void;
}

const COPY: Record<string, { h: string; p: string }> = {
  'rate-limited': { h: 'GitHub asked us to slow down.', p: 'Anonymous requests are limited to 60 an hour, and this link needed more than were left.' },
  'not-found': { h: 'We could not find that.', p: 'The repository, branch or folder is missing, or the repository is private. Private repositories cannot be read from a link.' },
  'too-large': { h: 'That is too large to read here.', p: 'mdprev limits how much it reads so your browser stays responsive. Try the link to a single skill folder instead.' },
  network: { h: 'We could not reach GitHub.', p: 'Check your connection and try again.' },
  'bad-zip': { h: 'That zip could not be opened.', p: 'It may be damaged, or it may not be a zip file.' },
  'not-skill': { h: 'No skill found.', p: 'A skill is a folder with a SKILL.md file. None was found here.' },
};

const hhmm = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Lỗi nhập: một câu nói rõ chuyện gì xảy ra và vài hướng đi cụ thể. */
export function ErrorScreen({ code, message, resetAt, onBack, onRetry, onZip }: Props) {
  const zip = useRef<HTMLInputElement>(null);
  const c = COPY[code] ?? { h: 'Something went wrong.', p: message };
  const canWait = code === 'rate-limited' || code === 'network' || code === 'unknown';
  return (
    <section class="ix-error" role="alert" aria-labelledby="ix-err-h">
      <div class="ix-lbl">Could not finish</div>
      <h1 id="ix-err-h">{c.h}</h1>
      <p class="ix-lead">{c.p}</p>
      <div class="ix-opts">
        <div class="ix-opt">
          <div><b>Download the zip and drop it here</b><small>One file, no limits. Works for any repository, private ones included.</small></div>
          <button type="button" class="ix-btn solid" onClick={() => zip.current?.click()}>Choose a zip</button>
          <input ref={zip} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) onZip(f); }} />
        </div>
        {canWait && (
          <div class="ix-opt">
            <div><b>{code === 'rate-limited' && resetAt ? `Try again at ${hhmm(resetAt)}` : 'Try again'}</b><small>{code === 'rate-limited' ? 'GitHub resets the limit on the hour.' : 'Nothing was kept from the failed attempt.'}</small></div>
            <button type="button" class="ix-btn" onClick={onRetry}>Retry now</button>
          </div>
        )}
        <div class="ix-opt">
          <div><b>Try a different link</b><small>For a big repository, paste the link to one skill folder, for example …/skills/pptx.</small></div>
          <button type="button" class="ix-btn" onClick={onBack}>Back</button>
        </div>
      </div>
    </section>
  );
}
