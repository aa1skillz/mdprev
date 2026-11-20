import { useRef, useState } from 'preact/hooks';
import { fromFileList, readDrop } from './dropped';
import type { FileLike } from '../../lib/skills/import/from-files';

export interface Recent { label: string; at: number }
interface Props {
  initial: string;
  error: string | undefined;
  recent: Recent[];
  onUrl(v: string): void;
  onZip(f: File): void;
  onFiles(files: FileLike[]): void;
  onExample(): void;
  onFail(message: string): void;
}

export const ago = (at: number, now = Date.now()): string => {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

/** Màn đầu của /app/inspect/: một ô dán link, thả zip/thư mục, hoặc thử ví dụ. */
export function ImportScreen(p: Props) {
  const [val, setVal] = useState(p.initial);
  const [drag, setDrag] = useState(false);
  const zip = useRef<HTMLInputElement>(null);
  const dir = useRef<HTMLInputElement>(null);

  const drop = async (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (!e.dataTransfer) return;
    try {
      const r = await readDrop(e.dataTransfer);
      if (!r) p.onFail('Drop a .zip file or a folder.');
      else if ('zip' in r) p.onZip(r.zip);
      else p.onFiles(r.files);
    } catch (err) { p.onFail((err as Error).message); }
  };

  return (
    <section class="ix-import" data-drag={drag ? '1' : '0'} aria-labelledby="ix-h"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { void drop(e as DragEvent); }}>
      <h1 id="ix-h">Look before<br />you <em>install</em>.</h1>
      <p class="ix-lead">Paste the link to an agent skill, or a whole collection. See what it contains, what it costs your context, and which scripts deserve a read.</p>
      <form class="ix-field" onSubmit={(e) => { e.preventDefault(); p.onUrl(val); }}>
        <input value={val} onInput={(e) => setVal((e.target as HTMLInputElement).value)} placeholder="github.com/owner/repo" aria-label="GitHub link to a skill or a repository" aria-describedby={p.error ? 'ix-err' : undefined} aria-invalid={p.error ? true : undefined} spellcheck={false} autocomplete="off" autocapitalize="off" />
        <button type="submit">Inspect</button>
      </form>
      {p.error && <p class="ix-err" id="ix-err" role="alert">{p.error}</p>}
      <div class="ix-alts">
        <span>or</span>
        <button type="button" onClick={() => zip.current?.click()}>drop a .zip</button>
        <button type="button" onClick={() => dir.current?.click()}>open a local folder</button>
        <button type="button" onClick={p.onExample}>try an example</button>
        <input ref={zip} type="file" accept=".zip,application/zip" hidden aria-label="Choose a zip file" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; if (f) p.onZip(f); }} />
        <input ref={dir} type="file" hidden aria-label="Choose a folder" {...({ webkitdirectory: true } as Record<string, boolean>)} onChange={(e) => { const l = (e.target as HTMLInputElement).files; if (l && l.length) p.onFiles(fromFileList(l)); (e.target as HTMLInputElement).value = ''; }} />
      </div>
      {p.recent.length > 0 && (
        <div class="ix-recent" aria-label="Recent">
          {p.recent.map((r) => (
            <button type="button" onClick={() => p.onUrl(r.label)}><span>{r.label}</span><span>{ago(r.at)}</span></button>
          ))}
        </div>
      )}
      <p class="ix-fine">Nothing is uploaded. Files are read in this browser and never run.</p>
      <section class="ix-sample" aria-label="Example report">
        <h2 class="ix-sample-h">WHAT YOU GET · EXAMPLE</h2>
        <ul class="ix-sample-list">
          <li><span class="ix-tag" data-sev="review">REVIEW</span> <b>outline.py is worth a read</b><span class="ix-sample-d">Runs a command through the shell (shell=True), line 6.</span></li>
          <li><span class="ix-tag" data-sev="note">NOTE</span> <b>Mentioned but not found: references/links-guide.md</b><span class="ix-sample-d">SKILL.md mentions this file, but it is not in the skill.</span></li>
        </ul>
      </section>
    </section>
  );
}
