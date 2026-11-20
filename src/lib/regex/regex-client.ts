import type { Case, CasesRun } from './cases';
import type { RunResult } from './run';

export type Outcome<T> = { timedOut: true } | { timedOut: false; res: T };
export const REGEX_TIMEOUT_MS = 1000;
export type Req = { kind: 'run'; p: string; f: string; t: string; r: string } | { kind: 'cases'; p: string; f: string; cases: Case[]; full: boolean };

interface Job { id: number; req: Req; resolve: (o: Outcome<never>) => void; timer: number }
let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Job>();

function get(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL('./regex.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; res: never }>) => {
      const j = pending.get(e.data.id);
      if (!j) return;
      clearTimeout(j.timer); pending.delete(j.id);
      j.resolve({ timedOut: false, res: e.data.res });
    };
    w.onerror = () => { worker = null; };
    worker = w;
  } catch { worker = null; }
  return worker;
}

async function inline(req: Req): Promise<never> {
  if (req.kind === 'run') return (await import('./run')).runRegex(req.p, req.f, req.t, req.r) as never;
  return (await import('./cases')).runCases(req.p, req.f, req.cases, req.full) as never;
}

function post(j: Job) {
  const w = get();
  if (!w) { void inline(j.req).then((res) => { pending.delete(j.id); j.resolve({ timedOut: false, res }); }); return; }
  j.timer = window.setTimeout(() => {
    // quá hạn: ngắt worker (không có cách nào dừng một regex đang chạy), báo job này, chạy lại các job còn đợi trên worker mới
    w.terminate(); worker = undefined;
    pending.delete(j.id);
    j.resolve({ timedOut: true });
    for (const o of [...pending.values()]) { clearTimeout(o.timer); post(o); }
  }, REGEX_TIMEOUT_MS);
  w.postMessage({ id: j.id, req: j.req });
}

function submit<T>(req: Req): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    const j: Job = { id: ++nextId, req, resolve: resolve as (o: Outcome<never>) => void, timer: 0 };
    pending.set(j.id, j);
    post(j);
  });
}

/** Chạy trong worker với hạn chót 1 giây. Không có Worker thì chạy thẳng (không bảo vệ được khỏi backtracking). */
export const runInWorker = (p: string, f: string, t: string, r: string): Promise<Outcome<RunResult>> => submit({ kind: 'run', p, f, t, r });
export const runCasesInWorker = (p: string, f: string, cases: Case[], full: boolean): Promise<Outcome<CasesRun>> => submit({ kind: 'cases', p, f, cases, full });
