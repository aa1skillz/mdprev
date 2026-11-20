import { useEffect, useRef, useState } from 'preact/hooks';
import { exampleVfs } from '../../lib/skills/example';
import { inspectVfs } from '../../lib/skills/client';
import { fetchGithub, parseGithubUrl, type Progress } from '../../lib/skills/import/from-github';
import { fromFiles, type FileLike } from '../../lib/skills/import/from-files';
import { fromZip } from '../../lib/skills/import/from-zip';
import { ImportError, type CollectionReport, type Vfs } from '../../lib/skills/types';
import { KEYS, readJson, writeJson } from '../../lib/storage';
import { url } from '../../lib/url';
import { ErrorScreen } from './ErrorScreen';
import { ImportScreen, type Recent } from './ImportScreen';
import { LoadingScreen, type Step } from './LoadingScreen';
import { ResultView } from './ResultView';

type Kind = 'github' | 'zip' | 'folder' | 'example';
type View =
  | { v: 'idle' }
  | { v: 'loading'; kind: Kind; title: string; source: string; steps: Step[]; progress: number | null }
  | { v: 'result'; source: string; vfs: Vfs; report: CollectionReport }
  | { v: 'error'; code: string; message: string; resetAt: number | undefined };

const isAbort = (e: unknown): boolean => (e instanceof DOMException && e.name === 'AbortError') || (e as Error | undefined)?.name === 'Superseded';
const MAX_ZIP = 100 * 1024 * 1024;

function steps(kind: Kind, p: Progress | null, checking: boolean): Step[] {
  const first: Step = kind === 'github'
    ? { label: 'Listing the files on GitHub', state: p ? 'done' : 'now', right: p ? `${p.total} files` : undefined }
    : { label: kind === 'zip' ? 'Opening the zip' : kind === 'folder' ? 'Reading the folder' : 'Loading the example', state: checking || p ? 'done' : 'now' };
  const reading: Step = kind === 'github'
    ? { label: 'Reading the text files', state: checking ? 'done' : p ? 'now' : 'todo', right: p && p.phase === 'files' ? `${p.done} of ${p.total}` : undefined }
    : { label: 'Reading the text files', state: checking ? 'done' : 'now' };
  const check: Step = { label: 'Finding skills and checking them', state: checking ? 'now' : 'todo' };
  return [first, reading, check];
}

/** /app/inspect/: nhập skill → đọc → báo cáo. Mọi việc chạy trong trình duyệt. */
export default function InspectApp() {
  const [view, setView] = useState<View>({ v: 'idle' });
  const [formError, setFormError] = useState<string | undefined>();
  const [recent, setRecent] = useState<Recent[]>([]);
  const [initial, setInitial] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const last = useRef<(() => void) | null>(null);

  useEffect(() => {
    setRecent(readJson<Recent[]>(KEYS.inspectRecent, []).slice(0, 5));
    if (import.meta.env.PROD && 'serviceWorker' in navigator && isSecureContext) {
      navigator.serviceWorker.register(url('/app/sw.js'), { scope: url('/app/') }).catch(() => undefined);
    }
    const u = new URLSearchParams(location.search).get('u');
    if (u) { setInitial(u); fromUrl(u); }
    return () => ctl.current?.abort();
  }, []);

  async function run(kind: Kind, title: string, source: string, load: (o: { signal: AbortSignal; onProgress: (p: Progress) => void }) => Promise<Vfs>, retry: () => void, remember?: string) {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    last.current = retry;
    setFormError(undefined);
    setView({ v: 'loading', kind, title, source, steps: steps(kind, null, false), progress: null });
    try {
      const vfs = await load({
        signal: c.signal,
        onProgress: (p) => {
          if (c.signal.aborted) return;
          setView((prev) => (prev.v === 'loading' ? { ...prev, steps: steps(kind, p, false), progress: p.phase === 'files' && p.total ? p.done / p.total : null } : prev));
        },
      });
      if (c.signal.aborted) return;
      setView((prev) => (prev.v === 'loading' ? { ...prev, steps: steps(kind, null, true), progress: 1 } : prev));
      const report = await inspectVfs(vfs);
      if (c.signal.aborted) return;
      if (report.skills.length === 0) throw new ImportError('not-skill', 'No SKILL.md found.');
      if (remember) {
        const list = [{ label: remember, at: Date.now() }, ...readJson<Recent[]>(KEYS.inspectRecent, []).filter((r) => r.label !== remember)].slice(0, 5);
        writeJson(KEYS.inspectRecent, list);
        setRecent(list);
      }
      setView({ v: 'result', source: source || title, vfs, report });
    } catch (e) {
      if (c.signal.aborted || isAbort(e)) return;
      if (e instanceof ImportError) setView({ v: 'error', code: e.code, message: e.message, resetAt: e.resetAt });
      else setView({ v: 'error', code: 'unknown', message: (e as Error).message || 'Unexpected error.', resetAt: undefined });
    }
  }

  function fromUrl(raw: string) {
    const t = parseGithubUrl(raw);
    if (!t) { setView({ v: 'idle' }); setFormError('That does not look like a GitHub link. Try github.com/owner/repo.'); return; }
    const label = `github.com/${t.owner}/${t.repo}${t.rest.length ? '/tree/' + t.rest.join('/') : ''}`;
    void run('github', `${t.owner}/${t.repo}`, label, (o) => fetchGithub(t, o), () => fromUrl(raw), label);
  }
  function fromZipFile(f: File) {
    if (f.size > MAX_ZIP) { setView({ v: 'error', code: 'too-large', message: 'That zip is larger than 100 MB.', resetAt: undefined }); return; }
    void run('zip', f.name, f.name, async () => fromZip(new Uint8Array(await f.arrayBuffer())), () => fromZipFile(f));
  }
  function fromFolder(files: FileLike[]) {
    const top = files[0]?.path.split('/')[0] ?? 'folder';
    void run('folder', top, `${files.length} files`, () => fromFiles(files), () => fromFolder(files));
  }
  function fromExample() { void run('example', 'example-skill', 'built-in example', async () => exampleVfs(), fromExample); }
  const cancel = () => { ctl.current?.abort(); setView({ v: 'idle' }); };
  const home = () => { ctl.current?.abort(); setFormError(undefined); setView({ v: 'idle' }); };

  const where = view.v === 'result' ? view.source : view.v === 'loading' ? view.source : '';
  // Header dùng chung (AppBar) nằm ngoài island: ghi nguồn đang xem vào đó.
  useEffect(() => {
    const el = document.getElementById('appbar-where');
    if (el) el.textContent = where ? `Skill inspector / ${where}` : 'Skill inspector';
  }, [where]);
  return (
    <div class="ix">
      <div class="ix-main">
        {view.v === 'idle' && <ImportScreen initial={initial} error={formError} recent={recent} onUrl={fromUrl} onZip={fromZipFile} onFiles={fromFolder} onExample={fromExample} onFail={(m) => setFormError(m)} />}
        {view.v === 'loading' && <LoadingScreen title={view.title} source={view.source} steps={view.steps} progress={view.progress} onCancel={cancel} note={view.kind === 'github' ? 'Reading straight from GitHub, no account needed.' : undefined} />}
        {view.v === 'error' && <ErrorScreen code={view.code} message={view.message} resetAt={view.resetAt} onBack={home} onRetry={() => last.current?.()} onZip={fromZipFile} />}
        {view.v === 'result' && <ResultView source={view.source} vfs={view.vfs} report={view.report} onHome={home} />}
      </div>
    </div>
  );
}
