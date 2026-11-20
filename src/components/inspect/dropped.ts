import { ImportError } from '../../lib/skills/types';
import type { FileLike } from '../../lib/skills/import/from-files';

const MAX_FILES = 20_000;
const SKIP = new Set(['.git', 'node_modules']);

const toLike = (path: string, file: File): FileLike => ({ path, size: file.size, arrayBuffer: () => file.arrayBuffer() });

/** Danh sách file từ `<input webkitdirectory>`. */
export function fromFileList(list: FileList): FileLike[] {
  return Array.from(list).map((f) => toLike(f.webkitRelativePath || f.name, f));
}

async function walk(entry: FileSystemEntry, out: FileLike[]): Promise<void> {
  if (out.length > MAX_FILES) throw new ImportError('too-large', 'That folder has too many files.');
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push(toLike(entry.fullPath.replace(/^\//, ''), file));
    return;
  }
  if (SKIP.has(entry.name)) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    for (const e of batch) await walk(e, out);
  }
}

/** Mục thả vào: một file zip, hoặc một/nhiều thư mục (duyệt đệ quy). */
export async function readDrop(dt: DataTransfer): Promise<{ zip: File } | { files: FileLike[] } | null> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null).filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) {
    const f = dt.files?.[0];
    return f && /\.zip$/i.test(f.name) ? { zip: f } : null;
  }
  if (entries.length === 1 && entries[0]!.isFile && /\.zip$/i.test(entries[0]!.name)) {
    const file = await new Promise<File>((res, rej) => (entries[0] as FileSystemFileEntry).file(res, rej));
    return { zip: file };
  }
  const out: FileLike[] = [];
  for (const e of entries) await walk(e, out);
  return out.length ? { files: out } : null;
}
