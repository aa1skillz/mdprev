/** Bài mẫu (nạp khi bấm "Try a sample", File ▾ Sample hoặc palette; từ 2026-11-18 không còn là bài mặc định của /app/): một bài kỹ thuật dài dùng đủ các thành phần (front-matter, callout, bảng, code, math, Mermaid, task list, chú thích). */
import raw from './sample.md?raw';

export const SAMPLE: string = raw.replace(/\r\n/g, '\n');
