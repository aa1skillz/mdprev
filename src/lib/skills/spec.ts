import type { Finding } from './types';

/** Kiểm theo https://agentskills.io/specification (đã đối chiếu trực tiếp). */
export interface SpecInput {
  fm: Record<string, unknown> | null;
  fmError?: string | undefined;
  /** Tên thư mục chứa SKILL.md; `''` nếu skill nằm ở gốc (bỏ qua so sánh với `name`). */
  dirName: string;
  skillMd: string;
}

const KNOWN = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const NAME_RE = /^[\p{Ll}\p{Nd}]+(-[\p{Ll}\p{Nd}]+)*$/u;
const FILE = 'SKILL.md';

/** Dòng (từ 1) của khoá trong khối frontmatter ở đầu file, hoặc undefined. */
function lineOfKey(md: string, key: string): number | undefined {
  const lines = md.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trimEnd() !== '---') return undefined;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (l.trimEnd() === '---') return undefined;
    if (l.startsWith(key + ':')) return i + 1;
  }
  return undefined;
}

/** Mọi điều sai của tên trong MỘT câu (không dừng ở lỗi đầu tiên), để người sửa không phải sửa rồi mới thấy lỗi kế tiếp. */
function nameProblem(name: string): string | null {
  if (name.length < 1) return 'The name is empty.';
  if (NAME_RE.test(name) && name.length <= 64) return null;
  const bad: string[] = [];
  if (name.length > 64) bad.push(`is ${name.length} characters long (the spec allows 64)`);
  if (name.startsWith('-') || name.endsWith('-')) bad.push('starts or ends with a hyphen');
  if (name.includes('--')) bad.push('has two hyphens in a row');
  const upper = [...new Set([...name].filter((c) => c !== c.toLowerCase()))];
  if (upper.length) bad.push(`has uppercase letters (${upper.slice(0, 4).join(' ')})`);
  const odd = [...new Set([...name.toLowerCase()].filter((c) => !/[\p{Ll}\p{Nd}-]/u.test(c)))];
  if (odd.length) bad.push('contains ' + odd.slice(0, 4).map((c) => (c === ' ' ? 'a space' : c === '_' ? 'an underscore' : `"${c}"`)).join(', '));
  return `The name ${bad.join(', ')}. Use lowercase letters, digits and single hyphens only.`;
}

const isMapping = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function checkSpec({ fm, fmError, dirName, skillMd }: SpecInput): Finding[] {
  const out: Finding[] = [];
  const add = (f: Omit<Finding, 'file'> & { key?: string }) => {
    const { key, ...rest } = f;
    const line = key ? lineOfKey(skillMd, key) : undefined;
    out.push({ ...rest, file: FILE, ...(line !== undefined ? { line } : {}) });
  };

  if (fm === null) {
    add({ id: 'spec.frontmatter', severity: 'review', title: 'SKILL.md has no valid frontmatter', detail: fmError ?? 'Add a --- block at the top with name and description.' });
  } else {
    const name = fm['name'];
    if (typeof name !== 'string') {
      add({ id: 'spec.name.missing', severity: 'review', title: 'The name is missing', detail: 'name is required and must be text.', key: 'name' });
    } else {
      const problem = nameProblem(name);
      if (problem) add({ id: 'spec.name.invalid', severity: 'review', title: 'The name is not valid', detail: problem, key: 'name' });
      else if (dirName !== '' && name !== dirName) {
        if (/template/i.test(dirName)) {
          add({ id: 'spec.name.template', severity: 'note', title: 'The name differs from the folder (looks like a template)', detail: `Folder “${dirName}”, name “${name}”.`, key: 'name' });
        } else {
          add({ id: 'spec.name.dir', severity: 'review', title: 'The name does not match the folder', detail: `Folder “${dirName}”, name “${name}”. The spec requires them to match.`, key: 'name' });
        }
      }
    }

    const desc = fm['description'];
    if (typeof desc !== 'string' || desc.trim() === '') {
      add({ id: 'spec.description.missing', severity: 'review', title: 'The description is missing', detail: 'description is required, 1 to 1024 characters.', key: 'description' });
    } else if (desc.length > 1024) {
      add({ id: 'spec.description.long', severity: 'review', title: 'The description is too long', detail: `${desc.length} characters; the spec allows 1024.`, key: 'description' });
    }

    const compat = fm['compatibility'];
    if (compat !== undefined && (typeof compat !== 'string' || compat.length < 1 || compat.length > 500)) {
      add({ id: 'spec.compatibility', severity: 'review', title: 'compatibility is not valid', detail: 'It must be text, 1 to 500 characters.', key: 'compatibility' });
    }

    const meta = fm['metadata'];
    if (meta !== undefined && (!isMapping(meta) || Object.values(meta).some((v) => typeof v !== 'string'))) {
      add({ id: 'spec.metadata', severity: 'note', title: 'metadata values should be text', detail: 'The spec describes metadata as a map of text to text; quote numbers such as "1.0".', key: 'metadata' });
    }

    const tools = fm['allowed-tools'];
    if (tools !== undefined && typeof tools !== 'string') {
      add({ id: 'spec.allowed-tools', severity: 'note', title: 'allowed-tools should be one line of text', detail: 'The spec describes a space-separated string. This field is experimental.', key: 'allowed-tools' });
    }

    const unknown = Object.keys(fm).filter((k) => !KNOWN.has(k));
    if (unknown.length) {
      add({ id: 'spec.unknown-field', severity: 'note', title: 'Fields the spec does not define', detail: unknown.join(', '), key: unknown[0] as string });
    }
  }

  const lines = skillMd.split('\n').length;
  if (lines > 500) {
    add({ id: 'spec.size.lines', severity: 'note', title: 'SKILL.md is long', detail: `${lines} lines; the spec recommends under 500 and moving detail into referenced files.` });
  }
  return out;
}
