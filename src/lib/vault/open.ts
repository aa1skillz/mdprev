/**
 * Mở một thư mục hoặc zip Markdown thành vault (workspace M2 kind `vault`, lưu IndexedDB). Nạp lười từ studio.
 * Note đi qua bộ nhập của skill (chặn `..`, zip bomb, file quá lớn); ảnh (png, jpg, gif, webp, svg, avif) đi vào kho ảnh
 * của studio với giới hạn riêng (`import.ts`), workspace chỉ giữ đường dẫn → id.
 */
import type { FileLike } from '../skills/import/from-files';
import { fromVfs, type WsImage } from '../workspace/model';
import { putWorkspace } from '../workspace/store';
import { newId } from '../workspace/active';
import { putAsset } from '../studio/assets';
import { readVaultFiles, readVaultZip, type VaultImageIn } from './import';

/** Lỗi đọc vault, thông báo hiện thẳng cho người dùng. */
export class VaultError extends Error {}

/** Lưu ảnh vào kho ảnh, vài ảnh một lúc. Ảnh không lưu được (hết chỗ, không có IndexedDB) được báo như ảnh bị bỏ. */
export async function storeImages(images: VaultImageIn[]): Promise<{ stored: WsImage[]; failed: { path: string; size: number; reason: string }[] }> {
  const stored: WsImage[] = [];
  const failed: { path: string; size: number; reason: string }[] = [];
  let i = 0;
  const one = async () => {
    for (let im = images[i++]; im; im = images[i++]) {
      const name = im.path.slice(im.path.lastIndexOf('/') + 1);
      const id = await putAsset(new Blob([im.bytes as BlobPart], { type: im.type }), name);
      if (id) stored.push({ path: im.path, id, size: im.bytes.length, type: im.type }); else failed.push({ path: im.path, size: im.bytes.length, reason: 'could not be stored in this browser' });
    }
  };
  await Promise.all([one(), one(), one(), one()]);
  stored.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { stored, failed };
}

/** `files`: từ `<input webkitdirectory>` (đường dẫn có thư mục gốc đã chọn). Trả id workspace đã lưu. */
export async function openVault(src: { zip: File } | { files: File[] }): Promise<string> {
  let name: string;
  let read;
  if ('zip' in src) {
    read = await readVaultZip(new Uint8Array(await src.zip.arrayBuffer()));
    name = src.zip.name.replace(/\.zip$/i, '') || 'vault';
  } else {
    const like: FileLike[] = src.files.map((f) => ({ path: f.webkitRelativePath || f.name, size: f.size, arrayBuffer: () => f.arrayBuffer() }));
    read = await readVaultFiles(like);
    name = read.root ?? like[0]?.path.split('/')[0] ?? 'vault';
  }
  const now = Date.now();
  const ws = fromVfs(read.vfs, { id: newId(), name, label: name, now, kind: 'vault' });
  if (!ws.files.length) throw new VaultError('No Markdown files (.md) found there.');
  const { stored, failed } = await storeImages(read.images);
  const imgPaths = new Set(stored.map((s) => s.path));
  ws.images = stored;
  // ảnh đã nhận không còn là "file không chép"; ảnh bị bỏ ghi kèm lý do
  ws.skipped = [...ws.skipped.filter((s) => !imgPaths.has(s.path) && !read.dropped.some((d) => d.path === s.path) && !failed.some((f) => f.path === s.path)), ...read.dropped, ...failed]
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  await putWorkspace(ws);
  return ws.id;
}
