import { unzipSync } from 'fflate';
import { DEFAULT_LIMITS, ImportError, type Limits, type Vfs } from '../types';
import { IGNORED_PATH, isBinaryBytes, normalizePath } from '../vfs';

/** Nếu mọi đường dẫn cùng nằm trong một thư mục gốc (kiểu `repo-main/`), bỏ thư mục đó. */
function commonTop(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const first = (paths[0] as string).split('/')[0] as string;
  return paths.every((p) => p.includes('/') && p.split('/')[0] === first) ? first : null;
}

/**
 * Đọc zip thành Vfs. Không ghi gì ra đĩa; vẫn loại đường dẫn nguy hiểm (`..`, tuyệt đối) và chặn zip bomb.
 * File nhị phân hoặc quá lớn chỉ được liệt kê (có `size`, không có `text`).
 */
export function fromZip(bytes: Uint8Array, limits: Partial<Limits> = {}): Vfs {
  const lim: Limits = { ...DEFAULT_LIMITS, ...limits };
  const skipped = new Map<string, number>(); // đường dẫn đã chuẩn hoá → kích thước (không giải nén)
  const kept = new Map<string, string>(); // tên gốc trong zip → đường dẫn chuẩn hoá
  let entries = 0;
  let unzipped = 0;

  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false;
        const p = normalizePath(f.name);
        if (p === null || IGNORED_PATH.test(p)) return false;
        if (++entries > lim.maxEntries) throw new ImportError('too-large', `The zip has more than ${lim.maxEntries} files.`);
        unzipped += f.originalSize;
        if (unzipped > lim.maxUnzipBytes) throw new ImportError('too-large', 'The zip is too large once unpacked.');
        if (f.originalSize > lim.maxFileBytes) { skipped.set(p, f.originalSize); return false; }
        kept.set(f.name, p);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('bad-zip', 'This does not look like a valid zip file.');
  }

  // Kích thước khai báo trong zip có thể sai: kiểm lại theo dữ liệu thật. (Hạn chế đã biết: unzipSync chạy đồng bộ và
  // đã giải nén xong khi tới đây, nên một zip bom thật sự vẫn có thể tốn bộ nhớ; chống triệt để cần giải nén dạng dòng.)
  let actual = 0;
  for (const d of Object.values(raw)) actual += d.length;
  if (actual > lim.maxUnzipBytes) throw new ImportError('too-large', 'The zip is too large once unpacked.');

  const all = [...kept.values(), ...skipped.keys()];
  const top = commonTop(all);
  const rel = (p: string): string => (top ? p.slice(top.length + 1) : p);

  const vfs: Vfs = new Map();
  let total = 0;
  for (const [name, data] of Object.entries(raw)) {
    const p = rel(kept.get(name) as string);
    if (isBinaryBytes(data)) { vfs.set(p, { path: p, size: data.length, binary: true }); continue; }
    total += data.length;
    if (total > lim.maxTotalBytes) throw new ImportError('too-large', 'There is too much text to read.');
    vfs.set(p, { path: p, size: data.length, binary: false, text: new TextDecoder().decode(data) });
  }
  for (const [p, size] of skipped) vfs.set(rel(p), { path: rel(p), size, binary: true });
  return vfs;
}
