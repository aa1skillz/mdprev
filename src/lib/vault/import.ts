/**
 * Đọc một vault (zip hoặc thư mục đã chọn) thành note Markdown + ảnh. Thuần: không DOM, không IndexedDB.
 * Note đi qua bộ nhập của skill (chặn `..`, đường dẫn tuyệt đối, zip bomb, file quá lớn). Ảnh có giới hạn riêng
 * (mỗi ảnh, tổng, số lượng), phải đúng byte đầu theo đuôi file; SVG phải qua `svgProblem`.
 */
import { unzipSync } from 'fflate';
import { fromFiles, type FileLike } from '../skills/import/from-files';
import { fromZip } from '../skills/import/from-zip';
import { DEFAULT_LIMITS, ImportError, type Vfs } from '../skills/types';
import { IGNORED_PATH, normalizePath } from '../skills/vfs';
import { imageTypeOf, isImagePath, safeImageBytes, svgProblem } from './embed';

export interface ImageLimits { maxImageBytes: number; maxTotalBytes: number; maxImages: number }
/** 8 MB mỗi ảnh như ảnh dán vào studio; tổng 100 MB và 2000 ảnh để không làm đầy IndexedDB của trình duyệt. */
export const VAULT_IMAGE_LIMITS: ImageLimits = { maxImageBytes: 8 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024, maxImages: 2000 };

export interface VaultImageIn { path: string; type: string; bytes: Uint8Array }
export interface Dropped { path: string; size: number; reason: string }
export interface VaultRead { vfs: Vfs; images: VaultImageIn[]; dropped: Dropped[]; root?: string }

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
const byPath = <T extends { path: string }>(a: T, b: T) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** Nhận hay bỏ từng ảnh theo thứ tự đường dẫn, giữ ngân sách tổng; ảnh bị bỏ vì kích thước thì không đọc. */
async function admit(cands: { path: string; size: number; read: () => Promise<Uint8Array | null> }[], lim: ImageLimits): Promise<{ images: VaultImageIn[]; dropped: Dropped[] }> {
  const images: VaultImageIn[] = [];
  const dropped: Dropped[] = [];
  let total = 0;
  const seen = new Set<string>(); // zip có thể chứa `a/x.png` và `a//x.png`: cùng một đường dẫn sau chuẩn hoá, chỉ nhận lần đầu
  for (const c of [...cands].sort(byPath)) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    const skip = (reason: string, size = c.size) => { dropped.push({ path: c.path, size, reason }); };
    if (c.size > lim.maxImageBytes) { skip(`over ${mb(lim.maxImageBytes)}`); continue; }
    if (images.length >= lim.maxImages) { skip(`more than ${lim.maxImages} images`); continue; }
    if (total + c.size > lim.maxTotalBytes) { skip('image budget used up'); continue; }
    const b = await c.read();
    if (!b) { skip('could not be read'); continue; }
    if (b.length > lim.maxImageBytes) { skip(`over ${mb(lim.maxImageBytes)}`, b.length); continue; }
    if (total + b.length > lim.maxTotalBytes) { skip('image budget used up', b.length); continue; }
    if (!safeImageBytes(c.path, b)) {
      const why = /\.svg$/i.test(c.path) ? svgProblem(b) : null;
      skip(why ? `unsafe SVG (${why})` : 'not a valid image', b.length);
      continue;
    }
    total += b.length;
    images.push({ path: c.path, type: imageTypeOf(c.path), bytes: b });
  }
  return { images, dropped: dropped.sort(byPath) };
}

function commonTop(paths: string[]): string | null {
  if (!paths.length) return null;
  const first = (paths[0] ?? '').split('/')[0] ?? '';
  return paths.every((p) => p.includes('/') && p.split('/')[0] === first) ? first : null;
}

export async function readVaultZip(bytes: Uint8Array, limits: Partial<ImageLimits> = {}): Promise<VaultRead> {
  const lim = { ...VAULT_IMAGE_LIMITS, ...limits };
  // ảnh làm zip lớn hơn: nới trần giải nén của bộ nhập note đúng bằng ngân sách ảnh (giới hạn mặc định của Inspector không đổi)
  const vfs = fromZip(bytes, { maxUnzipBytes: DEFAULT_LIMITS.maxUnzipBytes + lim.maxTotalBytes });
  const names: string[] = [];
  const declared = new Map<string, number>();
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false;
        const p = normalizePath(f.name);
        if (p === null || IGNORED_PATH.test(p)) return false;
        names.push(p);
        if (!isImagePath(p)) return false;
        declared.set(f.name, f.originalSize);
        return f.originalSize <= lim.maxImageBytes; // ảnh quá lớn: không giải nén, chỉ báo
      },
    });
  } catch { throw new ImportError('bad-zip', 'This does not look like a valid zip file.'); }
  const top = commonTop(names);
  const rel = (p: string) => (top ? p.slice(top.length + 1) : p);
  const cands = [...declared].map(([name, size]) => {
    const p = rel(normalizePath(name) ?? name);
    const data = raw[name];
    return { path: p, size: data ? data.length : size, read: async () => data ?? null };
  });
  return { vfs, ...(await admit(cands, lim)) };
}

/** `files`: từ `<input webkitdirectory>` (đường dẫn có thư mục gốc đã chọn). Thư mục đã chọn là gốc, bị bỏ khỏi đường dẫn. */
export async function readVaultFiles(files: FileLike[], limits: Partial<ImageLimits> = {}): Promise<VaultRead> {
  const lim = { ...VAULT_IMAGE_LIMITS, ...limits };
  const usable = files.map((f) => ({ f, p: normalizePath(f.path) })).filter((x): x is { f: FileLike; p: string } => x.p !== null && !IGNORED_PATH.test(x.p));
  const top = commonTop(usable.map((x) => x.p));
  const rel = (p: string) => (top ? p.slice(top.length + 1) : p);
  const notes = usable.filter((x) => !isImagePath(x.p)).map((x) => ({ ...x.f, path: rel(x.p), arrayBuffer: () => x.f.arrayBuffer() }));
  const vfs = await fromFiles(notes);
  const cands = usable.filter((x) => isImagePath(x.p)).map((x) => ({
    path: rel(x.p), size: x.f.size,
    read: async () => { try { return new Uint8Array(await x.f.arrayBuffer()); } catch { return null; } },
  }));
  const r = await admit(cands, lim);
  return top ? { vfs, ...r, root: top } : { vfs, ...r };
}
