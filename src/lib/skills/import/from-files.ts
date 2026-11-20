import { DEFAULT_LIMITS, ImportError, type Limits, type Vfs } from '../types';
import { IGNORED_PATH, isBinaryBytes, normalizePath } from '../vfs';

/** Cấu trúc tối thiểu của `File` (kèm `webkitRelativePath` làm `path`), để lõi không phụ thuộc DOM và dễ kiểm thử. */
export interface FileLike { path: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }

/**
 * Đọc một thư mục (danh sách file kèm đường dẫn tương đối) thành Vfs. Bỏ `.git` và `node_modules`; file nhị phân
 * hoặc quá lớn chỉ được liệt kê. Tên thư mục đã chọn là thư mục gốc, nên `name` của skill được so với đúng tên đó.
 */
export async function fromFiles(files: FileLike[], limits: Partial<Limits> = {}): Promise<Vfs> {
  const lim: Limits = { ...DEFAULT_LIMITS, ...limits };
  const usable: { path: string; file: FileLike }[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    if (path === null || IGNORED_PATH.test(path)) continue;
    usable.push({ path, file });
  }
  if (usable.length > lim.maxEntries) throw new ImportError('too-large', `The folder has more than ${lim.maxEntries} files.`);

  const vfs: Vfs = new Map();
  let total = 0;
  for (const { path, file } of usable) {
    if (file.size > lim.maxFileBytes) { vfs.set(path, { path, size: file.size, binary: true }); continue; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isBinaryBytes(bytes)) { vfs.set(path, { path, size: bytes.length, binary: true }); continue; }
    total += bytes.length;
    if (total > lim.maxTotalBytes) throw new ImportError('too-large', 'There is too much text to read.');
    vfs.set(path, { path, size: bytes.length, binary: false, text: new TextDecoder().decode(bytes) });
  }
  return vfs;
}
