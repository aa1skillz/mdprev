/** Phân tích bản sao đang sửa: dựng Vfs từ file của workspace (văn bản đang gõ thay cho bản đã lưu) rồi chạy lõi Inspector. Thuần, không DOM. */
import type { SkillReport, Vfs } from '../skills/types';
import { inspectSkill } from '../skills/inspect';
import { skillDirs } from '../skills/vfs';
import type { Workspace } from './model';

/** File nhị phân của bản gốc vào Vfs dưới dạng `binary`, để tham chiếu tới ảnh/asset không bị báo thiếu. */
export function workspaceVfs(ws: Workspace, openPath: string | null, openText: string): Vfs {
  const v: Vfs = new Map();
  for (const f of ws.files) {
    const text = f.path === openPath ? openText : f.text;
    v.set(f.path, { path: f.path, size: f.path === openPath ? new TextEncoder().encode(text).length : f.size, binary: false, text });
  }
  for (const s of ws.skipped) if (!v.has(s.path)) v.set(s.path, { path: s.path, size: s.size, binary: true });
  return v;
}

/** Báo cáo của skill chứa file đang mở (hoặc skill đầu tiên); `null` nếu bản sao không có SKILL.md. */
export function inspectWorkspace(ws: Workspace, openPath: string | null, openText: string): SkillReport | null {
  const vfs = workspaceVfs(ws, openPath, openText);
  const dirs = skillDirs(vfs);
  if (dirs.length === 0) return null;
  const dir = (openPath && dirs.filter((d) => d === '' || openPath.startsWith(d + '/')).sort((a, b) => b.length - a.length)[0]) ?? dirs[0]!;
  return inspectSkill(vfs, dir);
}
