import { describe, expect, it } from 'vitest';
import { fetchGithub, parseGithubUrl } from '../../src/lib/skills/import/from-github';
import { ImportError } from '../../src/lib/skills/types';

describe('parseGithubUrl', () => {
  it('đọc dạng gốc repo, tree, blob, .git, dấu / cuối, không scheme, www, query và fragment', () => {
    expect(parseGithubUrl('github.com/anthropics/skills')).toEqual({ owner: 'anthropics', repo: 'skills', rest: [] });
    expect(parseGithubUrl('https://github.com/anthropics/skills/')).toEqual({ owner: 'anthropics', repo: 'skills', rest: [] });
    expect(parseGithubUrl('https://www.github.com/a/b.git')).toEqual({ owner: 'a', repo: 'b', rest: [] });
    expect(parseGithubUrl('https://github.com/anthropics/skills/tree/main/skills/pptx')).toEqual({ owner: 'anthropics', repo: 'skills', rest: ['main', 'skills', 'pptx'] });
    expect(parseGithubUrl('https://github.com/a/b/blob/main/skills/pptx/SKILL.md')).toEqual({ owner: 'a', repo: 'b', rest: ['main', 'skills', 'pptx'] });
    expect(parseGithubUrl('  https://github.com/a/b/tree/main/x?tab=readme#top ')).toEqual({ owner: 'a', repo: 'b', rest: ['main', 'x'] });
  });
  it('escape phần trăm hỏng không làm ném lỗi, trả null', () => {
    expect(() => parseGithubUrl('github.com/owner/repo%')).not.toThrow();
    expect(parseGithubUrl('github.com/owner/repo%')).toBeNull();
    expect(parseGithubUrl('https://github.com/a/b/tree/main/x%E0%A4%A')).toBeNull();
  });
  it('không phải GitHub hoặc thiếu repo thì trả null', () => {
    for (const u of ['https://gitlab.com/a/b', 'github.com/a', '', 'not a url', 'https://github.com.evil.com/a/b', 'https://github.com//b']) {
      expect(parseGithubUrl(u)).toBeNull();
    }
  });
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (o: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const tree = (entries: { path: string; size?: number }[], extra: Record<string, unknown> = {}) =>
  json({ tree: entries.map((e) => ({ path: e.path, type: 'blob', size: e.size ?? 3 })), truncated: false, ...extra });

function mk(handler: Handler) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return handler(url, init);
  }) as typeof fetch;
  return { f, calls };
}
const T = { owner: 'o', repo: 'r' };
const opts = (f: typeof fetch, more: object = {}) => ({ fetch: f, retryDelayMs: 0, ...more });

