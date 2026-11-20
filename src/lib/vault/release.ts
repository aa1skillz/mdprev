/**
 * Đóng vault: xoá ảnh của nó khỏi kho ảnh, trừ ảnh còn được dùng ở chỗ khác (vault khác, tài liệu nháp, Restore previous,
 * bản chụp History). Ảnh lưu theo băm nội dung nên một ảnh dán vào tài liệu có thể trùng id với ảnh của vault.
 */
import { deleteAssets, refsIn } from '../studio/assets';
import { listSnapshots } from '../studio/history';
import { imageIdsInUse } from '../workspace/store';

export async function releaseImages(ids: string[], texts: string[]): Promise<number> {
  if (!ids.length) return 0;
  const keep = await imageIdsInUse().catch(() => null);
  if (!keep) return 0; // không đọc được kho: không xoá gì
  for (const s of (await listSnapshots()) ?? []) refsIn(s.text).forEach((id) => keep.add(id));
  for (const t of texts) refsIn(t).forEach((id) => keep.add(id));
  const drop = [...new Set(ids)].filter((id) => !keep.has(id));
  return drop.length && (await deleteAssets(drop)) ? drop.length : 0;
}
