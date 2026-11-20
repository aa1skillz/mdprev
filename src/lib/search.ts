/** Lọc lệnh của Palette: không dấu, nhiều từ. */

/** Bỏ dấu từng ký tự (giữ nguyên độ dài chuỗi) và chuyển thường, để chỉ số khớp với văn bản gốc. */
export function fold(s: string): string {
  return [...s].map((c) => { const b = c.normalize('NFD')[0] as string; return b === 'đ' || b === 'Đ' ? 'd' : b.toLowerCase(); }).join('');
}
export const tokens = (q: string): string[] => fold(q.trim()).split(/\s+/).filter(Boolean);

export interface Seg { t: string; h: boolean }
export function highlight(text: string, toks: string[]): Seg[] {
  const n = fold(text), mk = new Array<boolean>(n.length).fill(false);
  toks.forEach((t) => { let k = 0; while ((k = n.indexOf(t, k)) >= 0) { for (let j = k; j < k + t.length; j++) mk[j] = true; k += t.length; } });
  const segs: Seg[] = [];
  [...text].forEach((c, j) => { const last = segs[segs.length - 1]; if (last && last.h === mk[j]) last.t += c; else segs.push({ t: c, h: !!mk[j] }); });
  return segs;
}

export interface CmdDef { key: string; label: string; hint: string; desc: string; id: string }
export function filterCommands(cmds: CmdDef[], rawAfterGt: string): { cmd: CmdDef; segs: Seg[] }[] {
  const toks = tokens(rawAfterGt);
  return cmds.filter((c) => toks.every((t) => fold(c.label + ' ' + c.key).includes(t))).map((cmd) => ({ cmd, segs: highlight(cmd.label, toks) }));
}