describe('fetchGithub', () => {
  it('gốc repo dùng HEAD và đọc file văn bản; ảnh và file quá lớn chỉ được liệt kê, không tải', async () => {
    const { f, calls } = mk((u) => {
      if (u.includes('/git/trees/HEAD')) return tree([{ path: 'a/SKILL.md' }, { path: 'a/logo.png', size: 10 }, { path: 'a/big.md', size: 600 * 1024 }, { path: 'LICENSE' }]);
      return new Response('hello');
    });
    const v = await fetchGithub({ ...T, rest: [] }, opts(f));
    expect(v.get('a/SKILL.md')).toEqual({ path: 'a/SKILL.md', size: 3, binary: false, text: 'hello' });
    expect(v.get('LICENSE')?.text).toBe('hello');
    expect(v.get('a/logo.png')).toEqual({ path: 'a/logo.png', size: 10, binary: true });
    expect(v.get('a/big.md')).toEqual({ path: 'a/big.md', size: 600 * 1024, binary: true });
    expect(calls.filter((c) => c.includes('raw.githubusercontent.com'))).toHaveLength(2);
    expect(calls[0]).toBe('https://api.github.com/repos/o/r/git/trees/HEAD?recursive=1');
  });

  it('đường dẫn đích: xin riêng cây của thư mục con (không liệt kê cả repo); Vfs tính từ thư mục cha của đích', async () => {
    const { f, calls } = mk((u) => {
      if (u.includes('/git/trees/main%3Askills%2Fpptx?')) return tree([{ path: 'SKILL.md' }, { path: 'scripts/x.py' }]);
      return new Response('t');
    });
    const v = await fetchGithub({ ...T, rest: ['main', 'skills', 'pptx'] }, opts(f));
    expect([...v.keys()].sort()).toEqual(['pptx/SKILL.md', 'pptx/scripts/x.py']);
    expect(calls.filter((c) => c.includes('/git/trees/'))).toEqual(['https://api.github.com/repos/o/r/git/trees/main%3Askills%2Fpptx?recursive=1']);
    expect(calls.some((c) => c.endsWith('/o/r/main/skills/pptx/SKILL.md'))).toBe(true);
    expect(calls.some((c) => c.endsWith('/o/r/main/skills/pptx/scripts/x.py'))).toBe(true);
  });

  it('ref có dấu / được tìm bằng cách thử ghép thêm đoạn khi 404', async () => {
    const { f, calls } = mk((u) => {
      if (u.includes('/git/trees/feature%3Ax%2Fskills%2Fa?')) return new Response('{}', { status: 404 });
      if (u.includes('/git/trees/feature%2Fx%3Askills%2Fa?')) return tree([{ path: 'SKILL.md' }]);
      return new Response('t');
    });
    const v = await fetchGithub({ ...T, rest: ['feature', 'x', 'skills', 'a'] }, opts(f));
    expect([...v.keys()]).toEqual(['a/SKILL.md']);
    expect(calls.some((c) => c.endsWith('/o/r/feature/x/skills/a/SKILL.md'))).toBe(true);
  });

  it('không tìm được ref nào thì ném not-found', async () => {
    const { f } = mk(() => new Response('{}', { status: 404 }));
    await expect(fetchGithub({ ...T, rest: ['nope', 'a'] }, opts(f))).rejects.toMatchObject({ code: 'not-found' });
  });

  it('403 hết lượt trả rate-limited kèm giờ reset', async () => {
    const { f } = mk(() => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1700000000' } }));
    const err = await fetchGithub({ ...T, rest: [] }, opts(f)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err).toMatchObject({ code: 'rate-limited', resetAt: 1_700_000_000_000 });
  });

  it('403 mà còn lượt (repo bị chặn, không phải hết lượt) thì không báo rate-limited', async () => {
    const { f } = mk(() => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': '1700000000' } }));
    const err = await fetchGithub({ ...T, rest: [] }, opts(f)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).code).toBe('not-found');
  });

  it('429 hoặc có retry-after vẫn là rate-limited', async () => {
    const a = mk(() => new Response('{}', { status: 429 }));
    await expect(fetchGithub({ ...T, rest: [] }, opts(a.f))).rejects.toMatchObject({ code: 'rate-limited' });
    const b = mk(() => new Response('{}', { status: 403, headers: { 'retry-after': '30' } }));
    await expect(fetchGithub({ ...T, rest: [] }, opts(b.f))).rejects.toMatchObject({ code: 'rate-limited' });
  });

  it('cây bị cắt (truncated) hoặc quá nhiều mục thì ném too-large', async () => {
    const a = mk(() => tree([{ path: 'a.md' }], { truncated: true }));
    await expect(fetchGithub({ ...T, rest: [] }, opts(a.f))).rejects.toMatchObject({ code: 'too-large' });
    const many = Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.md` }));
    const b = mk(() => tree(many));
    await expect(fetchGithub({ ...T, rest: [] }, opts(b.f, { limits: { maxEntries: 10 } }))).rejects.toMatchObject({ code: 'too-large' });
  });

  it('lỗi 5xx được thử lại; vẫn lỗi thì đánh dấu không đọc và nhập tiếp', async () => {
    let flaky = 0;
    const { f } = mk((u) => {
      if (u.includes('/git/trees/')) return tree([{ path: 'ok.md' }, { path: 'flaky.md' }, { path: 'dead.md' }]);
      if (u.endsWith('/ok.md')) return new Response('ok');
      if (u.endsWith('/flaky.md')) return ++flaky < 2 ? new Response('', { status: 501 }) : new Response('later');
      return new Response('', { status: 501 });
    });
    const v = await fetchGithub({ ...T, rest: [] }, opts(f));
    expect(v.get('ok.md')?.text).toBe('ok');
    expect(v.get('flaky.md')?.text).toBe('later');
    expect(v.get('dead.md')).toEqual({ path: 'dead.md', size: 3, binary: true });
  });

  it('file rỗng (size 0) không bị tải: raw.githubusercontent trả 501 cho chúng', async () => {
    const hits: string[] = [];
    const { f } = mk((u) => {
      if (u.includes('/git/trees/')) return tree([{ path: 'ok.md' }, { path: 'pkg/__init__.py', size: 0 }]);
      hits.push(u);
      return u.endsWith('/__init__.py') ? new Response('', { status: 501 }) : new Response('ok');
    });
    const v = await fetchGithub({ ...T, rest: [] }, opts(f));
    expect(v.get('pkg/__init__.py')).toEqual({ path: 'pkg/__init__.py', size: 0, binary: false, text: '' });
    expect(hits.some((u) => u.includes('__init__'))).toBe(false);
  });

  it('báo tiến trình: phase tree rồi phase files tăng dần tới tổng', async () => {
    const { f } = mk((u) => (u.includes('/git/trees/') ? tree([{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }]) : new Response('xyz')));
    const seen: { phase: string; done: number; total: number }[] = [];
    await fetchGithub({ ...T, rest: [] }, opts(f, { onProgress: (p: { phase: string; done: number; total: number }) => seen.push({ phase: p.phase, done: p.done, total: p.total }) }));
    expect(seen[0]).toMatchObject({ phase: 'tree' });
    const files = seen.filter((s) => s.phase === 'files');
    expect(files.at(-1)).toEqual({ phase: 'files', done: 3, total: 3 });
    expect(files.map((s) => s.done)).toEqual([...files.map((s) => s.done)].sort((a, b) => a - b));
  });

  it('huỷ bằng AbortSignal thì dừng và từ chối bằng AbortError', async () => {
    const ctl = new AbortController();
    let raw = 0;
    const { f } = mk((u) => {
      if (u.includes('/git/trees/')) return tree(Array.from({ length: 50 }, (_, i) => ({ path: `f${i}.md` })));
      if (++raw === 3) ctl.abort();
      return new Response('x');
    });
    const err = await fetchGithub({ ...T, rest: [] }, opts(f, { signal: ctl.signal })).catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
    expect(raw).toBeLessThan(20);
  });

  it('lỗi mạng khi lấy cây thì ném network', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await expect(fetchGithub({ ...T, rest: [] }, opts(f))).rejects.toMatchObject({ code: 'network' });
  });
});
