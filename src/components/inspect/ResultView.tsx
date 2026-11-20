import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CollectionReport, Vfs } from '../../lib/skills/types';
import { url } from '../../lib/url';
import { filesOfSkill } from '../../lib/skills/vfs';
import { CollectionView } from './CollectionView';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { ReportView } from './ReportView';

type Nav = { n: 'collection' } | { n: 'report'; dir: string } | { n: 'files'; dir: string; path: string | null; line?: number | undefined };
interface Props { source: string; vfs: Vfs; report: CollectionReport; onHome(): void }

/** Kết quả: bộ sưu tập (nếu nhiều skill) → báo cáo một skill → cây file và xem file. Nút Back của trình duyệt đi lùi từng màn. */
export function ResultView({ source, vfs, report, onHome }: Props) {
  const first: Nav = report.skills.length === 1 ? { n: 'report', dir: report.skills[0]!.dir } : { n: 'collection' };
  const [nav, setNav] = useState<Nav>(first);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(report.skills.map((s) => s.dir)));
  const stack = useRef<Nav[]>([first]);
  const multi = report.skills.length > 1;

  useEffect(() => {
    history.replaceState({ ixn: 0 }, '');
    const pop = (ev: PopStateEvent) => {
      const i = (ev.state as { ixn?: number } | null)?.ixn;
      if (typeof i === 'number' && stack.current[i]) { setNav(stack.current[i] as Nav); window.scrollTo(0, 0); }
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  const go = (to: Nav) => {
    const cur = stack.current;
    const at = (history.state as { ixn?: number } | null)?.ixn ?? cur.length - 1;
    stack.current = [...cur.slice(0, at + 1), to];
    history.pushState({ ixn: stack.current.length - 1 }, '');
    setNav(to);
    window.scrollTo(0, 0);
  };

  // "Inspect another": tua lại các mục lịch sử của kết quả này để nút Back không đi qua các màn đã bỏ.
  const leave = () => {
    const at = (history.state as { ixn?: number } | null)?.ixn ?? 0;
    if (at > 0) history.go(-at);
    onHome();
  };

  const [copying, setCopying] = useState(false);
  const [copyErr, setCopyErr] = useState('');
  /** "Edit a copy": ghi các file chữ của skill vào một workspace (IndexedDB) rồi mở editor. Ảnh và file nhị phân không được sao chép. */
  const editCopy = async (sk: { dir: string; name: string | null }) => {
    setCopying(true); setCopyErr('');
    try {
      const [M, S, A] = await Promise.all([import('../../lib/workspace/model'), import('../../lib/workspace/store'), import('../../lib/workspace/active')]);
      // một bản sao đang mở mà đã có thay đổi: hỏi trước khi thay bằng bản mới (nếu không nó mồ côi trong IndexedDB)
      const prev = A.getActiveId();
      if (prev) {
        const old = await S.getWorkspace(prev);
        if (old && M.statusOf(old).size > 0 && !confirm('You have unsaved edits in another copy. Replace it with this one? Download its zip first if you want to keep them.')) { setCopying(false); return; }
        await S.deleteWorkspace(prev).catch(() => undefined);
      }
      const id = A.newId();
      const nm = (sk.name ?? (sk.dir ? sk.dir.slice(sk.dir.lastIndexOf('/') + 1) : 'skill')).replace(/[^\w.-]+/g, '-').slice(0, 64) || 'skill';
      await S.putWorkspace(M.fromVfs(vfs, { id, name: nm, label: source, dir: sk.dir, now: Date.now() }));
      A.setActiveId(id);
      location.assign(url('/app/'));
    } catch (e) {
      console.error('edit a copy failed', e);
      setCopying(false);
      const code = (e as { code?: string }).code, load = /dynamically imported|Failed to fetch/i.test(String((e as Error)?.message ?? e));
      setCopyErr(code === 'too-big' ? 'This skill is larger than 10 MB of text, too big to keep as a copy.' : load ? 'The copy tools are not loaded yet. Open the editor once while online, then try again.' : 'Could not keep a copy in this browser (storage may be blocked or full).');
    }
  };
  const skill = nav.n === 'collection' ? undefined : report.skills.find((s) => s.dir === nav.dir);
  const skillMd = (dir: string): string => (dir === '' ? 'SKILL.md' : `${dir}/SKILL.md`);

  if (nav.n === 'collection' || !skill) {
    return (
      <div class="ix-res">
        <CollectionView source={source} report={report} selected={selected}
          onToggle={(d) => setSelected((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; })}
          onAll={(on) => setSelected(on ? new Set(report.skills.map((s) => s.dir)) : new Set())}
          onOpen={(dir) => go({ n: 'report', dir })} />
      </div>
    );
  }

  return (
    <div class="ix-res">
      <header class="ix-sh">
        {multi && <button type="button" class="ix-link" onClick={() => go({ n: 'collection' })}>← {report.skills.length} skills</button>}
        <div class="ix-tabs" role="group" aria-label="Skill view">
          <button type="button" aria-pressed={nav.n === 'report'} onClick={() => go({ n: 'report', dir: skill.dir })}>Report</button>
          <button type="button" aria-pressed={nav.n === 'files'} onClick={() => go({ n: 'files', dir: skill.dir, path: null })}>Files</button>
        </div>
        <span class="ix-sp" />
        <button type="button" class="ix-btn" title="Keep an editable copy of this skill in this browser and open it in the editor" disabled={copying} onClick={() => void editCopy(skill)}>Edit a copy</button>
        <button type="button" class="ix-btn" onClick={leave}>Inspect another</button>
      </header>
      {copyErr && <p class="ix-fine" role="alert" style="padding:8px 20px;color:var(--err)">{copyErr}</p>}
      {nav.n === 'report'
        ? <ReportView source={source} skill={skill} vfs={vfs} onOpen={(path, line) => go({ n: 'files', dir: skill.dir, path, line })} />
        : <FilesView skillDir={skill.dir} vfs={vfs} report={report} path={nav.path ?? skillMd(skill.dir)} line={nav.line}
            onPick={(path, line) => go({ n: 'files', dir: skill.dir, path, line })} />}
    </div>
  );
}

function FilesView({ skillDir, vfs, report, path, line, onPick }: { skillDir: string; vfs: Vfs; report: CollectionReport; path: string; line: number | undefined; onPick(path: string, line?: number): void }) {
  const skill = report.skills.find((s) => s.dir === skillDir)!;
  const files = useMemo(() => filesOfSkill(vfs, skillDir).map((f) => ({ path: f.path, size: f.size, binary: f.binary || f.text === undefined })), [vfs, skillDir]);
  const flags = useMemo(() => new Map(skill.files.map((f) => [f.path, f.flags])), [skill]);
  const file = vfs.get(path);
  const rel = skillDir === '' ? path : path.slice(skillDir.length + 1);
  return (
    <div class="ix-files">
      <h1 class="ix-sr">Files of {skill.name ?? (skillDir || 'this skill')}</h1>
      <FileTree dir={skillDir} files={files} flags={flags} current={path} onPick={(p) => onPick(p)} />
      {file
        ? <FileViewer file={file} rel={rel} line={line} findings={skill.findings.filter((f) => f.file === path)} onJump={(l) => onPick(path, l)} />
        : <p class="ix-nofile">That file is not in this skill.</p>}
    </div>
  );
}
