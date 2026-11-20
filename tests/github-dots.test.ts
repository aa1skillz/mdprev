import { describe, expect, it } from 'vitest';
import { parseGithubUrl } from '../src/lib/skills/import/from-github';
import { toRawUrl } from '../src/lib/studio/source';

describe('đoạn "." và ".." trong liên kết GitHub', () => {
  it('parseGithubUrl từ chối owner hoặc repo là . hoặc ..', () => {
    expect(parseGithubUrl('github.com/../repo')).toBeNull();
    expect(parseGithubUrl('github.com/owner/..')).toBeNull();
    expect(parseGithubUrl('github.com/owner/repo')).not.toBeNull();
  });
  it('toRawUrl từ chối owner hoặc repo là . hoặc ..', () => {
    expect(toRawUrl('https://github.com/../x/blob/main/a.md')).toBeNull();
    expect(toRawUrl('https://github.com/o/../blob/main/a.md')).toBeNull();
    expect(toRawUrl('https://github.com/o/r/blob/main/a.md')).toContain('raw.githubusercontent.com/o/r/main/a.md');
  });
});
