/// <reference lib="webworker" />
/** Chạy regex ngoài luồng chính: một mẫu backtracking thảm hoạ có thể chạy hàng giây; luồng chính sẽ ngắt worker nếu quá hạn. */
import { runCases } from './cases';
import type { Req } from './regex-client';
import { runRegex } from './run';

self.onmessage = (e: MessageEvent<{ id: number; req: Req }>) => {
  const { id, req } = e.data;
  self.postMessage({ id, res: req.kind === 'run' ? runRegex(req.p, req.f, req.t, req.r) : runCases(req.p, req.f, req.cases, req.full) });
};
