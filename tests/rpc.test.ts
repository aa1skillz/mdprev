import { beforeEach, describe, expect, it } from 'vitest';
import { workerRpc } from '../src/lib/rpc';

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() { FakeWorker.last = this; }
  postMessage(): void { /* không trả lời: mô phỏng worker không bao giờ chạy */ }
  terminate(): void { /* bỏ qua */ }
}
beforeEach(() => { (globalThis as unknown as { window: unknown }).window = globalThis; });

class ThrowingWorker extends FakeWorker {
  override postMessage(): void { throw new DOMException('could not be cloned', 'DataCloneError'); }
}

describe('workerRpc: postMessage ném lỗi đồng bộ', () => {
  it('không kẹt: trả bằng đường dự phòng và các lần gọi sau không bị chặn', async () => {
    const rpc = workerRpc<number, number>(() => new ThrowingWorker() as unknown as Worker, 60_000, async (n) => n * 3);
    expect(await rpc.call(2)).toEqual({ kind: 'ok', res: 6 });
    expect(await rpc.call(3)).toEqual({ kind: 'ok', res: 9 });
  });
});

describe('workerRpc: worker không tải được', () => {
  it('yêu cầu đang chờ được trả bằng đường dự phòng, không treo tới hết hạn', async () => {
    const rpc = workerRpc<number, number>(() => new FakeWorker() as unknown as Worker, 60_000, async (n) => n * 2);
    const p = rpc.call(21);
    FakeWorker.last.onerror?.(new Event('error'));
    expect(await p).toEqual({ kind: 'ok', res: 42 });
  });

  it('các lần gọi sau cũng dùng đường dự phòng', async () => {
    const rpc = workerRpc<number, number>(() => new FakeWorker() as unknown as Worker, 60_000, async (n) => n + 1);
    const first = rpc.call(1);
    FakeWorker.last.onerror?.(new Event('error'));
    await first;
    expect(await rpc.call(5)).toEqual({ kind: 'ok', res: 6 });
  });

  it('đường dự phòng ném lỗi thì trả kind error', async () => {
    const rpc = workerRpc<number, number>(() => new FakeWorker() as unknown as Worker, 60_000, async () => { throw new Error('boom'); });
    const p = rpc.call(1);
    FakeWorker.last.onerror?.(new Event('error'));
    expect(await p).toEqual({ kind: 'error', message: 'boom' });
  });
});
