/**
 * Bộ icon nét (stroke) cho giao diện: lưới 24, nét 1,75, đầu và góc bo tròn, màu theo `currentColor` nên đổi theo chủ đề.
 * Chỉ giữ những icon đang dùng; thêm icon mới thì vẽ cùng lưới và độ dày nét này.
 */
import { kindOf } from '../../lib/skills/vfs';
const P = {
  link: { d: 'M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.14 1.14M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.13-1.13' },
  quote: { d: 'M5 4v16M10 8h9M10 12h9M10 16h6' },
  code: { d: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
  fence: { d: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM10 10l-2 2 2 2M14 10l2 2-2 2' },
  list: { d: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01' },
  ol: { d: 'M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1' },
  task: { d: 'M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7.5 4.5M3 12l1.5 1.5 3-3M3 18l1.5 1.5 3-3' },
  table: { d: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 10h16M4 15h16M10 4v16' },
  aa: { d: 'M3 18 8 6l5 12M5 14h6M15 18l3-8 3 8M16 16h4' },
  panelL: { d: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 4v16' },
  insp: { d: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 4v16' },
  chev: { d: 'm6 9.5 6 6 6-6' },
  fdoc: { d: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 15.5h6' },
  fcode: { d: 'M7 3h7l4 4v14H7zM14 3v4h4M10.5 12.5l-1.7 1.7 1.7 1.7M14.5 12.5l1.7 1.7-1.7 1.7' },
  fimg: { d: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 18l2.5-3 2 2 1.5-1.5 1 1.5' },
  ffile: { d: 'M7 3h7l4 4v14H7zM14 3v4h4' },
  pencil: { d: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' },
  split: { d: 'M3 4h18v16H3zM12 4v16' },
  sync: { d: 'M7 20V5M4 8l3-3 3 3M17 4v15M14 16l3 3 3-3' },
  syncoff: { d: 'M7 20V5M4 8l3-3 3 3M17 4v15M14 16l3 3 3-3M3 3l18 18' },
  read: { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  zen: { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z' },
  gear: { d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
  sun: { d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' },
  moon: { d: 'M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z' },
  fplus: { d: 'M7 3h7l4 4v14H7zM14 3v4h4M12.5 11v6M9.5 14h6' },
  folder: { d: 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z' },
  scan: { d: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8' },
  undo: { d: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3' },
  redo: { d: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3' },
  hr: { d: 'M3 12h18M8 7h.01M12 7h.01M16 7h.01M8 17h.01M12 17h.01M16 17h.01' },
  math: { d: 'M5 5h14M5 19h14M7 5l9 14M16 5 7 19' },
  image: { d: 'M3 4h18v16H3zM9 8.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM21 16l-5-5-8 8' },
  toc: { d: 'M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11' },
  copy: { d: 'M9 9h11v11H9zM5 15V5a1 1 0 0 1 1-1h10' },
  check: { d: 'm4 12.5 5 5L20 6.5' },
  bold: { d: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z' },
  italic: { d: 'M10 5h8M6 19h8M14 5 10 19' },
  strike: { d: 'M4 12h16M16.5 7.5C16 5.8 14.4 5 12.3 5 9.8 5 8 6.2 8 8c0 4 8.5 2 8.5 6.5 0 1.9-1.9 3.5-4.5 3.5-2.3 0-4-.9-4.5-2.7' },
  h1: { d: 'M4 6v12M12 6v12M4 12h8M17 10l3-2v10' },
  h2: { d: 'M4 6v12M12 6v12M4 12h8M16.5 10a2 2 0 1 1 3.4 1.4L16 18h4.5' },
  h3: { d: 'M4 6v12M12 6v12M4 12h8M16 9h4l-2.5 3a2.2 2.2 0 1 1-1.6 3.8' },
  trash: { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' },
  diff: { d: 'M12 4v8M8 8h8M8 18h8' },
  play: { d: 'M7 4.5v15l13-7.5z' },
  cmd: { d: 'M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3' },
  rowabove: { d: 'M4 12h16v8H4zM4 16h16M12 3v5M9.5 5.5h5' },
  rowbelow: { d: 'M4 4h16v8H4zM4 8h16M12 16v5M9.5 18.5h5' },
  rowdel: { d: 'M4 8h16v8H4zM4 12h16M9.5 10.2l5 3.6M14.5 10.2l-5 3.6' },
  colleft: { d: 'M12 4h8v16h-8zM16 4v16M3 12h5M5.5 9.5v5' },
  colright: { d: 'M4 4h8v16H4zM8 4v16M16 12h5M18.5 9.5v5' },
  coldel: { d: 'M9 4h6v16H9zM12 4v16M3.5 9.5l4 5M7.5 9.5l-4 5' },
  alignleft: { d: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  aligncenter: { d: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  alignright: { d: 'M4 6h16M10 10h10M4 14h16M10 18h10' },
  sortasc: { d: 'M7 5v14M4 8l3-3 3 3M14 7h6M14 12h4M14 17h2' },
  sortdesc: { d: 'M7 5v14M4 16l3 3 3-3M14 17h6M14 12h4M14 7h2' },
  x: { d: 'M6 6l12 12M18 6 6 18' },
  chevl: { d: 'm15 6-6 6 6 6' },
  chevr: { d: 'm9 6 6 6-6 6' },
  grid: { d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  notes: { d: 'M5 4h14v12H8l-3 3zM8 8h8M8 12h5' },
  monitor: { d: 'M3 5h18v12H3zM8 21h8M12 17v4' },
  download: { d: 'M12 3v12M7 10l5 5 5-5M4 20h16' },
  expand: { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
  blank: { d: 'M3 5h18v14H3zM3 5l18 14' },
  reset: { d: 'M4 12a8 8 0 1 0 2.5-5.8L4 8M4 3v5h5' },
  help: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01' },
  print: { d: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z' },
  more: { d: 'M5 12h.01M12 12h.01M19 12h.01' },
  find: { d: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3' },
} as const satisfies Record<string, { d: string; f?: string }>;
export type IconName = keyof typeof P;

/** Icon file theo loại (skill, doc, script, asset, other) dùng chung cho cây file của editor và của Inspector. */
export const fileIconFor = (path: string): IconName => ({ skill: 'fdoc', doc: 'fdoc', script: 'fcode', asset: 'fimg', other: 'ffile' } as const)[kindOf(path)];

/** `s` là cạnh (px) của icon. */
export function Icon({ n, s = 16 }: { n: IconName; s?: number }) {
  const p: { d: string; f?: string } = P[n];  // `f`: phần tô đặc (dành cho icon cần nửa đặc); hiện chưa icon nào dùng
  return (
    <svg class="ic" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={p.d} />
      {p.f && <path d={p.f} fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** Lối tới trang hướng dẫn. mdprev chưa có docs (bài hướng dẫn cũ nằm ở cris-blog), nên tạm thời không hiện gì. */
export default function GuideLink(_props: { tool: string; compact?: boolean }) {
  return null;
}
