import type { FileKind, VFile, Vfs } from './types';

/** File có byte NUL trong 8 KB đầu thì coi là nhị phân. */
export function isBinaryBytes(b: Uint8Array): boolean {
  const n = Math.min(b.length, 8192);
  for (let i = 0; i < n; i++) if (b[i] === 0) return true;
  return false;
}

/** Thư mục và file không thuộc nội dung skill (bỏ qua khi nhập zip hoặc thư mục): kiểm soát phiên bản, thư viện, rác của macOS. */
export const IGNORED_PATH = /(^|\/)(\.git|node_modules|__MACOSX)(\/|$)|(^|\/)\.DS_Store$/;

/**
 * Chuẩn hoá đường dẫn trong zip/repo về dạng posix tương đối.
 * Trả `null` nếu rỗng, tuyệt đối, có ổ đĩa hay có `..` (chống zip-slip).
 */
export function normalizePath(p: string): string | null {
  const s = p.replace(/\\/g, '/');
  if (s.startsWith('/') || /^[A-Za-z]:/.test(s)) return null;
  const out: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    out.push(seg);
  }
  return out.length ? out.join('/') : null;
}

export const dirOf = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
};
export const baseOf = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

const DOC = new Set(['md', 'markdown', 'txt', 'rst']);
const SCRIPT = new Set(['py', 'sh', 'bash', 'js', 'mjs', 'cjs', 'ts']);
const ASSET = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'pdf', 'ttf', 'otf', 'woff', 'woff2', 'zip', 'docx', 'pptx', 'xlsx']);

export function kindOf(path: string): FileKind {
  const base = baseOf(path);
  if (base === 'SKILL.md') return 'skill';
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
  if (DOC.has(ext)) return 'doc';
  if (SCRIPT.has(ext)) return 'script';
  if (ASSET.has(ext)) return 'asset';
  return 'other';
}


/** Mọi thư mục chứa đúng một `SKILL.md` (`''` nếu ở gốc), sắp xếp. */
export function skillDirs(vfs: Vfs): string[] {
  const dirs: string[] = [];
  for (const p of vfs.keys()) if (baseOf(p) === 'SKILL.md') dirs.push(dirOf(p));
  return dirs.sort();
}

const INDEX = new WeakMap<Vfs, { size: number; byDir: Map<string, VFile[]> }>();

/** Gom file theo skill sở hữu (skill gần nhất đi lên từ thư mục của file), một lượt qua Vfs. Tính lại nếu số file đổi. */
function indexOf(vfs: Vfs): Map<string, VFile[]> {
  const hit = INDEX.get(vfs);
  if (hit && hit.size === vfs.size) return hit.byDir;
  const dirs = new Set(skillDirs(vfs));
  const byDir = new Map<string, VFile[]>();
  for (const [p, f] of vfs) {
    let d = dirOf(p);
    for (;;) {
      if (dirs.has(d)) {
        const list = byDir.get(d);
        if (list) list.push(f); else byDir.set(d, [f]);
        break;
      }
      if (d === '') break;
      d = dirOf(d);
    }
  }
  INDEX.set(vfs, { size: vfs.size, byDir });
  return byDir;
}

/** File thuộc skill ở `dir`, trừ file của skill khác lồng bên trong. Kết quả dùng chung: đừng sửa mảng trả về. */
export function filesOfSkill(vfs: Vfs, dir: string): readonly VFile[] {
  const owned = indexOf(vfs).get(dir);
  if (owned) return owned;
  // `dir` không chứa SKILL.md: lấy theo tiền tố, trừ skill lồng bên trong.
  const prefix = dir === '' ? '' : dir + '/';
  const nested = skillDirs(vfs).filter((d) => d !== dir && (dir === '' || d.startsWith(prefix)));
  const out: VFile[] = [];
  for (const [p, f] of vfs) {
    if (!p.startsWith(prefix)) continue;
    if (nested.some((n) => p.startsWith(n + '/'))) continue;
    out.push(f);
  }
  return out;
}
