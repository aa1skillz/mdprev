// Sinh vault mẫu ~50 note để thử xuất site tĩnh: node tools/make-vault-fixture.mjs <thư-mục> [--scale N] [--images]
// Xác định (không ngẫu nhiên). Đúng 3 liên kết hỏng: thiếu note, thiếu heading, ![[photo.png]].
// --scale N: lặp bộ thư mục N lần (N=10 → ~500 note). --images: thêm ảnh PNG/SVG thật trong attachments/ và note nhúng
// chúng (![[…]], ![[…|200]], ![](đường/dẫn), ![[note#heading]]); số liên kết hỏng không đổi.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { deflateSync } from 'node:zlib';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/make-vault-fixture.mjs <dir> [--scale N] [--images]'); process.exit(1); }
const scale = Math.max(1, Number(process.argv[process.argv.indexOf('--scale') + 1]) || 1);
const withImages = process.argv.includes('--images');

const folders = {
  'Projects/Alpha': ['Overview', 'Meeting Notes', 'Roadmap', 'Retro', 'Risks', 'Budget'],
  'Projects/Beta': ['Overview', 'Meeting Notes', 'Design', 'Launch', 'Metrics', 'Backlog'],
  'Areas/Health': ['Overview', 'Sleep', 'Running', 'Nutrition', 'Checkups', 'Habits'],
  'Areas/Finance': ['Overview', 'Savings', 'Taxes', 'Insurance', 'Investing', 'Subscriptions'],
  'Journal/2024': ['Overview', 'Tháng Giêng', 'Tháng Hai', 'Du lịch Đà Lạt', 'Reading log', 'Year review'],
  'Journal/2025': ['Overview', 'Spring', 'Summer', 'Tết ở quê', 'Weekly review', 'Goals'],
  'Reference/Tech': ['Overview', 'Git cheatsheet', 'Linux tips', 'Regex', 'Networking', 'Static sites'],
  'Reference/Books': ['Overview', 'Deep Work', 'Atomic Habits', 'Sách hay năm nay', 'Reading queue', 'Quotes'],
};

const notes = []; // { path, title?, name, folder }
notes.push({ path: 'Home.md', name: 'Home', folder: '' });
notes.push({ path: 'Projects/Index.md', name: 'Index', folder: 'Projects' });
for (let k = 0; k < scale; k++) for (const [f, names] of Object.entries(folders)) {
  const folder = k ? `Set ${k + 1}/${f}` : f;
  for (const name of names) notes.push({ path: `${folder}/${name}.md`, name, folder });
}

const rel = (from, to) => posix.relative(posix.dirname(from), to);
const viet = ['Hôm nay trời đẹp, mình đi bộ quanh hồ rồi ghi lại vài ý tưởng cho tuần mới.', 'Đường về quê sau Tết luôn đông; cả nhà quây quần bên mâm cơm.'];
const files = new Map();

notes.forEach((n, i) => {
  const pick = (k) => notes[(i * k + 3) % notes.length];
  const next = notes[(i + 1) % notes.length];
  const other = pick(7);
  const third = pick(11);
  const lines = [];
  if (i % 9 === 0 && n.path !== 'Home.md') lines.push('---', `title: ${n.name} (curated)`, 'tags: [fixture]', '---', '');
  lines.push(`# ${n.name}`, '', `Note number ${i + 1} in folder "${n.folder || 'root'}".`, '');
  lines.push('## Overview', '', i % 7 === 0 ? viet[i % 2] : 'A short paragraph with some **bold**, _italic_ and `inline code` for texture.', '');
  lines.push('## Details', '', `- See [[${next.name}]] next.`);
  lines.push(`- Aliased: [[${other.name}|read more about ${other.name}]].`);
  lines.push(`- Section link: [[${third.name}#Details]].`);
  if (i % 4 === 0) lines.push(`- Plain link: [${other.name}](${rel(n.path, other.path).split('/').map(encodeURIComponent).join('/')}).`);
  if (i % 5 === 0 && next.path !== n.path) lines.push('', `![[${next.name}]]`);
  lines.push('');
  files.set(n.path, lines);
});

// Home: khối code chứa [[not a link]] + liên kết hỏng #1 (thiếu note)
files.get('Home.md').push('## Notes', '', 'Start with [[Projects/Alpha/Overview]] or [[Journal/2025/Overview]].', '', '```md', 'Wikilinks look like [[not a link]] inside code.', '```', '', 'This one points nowhere: [[Does Not Exist]].', '');
// liên kết hỏng #2 (thiếu heading), #3 (embed file không có trong vault)
files.get('Projects/Alpha/Overview.md').push('Wrong section: [[Home#Missing Section]].', '');
files.get('Journal/2025/Spring.md').push('Photo: ![[photo.png]]', '');

// ảnh: PNG thật (đơn sắc, cỡ khác nhau), một SVG an toàn; mỗi note thứ 3 nhúng một ảnh
const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (w, h, rgb) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
};
const images = new Map();
if (withImages) {
  const n = 8 * scale;
  for (let i = 0; i < n; i++) images.set(`attachments/img-${i + 1}.png`, png(64 + (i % 5) * 32, 48 + (i % 3) * 24, [(i * 37) % 256, (i * 91) % 256, 160]));
  images.set('attachments/Sơ đồ.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="#dfe7f2"/><circle cx="30" cy="30" r="18" fill="#1d4e89"/></svg>'));
  notes.forEach((nt, i) => {
    if (i % 3) return;
    const img = `img-${(i % n) + 1}.png`;
    const lines = files.get(nt.path);
    lines.push('## Pictures', '', `![[${img}]]`, '', `![[${img}|200]]`, '', `![chart](${rel(nt.path, 'attachments/' + img).split('/').map(encodeURIComponent).join('/')})`, '');
  });
  files.get('Home.md').push('## Diagram', '', '![[Sơ đồ.svg|240]]', '', '![[Projects/Alpha/Overview#Details]]', '');
}

for (const [path, data] of images) { const file = join(out, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data); }
for (const [path, lines] of files) {
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, lines.join('\n'));
}
console.log(`${files.size} notes${images.size ? ` and ${images.size} images` : ''} written to ${out}`);
