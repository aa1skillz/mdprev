/**
 * Các trang CÔNG KHAI cho phép lập chỉ mục: nguồn của sitemap.xml. `/app/*` là ứng dụng, giữ `noindex` và không nằm ở đây.
 * Test e2e (seo.spec.ts) đối chiếu danh sách này với các trang thật trong dist/: thêm trang mới mà quên ghi vào đây sẽ báo lỗi.
 */
export interface SitePage { path: string; lastmod: string }

export const INDEXABLE: SitePage[] = [
  { path: '/', lastmod: '2026-11-17' },
  { path: '/skill-inspector/', lastmod: '2026-11-13' },
  { path: '/features/', lastmod: '2026-11-17' },
  { path: '/privacy/', lastmod: '2026-11-17' },
  { path: '/guides/', lastmod: '2026-11-17' },
  { path: '/guides/publish-a-markdown-vault-as-a-static-site/', lastmod: '2026-11-17' },
  { path: '/guides/share-a-markdown-document-with-a-password/', lastmod: '2026-11-17' },
  { path: '/guides/install-a-skill-in-claude-code/', lastmod: '2026-11-16' },
  { path: '/guides/what-is-inside-a-skill-md/', lastmod: '2026-11-13' },
  { path: '/guides/how-much-context-does-a-skill-cost/', lastmod: '2026-11-13' },
  { path: '/guides/markdown-to-pdf-word-and-slides/', lastmod: '2026-11-17' },
];
