import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4321', trace: 'off', serviceWorkers: 'block' }, // SW của studio (PWA) không được cache trang giữa các test; PWA kiểm riêng
  // Đặt E2E_BASE_URL để chạy thẳng vào bản đã deploy, khi đó không cần server local.
  ...(process.env['E2E_BASE_URL'] ? {} : { webServer: { command: 'pnpm preview', url: 'http://localhost:4321', reuseExistingServer: true, timeout: 60_000 } }),
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /mobile\.spec\.ts/ },
    // WebKit (Safari Mac/iPhone) và Firefox chạy đủ bộ; test chỉ hợp Chromium tự skip kèm lý do.
    // WebKit chỉ bật khi đặt E2E_WEBKIT=1 (cần `pnpm exec playwright install webkit`, trên Linux thêm `install-deps webkit`).
    ...(process.env['E2E_WEBKIT'] ? [{ name: 'webkit', use: { browserName: 'webkit' as const }, testIgnore: /mobile\.spec\.ts/ }] : []),
    // Firefox chỉ bật khi đặt E2E_FIREFOX=1; tải trình duyệt riêng vào thư mục tạm: PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-ff npx playwright install firefox
    ...(process.env['E2E_FIREFOX'] ? [{ name: 'firefox', use: { browserName: 'firefox' as const }, testIgnore: /mobile\.spec\.ts/ }] : []),
    // Điện thoại giả lập (mục 12), chỉ chạy e2e/mobile.spec.ts. Không thay cho thử trên máy thật.
    ...(process.env['E2E_MOBILE'] ? [
      { name: 'iphone', testMatch: /mobile\.spec\.ts/, use: { browserName: 'webkit' as const, viewport: { width: 393, height: 659 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } },
      { name: 'pixel', testMatch: /mobile\.spec\.ts/, use: { browserName: 'chromium' as const, viewport: { width: 412, height: 839 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' } },
    ] : []),
  ],
});
