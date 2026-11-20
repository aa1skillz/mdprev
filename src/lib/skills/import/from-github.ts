import { DEFAULT_LIMITS, ImportError, type Limits, type Vfs } from '../types';

/**
 * Nhập từ GitHub không cần đăng nhập, ngay trong trình duyệt:
 * 1 lượt `api.github.com/.../git/trees/<ref>?recursive=1` liệt kê file, rồi đọc từng file văn bản qua
 * `raw.githubusercontent.com` (cả hai có CORS `*`). Không dùng zip của `codeload` (không có CORS).
 */
export interface GithubTarget { owner: string; repo: string; rest: string[] }
export interface Progress { phase: 'tree' | 'files'; done: number; total: number; bytes: number }
export interface FetchOpts {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  limits?: Partial<Limits>;
  /** Chờ giữa các lần thử lại (ms). Mặc định 300, có thêm nhiễu ngẫu nhiên. */
  retryDelayMs?: number;
}

const NAME = /^(?!\.{1,2}$)[\w.-]+$/; // không nhận "." và ".." (fetch sẽ gộp thành đường dẫn khác trên cùng host)

export function parseGithubUrl(input: string): GithubTarget | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
  let seg: string[];
  try { seg = u.pathname.split('/').filter(Boolean).map((x) => decodeURIComponent(x)); } catch { return null; }
  if (seg.length < 2) return null;
  const owner = seg[0] as string;
  const repo = (seg[1] as string).replace(/\.git$/, '');
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  let rest: string[] = [];
  const kind = seg[2];
  if (kind === 'tree' || kind === 'blob') {
    rest = seg.slice(3);
    if (kind === 'blob') rest = rest.slice(0, -1); // đích là thư mục chứa file
  }
  return { owner, repo, rest };
}

const TEXT = /\.(md|markdown|txt|py|sh|bash|js|mjs|cjs|ts|tsx|json|ya?ml|html|css|xml|toml|csv|ini|cfg|rst|xsd|xsl|xslt|dtd)$|(^|\/)(LICENSE|NOTICE|README|Dockerfile|Makefile)[^/.]*$/i;
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
const encodePath = (p: string): string => p.split('/').map(encodeURIComponent).join('/');

interface TreeEntry { path: string; type: string; size?: number }

