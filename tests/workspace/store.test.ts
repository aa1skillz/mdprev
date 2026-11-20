import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fromVfs, type Workspace } from '../../src/lib/workspace/model';
import { deleteWorkspace, getWorkspace, listWorkspaces, putWorkspace, resetConnection } from '../../src/lib/workspace/store';

const mk = (id: string, updatedAt: number): Workspace => ({
  ...fromVfs(new Map([['SKILL.md', { path: 'SKILL.md', size: 1, binary: false, text: 'a' }]]), { id, name: 'ws-' + id, label: 'l', now: updatedAt }),
});
const g = globalThis as { indexedDB?: unknown };
const real = g.indexedDB;

beforeEach(() => { resetConnection(); g.indexedDB = new IDBFactory(); });
afterEach(() => { g.indexedDB = real; });

describe('store', () => {
  it('put/get/delete', async () => {
    expect(await getWorkspace('x')).toBeUndefined();
    await putWorkspace(mk('x', 1));
    expect(await getWorkspace('x')).toEqual(mk('x', 1));
    await putWorkspace({ ...mk('x', 1), name: 'đổi' });
    expect((await getWorkspace('x'))?.name).toBe('đổi');
    await deleteWorkspace('x');
    expect(await getWorkspace('x')).toBeUndefined();
    await deleteWorkspace('x'); // xoá cái không có: không lỗi
  });
  it('list: mới nhất trước, kèm fileCount', async () => {
    await putWorkspace(mk('old', 1));
    await putWorkspace(mk('new', 9));
    await putWorkspace(mk('mid', 5));
    const l = await listWorkspaces();
    expect(l.map((w) => w.id)).toEqual(['new', 'mid', 'old']);
    expect(l[0]).toEqual({ id: 'new', name: 'ws-new', updatedAt: 9, fileCount: 1 });
  });
  it('list rỗng', async () => expect(await listWorkspaces()).toEqual([]));
  it('không có indexedDB → storage-unavailable', async () => {
    g.indexedDB = undefined;
    await expect(listWorkspaces()).rejects.toThrow('storage-unavailable');
    await expect(getWorkspace('x')).rejects.toThrow('storage-unavailable');
    await expect(putWorkspace(mk('x', 1))).rejects.toThrow('storage-unavailable');
    await expect(deleteWorkspace('x')).rejects.toThrow('storage-unavailable');
  });
  it('open ném hoặc báo lỗi → storage-unavailable', async () => {
    g.indexedDB = { open: () => { throw new Error('denied'); } };
    await expect(listWorkspaces()).rejects.toThrow('storage-unavailable');
    g.indexedDB = { open: () => { const r: Record<string, unknown> = {}; queueMicrotask(() => (r.onerror as () => void)()); return r; } };
    await expect(listWorkspaces()).rejects.toThrow('storage-unavailable');
    g.indexedDB = { open: () => { const r: Record<string, unknown> = {}; queueMicrotask(() => (r.onblocked as () => void)()); return r; } };
    await expect(listWorkspaces()).rejects.toThrow('storage-unavailable');
  });
});
