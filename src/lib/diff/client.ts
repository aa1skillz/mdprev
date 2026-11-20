import { workerRpc } from '../rpc';
import { diffBlocks, splitLines, type DiffOpts, type DiffResult } from './engine';

export interface DiffReq { a: string; b: string; o: DiffOpts }
export const DIFF_TIMEOUT_MS = 10_000;

/** So hai văn bản trong worker (bản mới nhất thắng, quá 10 giây thì ngắt). */
export const diffRpc = workerRpc<DiffReq, DiffResult>(
  () => new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' }),
  DIFF_TIMEOUT_MS,
  async (r) => diffBlocks(splitLines(r.a), splitLines(r.b), r.o),
);
