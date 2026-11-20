import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fmtBytes } from '../../lib/skills/report';
import { buildTree, filterFiles, flatten, type TreeFile } from './tree';
import { Icon, fileIconFor } from '../islands/icons';

interface Props {
  dir: string;
  files: TreeFile[];
  /** số phát hiện theo đường dẫn file */
  flags: Map<string, number>;
  current: string | null;
  onPick(path: string): void;
}

const ancestors = (path: string, dir: string): string[] => {
  const prefix = dir === '' ? '' : dir + '/';
  const parts = path.slice(prefix.length).split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(prefix + parts.slice(0, i).join('/'));
  return out;
};

/** Cây file của một skill: thư mục đóng/mở, ô lọc (phím `/`), chấm cam ở file có phát hiện, "not read" cho file không đọc. */
export function FileTree({ dir, files, flags, current, onPick }: Props) {
  const tree = useMemo(() => buildTree(files, dir), [files, dir]);
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (files.length <= 60) for (const f of files) for (const a of ancestors(f.path, dir)) s.add(a);
    if (current) for (const a of ancestors(current, dir)) s.add(a);
    return s;
  });
  // Mở file nằm trong thư mục đang đóng (ví dụ từ liên kết trong báo cáo): mở các thư mục cha để thấy nó.
  useEffect(() => {
    if (!current) return;
    setOpen((o) => { const add = ancestors(current, dir).filter((a) => !o.has(a)); return add.length ? new Set([...o, ...add]) : o; });
  }, [current, dir]);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Phím `/` đưa con trỏ vào ô lọc (trừ khi đang gõ ở ô khác), như hiện trong gợi ý.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      ev.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (p: string) => setOpen((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const rows = flatten(tree, open);
  const hits = q.trim() ? filterFiles(files, q) : null;
  const rel = (p: string): string => (dir === '' ? p : p.slice(dir.length + 1));

  const fileRow = (path: string, name: string, size: number, binary: boolean, depth: number) => (
    <button type="button" class="ix-f" style={`padding-left:${12 + depth * 14}px`} aria-current={current === path ? 'true' : undefined} onClick={() => onPick(path)} title={path}>
      <span class="c" aria-hidden="true"><Icon n={binary ? 'ffile' : fileIconFor(path)} s={14} /></span>
      <span class="nm">{name}</span>
      <span class="s">{binary ? <i>not read</i> : fmtBytes(size)}</span>
      {(flags.get(path) ?? 0) > 0 ? <span class="fl" role="img" aria-label={`${flags.get(path)} findings`} /> : <span />}
    </button>
  );

  return (
    <nav class="ix-tree" aria-label="Files in this skill">
      <div class="ix-flt">
        <input ref={input} value={q} onInput={(ev) => setQ((ev.target as HTMLInputElement).value)} placeholder="Filter files" aria-label="Filter files" spellcheck={false}
          onKeyDown={(ev) => { if (ev.key === 'Escape') { setQ(''); (ev.target as HTMLInputElement).blur(); } }} />
        <kbd aria-hidden="true">/</kbd>
      </div>
      <div class="ix-rowsw">
        {hits
          ? (hits.length ? hits.map((f) => fileRow(f.path, rel(f.path), f.size, f.binary, 0)) : <p class="ix-fine" style="padding:8px 14px">No file matches.</p>)
          : rows.map(({ node, depth }) => node.kind === 'dir'
            ? (
              <button type="button" class="ix-f ix-d" style={`padding-left:${12 + depth * 14}px`} aria-expanded={open.has(node.path)} onClick={() => toggle(node.path)}>
                <span class="c" aria-hidden="true">{open.has(node.path) ? '▾' : '▸'}</span><span class="nm">{node.name}/</span><span class="s">{node.count} files</span><span />
              </button>
            )
            : fileRow(node.path, node.name, node.size, node.binary, depth))}
      </div>
    </nav>
  );
}
