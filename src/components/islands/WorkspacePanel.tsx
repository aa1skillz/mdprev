import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { on } from '../../lib/bus';
import type { Workspace } from '../../lib/workspace/model';
import { buildTree, flatten } from '../inspect/tree';
import { Icon, fileIconFor } from './icons';
import { fmtBytes } from '../../lib/skills/report';
import { diffBlocks, makePatch, splitLines } from '../../lib/diff/engine';
import '../../styles/workspace.css';

export type WsStatus = 'modified' | 'added' | 'deleted';

interface Props {
  ws: Workspace;
  /** file đang mở trong editor */
  path: string | null;
  status: Map<string, WsStatus>;
  /** token ước lượng và số phát hiện của từng file (báo cáo skill), nếu đã có */
  info?: Map<string, { tokens: number; flags: number }>;
  /** các hàm sửa trả về thông báo lỗi (hiện ngay trong panel) hoặc `null` khi thành công */
  onOpen(path: string): void;
  onAdd(path: string): string | null;
  onRename(from: string, to: string): string | null;
  onRemove(path: string): void;
  onRestore(path: string): void;
  onZip(): void;
  /** bản gốc và bản hiện tại của một file, để panel tự dựng diff */
  onDiff(path: string): { a: string; b: string };
  onClose(): void;
  onCloseWs(): void;
  /** chỉ với vault: mở hộp thoại xuất site tĩnh */
  onSite?: (() => void) | undefined;
}

const MARK: Record<WsStatus, string> = { modified: 'M', added: '+', deleted: '–' };
const LABEL: Record<WsStatus, string> = { modified: 'modified', added: 'new', deleted: 'deleted' };
/** Nhãn nguồn ngắn: link GitHub thành `chủ/repo · thư-mục-skill` (URL đầy đủ ở tooltip); nhãn khác (zip, thư mục, ví dụ) giữ nguyên. */
export function shortOrigin(label: string): string {
  const m = /^(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)(?:\/tree\/[^/]+\/(.+?))?\/?$/.exec(label.trim());
  if (!m) return label;
  const sub = m[3] ? m[3].slice(m[3].lastIndexOf('/') + 1) : '';
  return `${m[1]}/${m[2]}${sub ? ' · ' + sub : ''}`;
}
const ancestors = (path: string): string[] => { const p = path.split('/'); return p.slice(0, -1).map((_, i) => p.slice(0, i + 1).join('/')); };

/**
 * Panel bên của editor khi đang sửa một bản sao (workspace): cây file, trạng thái so với bản gốc, thêm/đổi tên/xoá, diff, tải zip.
 * Chỉ trình bày: dữ liệu và lưu trữ do MarkdownStudio giữ.
 */