export async function fetchGithub(t: GithubTarget, opts: FetchOpts = {}): Promise<Vfs> {
  const f = opts.fetch ?? fetch;
  const lim: Limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const signal = opts.signal;
  const base = `https://api.github.com/repos/${t.owner}/${t.repo}/git/trees/`;
  /** `ref:đường-dẫn` cho API lấy riêng cây của một thư mục con (đã kiểm: trả 404 nếu sai), nên repo lớn không bị "truncated". */
  const treeUrl = (s: { ref: string; path: string }): string => `${base}${encodeURIComponent(s.path ? `${s.ref}:${s.path}` : s.ref)}?recursive=1`;

  // ---- 1. liệt kê file; thử các cách tách ref/đường dẫn (ref có thể chứa dấu /) ----
  const splits: { ref: string; path: string }[] = t.rest.length === 0
    ? [{ ref: 'HEAD', path: '' }]
    : Array.from({ length: Math.min(3, t.rest.length) }, (_, i) => ({ ref: t.rest.slice(0, i + 1).join('/'), path: t.rest.slice(i + 1).join('/') }));

  let entries: TreeEntry[] | null = null;
  let chosen = splits[0] as { ref: string; path: string };
  for (const s of splits) {
    let res: Response;
    try {
      res = await f(treeUrl(s), signal ? { signal } : {});
    } catch (e) {
      if (isAbort(e)) throw e;
      throw new ImportError('network', 'Could not reach GitHub.');
    }
    if (res.status === 404) continue;
    if (res.status === 403 || res.status === 429) {
      const retry = Number(res.headers.get('retry-after'));
      // Chỉ là hết lượt khi GitHub nói vậy; 403 khác (repo bị chặn...) thử lại cũng không được.
      if (res.status === 429 || res.headers.get('x-ratelimit-remaining') === '0' || retry > 0) {
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const resetAt = reset > 0 ? reset * 1000 : retry > 0 ? Date.now() + retry * 1000 : undefined;
        throw new ImportError('rate-limited', 'GitHub is limiting anonymous requests.', resetAt);
      }
      throw new ImportError('not-found', 'GitHub would not show that repository (it may be private or blocked).');
    }
    if (!res.ok) throw new ImportError('network', `GitHub answered ${res.status}.`);
    const body = (await res.json()) as { tree?: TreeEntry[]; truncated?: boolean };
    if (body.truncated) throw new ImportError('too-large', 'This repository is too large to list at once.');
    entries = body.tree ?? [];
    chosen = s;
    break;
  }
  if (!entries) throw new ImportError('not-found', 'Could not find that repository, branch or folder.');

  // Cây của thư mục con có đường dẫn tương đối với thư mục đó: ghép lại thành đường dẫn đầy đủ trong repo.
  const prefix = chosen.path === '' ? '' : chosen.path + '/';
  const parent = chosen.path.includes('/') ? chosen.path.slice(0, chosen.path.lastIndexOf('/') + 1) : '';
  const files = entries.filter((e) => e.type === 'blob').map((e) => ({ ...e, path: prefix + e.path }));
  if (files.length > lim.maxEntries) throw new ImportError('too-large', `More than ${lim.maxEntries} files.`);
  const rel = (p: string): string => p.slice(parent.length);

  const vfs: Vfs = new Map();
  const toRead: TreeEntry[] = [];
  for (const e of files) {
    const size = e.size ?? 0;
    if (TEXT.test(e.path) && size <= lim.maxFileBytes) toRead.push(e);
    else vfs.set(rel(e.path), { path: rel(e.path), size, binary: true });
  }
  if (toRead.reduce((n, e) => n + (e.size ?? 0), 0) > lim.maxTotalBytes) throw new ImportError('too-large', 'There is too much text to read.');
  opts.onProgress?.({ phase: 'tree', done: files.length, total: files.length, bytes: 0 });

  // ---- 2. đọc file văn bản, song song 5 (8 làm raw.githubusercontent trả 501 thoảng qua khi quét cả collection), thử lại khi lỗi thoảng qua ----
  const rawBase = `https://raw.githubusercontent.com/${t.owner}/${t.repo}/${encodePath(chosen.ref)}/`;
  const delay = opts.retryDelayMs ?? 300;
  let done = 0;
  let bytes = 0;
  let next = 0;

  const read = async (e: TreeEntry): Promise<void> => {
    const p = rel(e.path);
    const notRead = (): void => { vfs.set(p, { path: p, size: e.size ?? 0, binary: true }); };
    if (e.size === 0) { vfs.set(p, { path: p, size: 0, binary: false, text: '' }); return; } // raw.githubusercontent trả 501 (có tính xác định) cho file rỗng như __init__.py: không cần hỏi, nội dung là chuỗi rỗng
    for (let attempt = 0; attempt < 4; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const res = await f(rawBase + encodePath(e.path), signal ? { signal } : {});
        if (res.ok) {
          const text = await res.text();
          if (text.includes('\u0000')) notRead();
          else { vfs.set(p, { path: p, size: e.size ?? text.length, binary: false, text }); bytes += text.length; }
          return;
        }
        if (res.status === 404 || (res.status < 500 && res.status !== 429)) return notRead();
      } catch (err) {
        if (isAbort(err)) throw err;
      }
      if (attempt < 3) await sleep(delay * (attempt + 1) + Math.random() * delay, signal);
    }
    notRead();
  };

  const worker = async (): Promise<void> => {
    while (next < toRead.length) {
      const e = toRead[next++] as TreeEntry;
      await read(e);
      done++;
      opts.onProgress?.({ phase: 'files', done, total: toRead.length, bytes });
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, toRead.length) }, worker));
  return vfs;
}
