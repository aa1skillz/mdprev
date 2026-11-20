export interface TreeFile { path: string; size: number; binary: boolean }
export interface TreeNode { kind: 'dir' | 'file'; name: string; path: string; size: number; binary: boolean; count: number; children?: TreeNode[] }

/** Dựng cây từ danh sách file của một skill. `path` của nút dir là đường dẫn đầy đủ trong Vfs (dùng làm khoá mở/đóng). */
export function buildTree(files: TreeFile[], dir: string): TreeNode[] {
  const prefix = dir === '' ? '' : dir + '/';
  const root: TreeNode = { kind: 'dir', name: '', path: dir, size: 0, binary: false, count: 0, children: [] };
  for (const f of files) {
    const rel = f.path.slice(prefix.length);
    const parts = rel.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i] as string;
      let next = cur.children!.find((c) => c.kind === 'dir' && c.name === name);
      if (!next) { next = { kind: 'dir', name, path: prefix + parts.slice(0, i + 1).join('/'), size: 0, binary: false, count: 0, children: [] }; cur.children!.push(next); }
      next.count++;
      cur = next;
    }
    cur.children!.push({ kind: 'file', name: parts[parts.length - 1] as string, path: f.path, size: f.size, binary: f.binary, count: 0 });
  }
  const sort = (ns: TreeNode[]): TreeNode[] => {
    ns.sort((a, b) => (a.kind === b.kind ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.kind === 'dir' ? -1 : 1));
    for (const n of ns) if (n.children) sort(n.children);
    return ns;
  };
  return sort(root.children!);
}

export interface Row { node: TreeNode; depth: number }
/** Duỗi cây thành các dòng hiển thị, chỉ đi vào thư mục đang mở. */
export function flatten(nodes: TreeNode[], open: Set<string>, depth = 0): Row[] {
  const out: Row[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.kind === 'dir' && open.has(n.path)) out.push(...flatten(n.children!, open, depth + 1));
  }
  return out;
}

export function filterFiles<T extends { path: string }>(files: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  return s === '' ? files : files.filter((f) => f.path.toLowerCase().includes(s));
}

const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico']);
const JS = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx']);
/** Ký hiệu ngắn đầu dòng của file trong cây. */
export function kindMark(path: string, binary: boolean): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext === 'md' || ext === 'markdown') return 'M↓';
  if (ext === 'py') return 'py';
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') return 'sh';
  if (JS.has(ext)) return 'js';
  if (IMG.has(ext)) return 'img';
  if (binary) return 'bin';
  return '·';
}
