import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

const site = process.env['SITE_URL'] ?? 'https://mdprev.space';
const rawBase = process.env['BASE_PATH'] ?? '/';
const trimmed = rawBase.replace(/^\/+|\/+$/g, '');
const base = trimmed ? '/' + trimmed : '/';

/**
 * `decode-named-character-reference` có bản dành cho trình duyệt dùng `document.createElement`; Web Worker không có DOM.
 * Trong bundle của worker dựng Markdown, trỏ nó về bản không cần DOM (cùng package, file index.js).
 */
interface PluginCtx { resolve(id: string, importer: string | undefined, o: object): Promise<{ id: string } | null> }
function workerNoDom() {
  return {
    name: 'worker-no-dom-entity-decode',
    enforce: 'pre' as const,
    async resolveId(this: PluginCtx, id: string, importer: string | undefined, opts: object) {
      if (id !== 'decode-named-character-reference') return null;
      const r = await this.resolve(id, importer, { ...opts, skipSelf: true });
      return r ? r.id.replace(/index\.dom\.js$/, 'index.js') : null;
    },
  };
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Worker dựng Markdown cần định dạng ES để tách chunk (Shiki nạp ngôn ngữ theo nhu cầu).
  // Chunk Mermaid lớn nhưng chỉ tải khi tài liệu có khối ```mermaid.
  vite: { build: { chunkSizeWarningLimit: 2000 }, worker: { format: 'es', plugins: () => [workerNoDom()] } },
  integrations: [preact()],
});
