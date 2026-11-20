/// <reference lib="webworker" />
/** Dựng Markdown thành HTML ngoài luồng chính: tài liệu lớn mất vài trăm mili giây, không được chặn việc gõ. */
import { renderMarkdown } from './pipeline';
import type { VaultCtx } from '../vault/preview';

let vault: VaultCtx | undefined; // ngữ cảnh vault gửi một lần theo khoá, không gửi lại mỗi lần gõ

self.onmessage = async (e: MessageEvent<{ id: number; src: string; vk?: string; vctx?: VaultCtx }>) => {
  const { id, src, vk, vctx } = e.data;
  if (vctx) vault = vctx;
  try {
    const r = await renderMarkdown(src, vk && vault?.key === vk ? vault : undefined);
    self.postMessage({ id, ok: true, html: r.html, fm: r.fm });
  } catch (err) {
    console.error('render failed', err);
    self.postMessage({ id, ok: false });
  }
};
