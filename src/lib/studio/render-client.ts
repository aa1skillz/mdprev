import type { FrontMatter } from './pipeline';
import type { VaultCtx } from '../vault/preview';

export interface Rendered { html: string; fm: FrontMatter | null }
interface Reply { id: number; ok: boolean; html?: string; fm?: FrontMatter | null }
interface Job { src: string; vault: VaultCtx | undefined; resolve: (r: Rendered) => void; reject: (e: unknown) => void }

/** Một lần dựng quá lâu (worker treo hoặc chết) thì bỏ worker đó, để bản xem không đứng im mãi. */
const RENDER_TIMEOUT_MS = 15_000;
const MAX_WORKER_FAILURES = 2;

let worker: Worker | null | undefined;
let failures = 0;
let nextId = 0;
let current: { id: number; job: Job } | null = null; // việc đang chạy ở worker
let queued: Job | null = null;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let everOk = false; // worker đã trả kết quả ít nhất một lần
let sentKey = ''; // khoá ngữ cảnh vault mà worker hiện tại đang giữ

function drop(err: unknown) {
  clearTimeout(watchdog);
  const c = current;
  current = null;
  try { if (worker) worker.terminate(); } catch { /* bỏ qua */ }
  failures++;
  worker = failures >= MAX_WORKER_FAILURES ? null : undefined; // quá nhiều lần hỏng: dựng thẳng ở luồng chính
  c?.job.reject(err);
  pump();
}

function get(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Reply>) => {
      if (!current || current.id !== e.data.id) return;
      clearTimeout(watchdog);
      everOk = true;
      const { job } = current;
      current = null;
      if (e.data.ok) job.resolve({ html: e.data.html ?? '', fm: e.data.fm ?? null }); else job.reject(new Error('render failed'));
      pump();
    };
    w.onerror = (e) => {
      e.preventDefault();
      // worker chưa từng chạy được (không nạp được script, ví dụ offline mà service worker không điều khiển worker): dựng ở luồng chính ngay, không bắt chờ
      if (!everOk && current) { clearTimeout(watchdog); const { job } = current; current = null; try { w.terminate(); } catch { /* bỏ qua */ } worker = null; if (queued) job.reject(new Error('superseded')); else queued = job; pump(); return; }
      drop(new Error('render worker crashed'));
    };
    worker = w;
    sentKey = '';
  } catch { worker = null; }
  return worker;
}

function pump() {
  if (current || !queued) return;
  const job = queued;
  queued = null;
  const w = get();
  if (!w) { void import('./pipeline').then((m) => m.renderMarkdown(job.src, job.vault)).then(job.resolve, job.reject); return; }
  const id = ++nextId;
  current = { id, job };
  watchdog = setTimeout(() => { if (current?.id === id) drop(new Error('render timed out')); }, RENDER_TIMEOUT_MS);
  const v = job.vault;
  w.postMessage(v ? { id, src: job.src, vk: v.key, ...(v.key === sentKey ? {} : { vctx: v }) } : { id, src: job.src });
  if (v) sentKey = v.key;
}

/** Dựng ở worker. Worker đang bận mà có yêu cầu mới thì chỉ giữ yêu cầu mới nhất (yêu cầu bị thay bị từ chối, người gọi vốn đã bỏ kết quả lỗi thời). Không có Worker thì dựng thẳng. */
export function renderInWorker(src: string, vault?: VaultCtx): Promise<Rendered> {
  return new Promise((resolve, reject) => {
    if (queued) queued.reject(new Error('superseded'));
    queued = { src, vault, resolve, reject };
    pump();
  });
}
