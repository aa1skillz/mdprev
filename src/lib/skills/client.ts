import { workerRpc, type RpcOut } from '../rpc';
import { inspectCollection } from './inspect';
import type { CollectionReport, Vfs } from './types';

export const INSPECT_TIMEOUT_MS = 20_000;

/** Phân tích trong worker (bản mới nhất thắng). Không có Worker thì chạy thẳng ở luồng chính. */
const rpc = workerRpc<Vfs, CollectionReport>(
  () => new Worker(new URL('./inspect.worker.ts', import.meta.url), { type: 'module' }),
  INSPECT_TIMEOUT_MS,
  async (vfs) => inspectCollection(vfs),
);

/** Đổi kết quả RPC thành giá trị hoặc lỗi có `name` để giao diện phân biệt: Superseded (bỏ qua), Timeout, InspectError. */
export function unwrapRpc<T>(out: RpcOut<T>): T {
  if (out.kind === 'ok') return out.res;
  const e = new Error(out.kind === 'error' ? out.message : out.kind === 'timeout' ? 'The analysis took too long.' : 'Replaced by a newer request.');
  e.name = out.kind === 'error' ? 'InspectError' : out.kind === 'timeout' ? 'Timeout' : 'Superseded';
  throw e;
}

export const inspectVfs = async (vfs: Vfs): Promise<CollectionReport> => unwrapRpc(await rpc.call(vfs));