export default function WorkspacePanel({ ws, path, status, info, onOpen, onAdd, onRename, onRemove, onRestore, onZip, onDiff, onClose, onCloseWs, onSite }: Props) {
  const vault = ws.origin.kind === 'vault';
  const imgSkipped = ws.skipped.filter((s) => s.reason); // ảnh vault bị bỏ (quá lớn, không phải ảnh thật, SVG không an toàn…)
  const otherSkipped = ws.skipped.filter((s) => !s.reason);
  const files = useMemo(() => ws.files.map((f) => ({ path: f.path, size: f.size, binary: false })), [ws.files]);
  const tree = useMemo(() => buildTree(files, ''), [files]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([...(path ? ancestors(path) : []), ...ws.files.flatMap((f) => (ws.files.length <= 40 ? ancestors(f.path) : []))]));
  // mở file (kể cả file mới tạo trong thư mục đang đóng) thì mở các thư mục cha để thấy nó
  useEffect(() => {
    if (!path) return;
    setOpen((o) => { const add = ancestors(path).filter((x) => !o.has(x)); return add.length ? new Set([...o, ...add]) : o; });
  }, [path]);
  const [mode, setMode] = useState<'' | 'add' | 'rename' | 'delete' | 'close'>('');
  // đổi file đang mở thì đóng form đổi tên/xoá: nó nhắm vào file cũ, nhấn nhầm sẽ tác động lên file mới
  useEffect(() => { setMode((m) => (m === 'rename' || m === 'delete' ? '' : m)); }, [path]);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [patch, setPatch] = useState<{ path: string; text: string } | null>(null);
  const deleted = [...status].filter(([, s]) => s === 'deleted').map(([p]) => p).sort();
  const changed = [...status].filter(([, s]) => s !== 'deleted').length + deleted.length;

  const beginRef = useRef<(m: 'add' | 'rename' | 'delete') => void>(() => undefined);
  useEffect(() => on('ws-new', () => beginRef.current('add')), []); // "New" ở header khi đang sửa bản sao: mở form tạo file
  const toggle = (p: string) => setOpen((o) => { const n = new Set(o); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const begin = (m: 'add' | 'rename' | 'delete') => {
    setErr(''); setMode(m);
    setVal(m === 'add' ? (path && path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '') : m === 'rename' ? path ?? '' : '');
  };
  beginRef.current = begin;
  const submit = (ev: Event) => {
    ev.preventDefault();
    const e = mode === 'add' ? onAdd(val.trim()) : mode === 'rename' && path ? onRename(path, val.trim()) : null;
    if (e) { setErr(e); return; }
    setMode(''); setErr('');
  };
  const showDiff = (p: string) => {
    const { a, b } = onDiff(p);
    const la = splitLines(a), lb = splitLines(b);
    setPatch({ path: p, text: makePatch(la, lb, diffBlocks(la, lb, { ignoreSpace: false, ignoreCase: false }).blocks, ['original/' + p, 'copy/' + p]) });
  };

  return (
    <aside class="wp" aria-label={vault ? 'Notes in this vault' : 'Files in this copy'}>
      <header class="wp-h">
        <span class="wp-name" title={ws.origin.label}>{ws.name}</span>
        <button type="button" class="wp-x wp-only-phone" aria-label="Close file panel" onClick={onClose}>×</button>
      </header>
      <p class="wp-sub" title={ws.origin.label}>{vault ? `Vault · ${ws.files.length} ${ws.files.length === 1 ? 'note' : 'notes'}` : `Copy of ${shortOrigin(ws.origin.label)}`} · {changed === 0 ? 'no changes' : `${changed} changed`}</p>
      <div class="wp-acts" role="toolbar" aria-label="File actions">
        <button type="button" class="wp-ic" aria-label="New file" title="New file" onClick={() => begin('add')}><Icon n="fplus" /></button>
        <button type="button" class="wp-ic" aria-label="Rename" title="Rename this file" disabled={!path} onClick={() => begin('rename')}><Icon n="pencil" /></button>
        <button type="button" class="wp-ic" aria-label="Diff" title="Changes against the original" disabled={!path || status.get(path ?? '') !== 'modified'} onClick={() => path && showDiff(path)}><Icon n="diff" /></button>
        <span class="wp-acts-gap" aria-hidden="true" />
        <button type="button" class="wp-ic wp-ic-danger" aria-label="Delete" title="Delete this file" disabled={!path} onClick={() => begin('delete')}><Icon n="trash" /></button>
      </div>
      {mode === 'close' && (
        <div class="wp-form" role="alert">
          <span>Close this {vault ? 'vault' : 'copy'}? Its files are removed from this browser. Download the zip first to keep your edits.</span>
          <button type="button" class="wp-danger" onClick={onCloseWs}>Close and remove</button>
          <button type="button" onClick={() => setMode('')}>Keep</button>
        </div>
      )}
      {mode === 'delete' && path && (
        <div class="wp-form" role="alert">
          <span>Delete <b>{path}</b> from this copy?</span>
          <button type="button" class="wp-danger" onClick={() => { onRemove(path); setMode(''); }}>Delete</button>
          <button type="button" onClick={() => setMode('')}>Cancel</button>
        </div>
      )}
      {(mode === 'add' || mode === 'rename') && (
        <form class="wp-form" onSubmit={submit}>
          <label>
            <span class="wp-lbl">{mode === 'add' ? 'New file path' : 'Rename to'}</span>
            <input value={val} onInput={(ev) => setVal((ev.target as HTMLInputElement).value)} spellcheck={false} autocomplete="off" aria-label={mode === 'add' ? 'New file path' : 'Rename to'} ref={(el) => el?.focus()}
              onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); setMode(''); } }} />
          </label>
          <button type="submit" class="wp-go">{mode === 'add' ? 'Create' : 'Rename'}</button>
          <button type="button" onClick={() => setMode('')}>Cancel</button>
          {err && <p class="wp-err" role="alert">{err}</p>}
        </form>
      )}
      <nav class="wp-tree" aria-label="Files">
        {flatten(tree, open).map(({ node, depth }) => node.kind === 'dir'
          ? (
            <button key={node.path} type="button" class="wp-f wp-d" style={`padding-left:${12 + depth * 14}px;--d:${depth}`} aria-expanded={open.has(node.path)} onClick={() => toggle(node.path)}>
              <span class="c" aria-hidden="true">{open.has(node.path) ? '▾' : '▸'}</span><span class="nm">{node.name}/</span>
            </button>
          )
          : (
            <button key={node.path} type="button" class="wp-f" style={`padding-left:${12 + depth * 14}px;--d:${depth}`} aria-current={path === node.path ? 'true' : undefined} title={node.path} onClick={() => onOpen(node.path)}>
              <span class="c" aria-hidden="true"><Icon n={fileIconFor(node.path)} s={14} /></span>
              <span class="nm">{node.name}</span>
              <span class="wp-r">
                {(info?.get(node.path)?.flags ?? 0) > 0 && <span class="wp-flag" role="img" aria-label={`${info!.get(node.path)!.flags} ${info!.get(node.path)!.flags === 1 ? 'finding' : 'findings'}`}>!</span>}
                {status.get(node.path) ? <span class={'wp-b wp-' + status.get(node.path)} role="img" aria-label={LABEL[status.get(node.path) as WsStatus]}>{MARK[status.get(node.path) as WsStatus]}</span> : <span class="s">{info?.get(node.path)?.tokens ? `~${info.get(node.path)!.tokens}` : fmtBytes(node.size)}</span>}
              </span>
            </button>
          ))}
      </nav>
      {deleted.length > 0 && (
        <section class="wp-sec" aria-label="Deleted files">
          <h3>Deleted</h3>
          {deleted.map((p) => <div key={p} class="wp-del"><span class="nm" title={p}>{p}</span><button type="button" onClick={() => onRestore(p)}>Restore</button></div>)}
        </section>
      )}
      {vault && (ws.images?.length ?? 0) > 0 && (
        <p class="wp-note">{ws.images!.length} {ws.images!.length === 1 ? 'image' : 'images'} kept in this browser for the preview and the site export (not in Download zip).</p>
      )}
      {imgSkipped.length > 0 && (
        <details class="wp-note"><summary>{imgSkipped.length} {imgSkipped.length === 1 ? 'image was' : 'images were'} left out</summary>
          <ul>{imgSkipped.slice(0, 50).map((s) => <li key={s.path}><span title={s.path}>{s.path}</span>: {s.reason}</li>)}{imgSkipped.length > 50 && <li>…and {imgSkipped.length - 50} more</li>}</ul>
        </details>
      )}
      {otherSkipped.length > 0 && (
        <p class="wp-note">{otherSkipped.length} {vault ? 'non-Markdown' : 'binary or unreadable'} {otherSkipped.length === 1 ? 'file was' : 'files were'} not copied, so Download zip leaves {otherSkipped.length === 1 ? 'it' : 'them'} out.</p>
      )}
      <footer class="wp-foot">
        {onSite && <button type="button" class="wp-go" onClick={onSite}>Export site…</button>}
        <button type="button" class={onSite ? 'wp-quiet' : 'wp-go'} onClick={onZip}>Download zip</button>
        <button type="button" class="wp-quiet" onClick={() => setMode('close')}>Close {vault ? 'vault' : 'copy'}</button>
      </footer>
      {patch && (
        <div class="wp-dlg" role="dialog" aria-modal="true" aria-label={`Changes in ${patch.path}`} onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); setPatch(null); } }}>
          <div class="wp-dlg-h"><b>{patch.path}</b><button type="button" ref={(el) => el?.focus()} onClick={() => setPatch(null)}>Close</button></div>
          <pre tabindex={0}>{patch.text.split('\n').map((l, i) => <span key={i} class={l.startsWith('@@') ? 'dh' : l.startsWith('+++') || l.startsWith('---') ? 'dm' : l.startsWith('+') ? 'da' : l.startsWith('-') ? 'dd' : undefined}>{l + '\n'}</span>)}</pre>
        </div>
      )}
    </aside>
  );
}
