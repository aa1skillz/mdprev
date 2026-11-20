import { describe, expect, it } from 'vitest';
import { exampleVfs } from '../../src/lib/skills/example';
import { inspectCollection } from '../../src/lib/skills/inspect';

describe('exampleVfs', () => {
  it('là một skill hợp lệ có đúng một tham chiếu hỏng và một script đáng đọc', () => {
    const r = inspectCollection(exampleVfs());
    expect(r.skills).toHaveLength(1);
    const s = r.skills[0]!;
    expect(s.name).toBe('example-skill');
    expect(s.findings.map((x) => x.id).sort()).toEqual(['ref.missing', 'script.review']);
    expect(s.findings.some((x) => x.id.startsWith('spec.'))).toBe(false);
  });
});
