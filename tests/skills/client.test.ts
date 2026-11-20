import { describe, expect, it } from 'vitest';
import { inspectVfs, unwrapRpc } from '../../src/lib/skills/client';
import { inspectCollection } from '../../src/lib/skills/inspect';
import { vfsOf } from './helpers';

describe('inspectVfs / unwrapRpc', () => {
  it('không có Worker thì dùng đường dự phòng và cho đúng kết quả của inspectCollection', async () => {
    const v = vfsOf({ 'a/SKILL.md': '---\nname: a\ndescription: d\n---\nbody', 'a/x.md': 'hello' });
    expect(await inspectVfs(v)).toEqual(inspectCollection(v));
  });

  it('unwrapRpc: ok trả giá trị; các loại còn lại ném lỗi có name riêng', () => {
    expect(unwrapRpc({ kind: 'ok', res: 5 })).toBe(5);
    const name = (o: Parameters<typeof unwrapRpc>[0]): string => { try { unwrapRpc(o); return ''; } catch (e) { return (e as Error).name; } };
    expect(name({ kind: 'timeout' })).toBe('Timeout');
    expect(name({ kind: 'superseded' })).toBe('Superseded');
    expect(name({ kind: 'error', message: 'x' })).toBe('InspectError');
  });
});
