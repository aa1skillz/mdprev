/**
 * Gọi một Web Worker như hàm bất đồng bộ, dùng cho các công cụ có việc nặng (diff, JSON).
 * - "Bản mới nhất thắng": worker đang bận thì chỉ giữ yêu cầu mới nhất, yêu cầu bị thay trả về `superseded`.
 * - Hạn chót: quá hạn thì ngắt worker (không có cách dừng một tác vụ đang chạy), trả `timeout`, lần gọi sau tạo worker mới.
 * - Không có Worker thì chạy thẳng bằng `fallback`.
 */
export type RpcOut<Res> = { kind: 'ok'; res: Res } | { kind: 'timeout' } | { kind: 'superseded' } | { kind: 'error'; message: string };

interface Job<Req, Res> { req: Req; resolve: (o: RpcOut<Res>) => void }

export function workerRpc<Req, Res>(make: () => Worker, timeoutMs: number, fallback: (r: Req) => Promise<Res>) {
  let worker: Worker | null | undefined;
  let nextId = 0;
  let inflight: { id: number; job: Job<Req, Res>; timer: number } | null = null;
  let queued: Job<Req, Res> | null = null;

  const get = (): Worker | null => {
    if (worker !== undefined) return worker;
    try {
      const w = make();
      w.onmessage = (e: MessageEvent<{ id: number; res?: Res; error?: string }>) => {
        if (!inflight || inflight.id !== e.data.id) return;
        clearTimeout(inflight.timer);
        const j = inflight.job;
        inflight = null;
        j.resolve(e.data.error !== undefined ? { kind: 'error', message: e.data.error } : { kind: 'ok', res: e.data.res as Res });
        pump();
      };
      // Worker không nạp được hoặc ném lỗi: bỏ nó, và trả lời yêu cầu đang chờ bằng đường dự phòng (không để treo tới hết hạn).
      w.onerror = () => {
        worker = null;
        if (inflight) {
          clearTimeout(inflight.timer);
          const j = inflight.job;
          inflight = null;
          void fallback(j.req).then((res) => j.resolve({ kind: 'ok', res }), (e: unknown) => j.resolve({ kind: 'error', message: String((e as Error).message ?? e) }));
        }
        pump();
      };
      worker = w;
    } catch { worker = null; }
    return worker;
  };

  const pump = (): void => {
    if (inflight || !queued) return;
    const job = queued;
    queued = null;
    const w = get();
    if (!w) { void fallback(job.req).then((res) => job.resolve({ kind: 'ok', res }), (e: unknown) => job.resolve({ kind: 'error', message: String((e as Error).message ?? e) })); return; }
    const id = ++nextId;
    inflight = {
      id, job,
      timer: window.setTimeout(() => {
        w.terminate(); worker = undefined;
        const j = inflight?.job; inflight = null;
        j?.resolve({ kind: 'timeout' });
        pump();
      }, timeoutMs),
    };
    try {
      w.postMessage({ id, req: job.req });
    } catch (err) {
      // Không gửi được (ví dụ dữ liệu không nhân bản được): bỏ yêu cầu khỏi hàng chờ, dùng đường dự phòng, không kẹt các lần gọi sau.
      clearTimeout(inflight.timer);
      inflight = null;
      void fallback(job.req).then((res) => job.resolve({ kind: 'ok', res }), (e: unknown) => job.resolve({ kind: 'error', message: String((e as Error).message ?? e ?? err) }));
      pump();
    }
  };

  return {
    call(req: Req): Promise<RpcOut<Res>> {
      return new Promise((resolve) => {
        if (queued) queued.resolve({ kind: 'superseded' });
        queued = { req, resolve };
        pump();
      });
    },
  };
}

/** Phía worker: nhận { id, req }, trả { id, res } hoặc { id, error }. */
export function serve<Req, Res>(handle: (r: Req) => Res): (e: MessageEvent<{ id: number; req: Req }>) => void {
  return (e) => {
    try { (self as unknown as Worker).postMessage({ id: e.data.id, res: handle(e.data.req) }); } catch (err) { (self as unknown as Worker).postMessage({ id: e.data.id, error: String((err as Error).message ?? err) }); }
  };
}
