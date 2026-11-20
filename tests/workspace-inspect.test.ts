import { describe, expect, it } from 'vitest';
import { inspectWorkspace, workspaceVfs } from '../src/lib/workspace/inspect';
import type { Workspace } from '../src/lib/workspace/model';

const SKILL = '---\nname: demo\ndescription: Does a thing. Use when asked.\n---\n# Demo\n\nSee `assets/logo.png` and `scripts/run.py`.\n';
const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: 'w', name: 'demo', origin: { kind: 'skill-copy', label: 'test' }, createdAt: 0, updatedAt: 0, base: {},
  files: [{ path: 'SKILL.md', size: SKILL.length, text: SKILL }, { path: 'scripts/run.py', size: 20, text: 'print("hi")\n' }],
  skipped: [{ path: 'assets/logo.png', size: 4096 }],
  ...over,
});

describe('inspectWorkspace', () => {
  it('file nhị phân đã bỏ qua vẫn là file của skill: tham chiếu tới nó không bị báo thiếu', () => {
    const r = inspectWorkspace(ws(), 'SKILL.md', SKILL)!;
    expect(r.findings.filter((f) => f.id.startsWith('refs'))).toEqual([]);
    expect(workspaceVfs(ws(), null, '').get('assets/logo.png')).toMatchObject({ binary: true, size: 4096 });
  });
  it('xoá file khỏi bản sao thì tham chiếu tới nó bị báo thiếu', () => {
    const r = inspectWorkspace(ws({ files: [{ path: 'SKILL.md', size: SKILL.length, text: SKILL }] }), 'SKILL.md', SKILL)!;
    expect(r.findings.some((f) => /scripts\/run\.py/.test(f.title))).toBe(true);
  });
  it('dùng văn bản đang gõ của file đang mở, không dùng bản đã lưu', () => {
    const typed = SKILL.replace('Does a thing. Use when asked.', 'x'.repeat(1100));
    const r = inspectWorkspace(ws(), 'SKILL.md', typed)!;
    expect(r.findings.some((f) => f.id.startsWith('spec.') && f.severity === 'review')).toBe(true);
  });
  it('không có SKILL.md thì không có báo cáo; nhiều skill thì chọn skill chứa file đang mở', () => {
    expect(inspectWorkspace(ws({ files: [{ path: 'a.md', size: 1, text: 'x' }], skipped: [] }), 'a.md', 'x')).toBeNull();
    const two = ws({ files: [{ path: 'a/SKILL.md', size: 1, text: SKILL.replace('demo', 'a') }, { path: 'b/SKILL.md', size: 1, text: SKILL.replace('demo', 'b') }], skipped: [] });
    expect(inspectWorkspace(two, 'b/SKILL.md', SKILL.replace('demo', 'b'))!.dir).toBe('b');
  });
  it('skill 3000 dòng: một lần phân tích dưới 150 ms (chạy trên luồng chính sau mỗi lần ngừng gõ)', () => {
    const big = '---\nname: big\ndescription: A very large skill. Use when testing.\n---\n# Big\n\n' + Array.from({ length: 3000 }, (_, i) => `Line ${i} refers to references/r${i % 7}.md and scripts/s.py.`).join('\n') + '\n';
    const w = ws({ files: [{ path: 'SKILL.md', size: big.length, text: big }, { path: 'scripts/s.py', size: 5, text: 'x=1\n' }], skipped: [] });
    inspectWorkspace(w, 'SKILL.md', big); // khởi động
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) inspectWorkspace(w, 'SKILL.md', big + 'x'.repeat(i));
    expect((performance.now() - t0) / 5).toBeLessThan(150);
  });
});
