// Tải một bộ skill công khai vào .cache/skills-real/ (không commit) để chạy test hiệu chuẩn
// (tests/skills/calibration.test.ts). Mặc định anthropics/skills; chỉ lấy file văn bản.
//   node tools/fetch-skills-cache.mjs [owner/repo]
// Chú ý: test hiệu chuẩn mong đợi đúng bộ anthropics/skills đã đo ngày 2026-11-13 (20 skill); repo khác sẽ làm test lệch số.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const repo = process.argv[2] ?? 'anthropics/skills';
const OUT = join('.cache', 'skills-real');
const TEXT = /\.(md|markdown|txt|py|sh|bash|js|mjs|cjs|ts|tsx|json|ya?ml|html|css|xml|toml|csv|ini|cfg|rst)$|(^|\/)(LICENSE|NOTICE|README|Dockerfile|Makefile)[^/.]*$/i;
const MAX = 512 * 1024;

const tree = await (await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`)).json();
if (!Array.isArray(tree.tree)) throw new Error('Không đọc được danh sách file: ' + JSON.stringify(tree).slice(0, 200));
const files = tree.tree.filter((e) => e.type === 'blob' && TEXT.test(e.path) && (e.size ?? 0) <= MAX);
let done = 0;
let next = 0;
async function worker() {
  while (next < files.length) {
    const e = files[next++];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${e.path.split('/').map(encodeURIComponent).join('/')}`);
      if (r.ok) {
        const dest = join(OUT, e.path);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        done++;
        break;
      }
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`${done}/${files.length} file văn bản từ ${repo} vào ${OUT}`);
