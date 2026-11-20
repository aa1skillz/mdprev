import type { Vfs } from './types';

/** Skill mẫu tự viết cho nút "try an example": hợp lệ, nhưng có một tham chiếu hỏng và một script đáng đọc để báo cáo có gì để xem. */
const FILES: Record<string, string> = {
  'example-skill/SKILL.md': `---
name: example-skill
description: Merge a folder of Markdown notes into one outline. Use when the user asks to combine, outline or summarise notes.
license: MIT
---
# Example skill

Run \`python scripts/outline.py notes/\` to build the outline, then follow the layout in \`references/format.md\`.

If the notes use wiki links, read \`references/links-guide.md\` first.
`,
  'example-skill/references/format.md': `# Outline format

One heading per note, in the order the files are listed. Keep each summary to two sentences.
`,
  'example-skill/scripts/outline.py': `import subprocess
import sys

folder = sys.argv[1]
# list the notes, then print their first lines
names = subprocess.run(f"ls {folder}", shell=True, capture_output=True, text=True).stdout.split()
for n in names:
    print(n)
`,
};

export function exampleVfs(): Vfs {
  const v: Vfs = new Map();
  for (const [path, text] of Object.entries(FILES)) v.set(path, { path, size: text.length, binary: false, text });
  return v;
}
