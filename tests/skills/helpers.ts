import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Vfs } from '../../src/lib/skills/types';

/** Dựng Vfs từ bản đồ đường dẫn → nội dung (tất cả là văn bản). */
export const vfsOf = (files: Record<string, string>): Vfs => {
  const v: Vfs = new Map();
  for (const [path, text] of Object.entries(files)) v.set(path, { path, size: text.length, binary: false, text });
  return v;
};


/** Bộ skill thật đã tải vào `.cache/skills-real/` (không commit). `null` nếu chưa có, để test hiệu chuẩn tự bỏ qua. */
export function realSkills(): Vfs | null {
  const root = join(process.cwd(), '.cache/skills-real');
  if (!existsSync(root)) return null;
  const v: Vfs = new Map();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const path = full.slice(root.length + 1);
        const text = readFileSync(full, 'utf8');
        v.set(path, { path, size: text.length, binary: false, text });
      }
    }
  };
  walk(root);
  return v;
}
