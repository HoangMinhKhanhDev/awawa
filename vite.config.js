import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-180.png'],
      manifest: {
        name: 'Ôn luyện HSG THPT',
        short_name: 'Ôn luyện HSG',
        description: 'Ôn luyện học sinh giỏi THPT: ngân hàng câu hỏi, luyện chuyên đề, thi thử bấm giờ.',
        lang: 'vi',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1e56d6',
        background_color: '#f1f4f8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // Bật service worker cả ở dev để test cài PWA qua tunnel ngrok https
      devOptions: { enabled: true, type: 'module' },
      workbox: {
        // Offline: app shell + bài học/nội dung học (GET only).
        // POST submit/draft/grade luôn network — không cache.
        runtimeCaching: [
          {
            // Danh mục học: môn / chuyên đề / câu hỏi / bài học / học liệu / bài tập (GET)
            urlPattern: ({ url }) =>
              /^\/(api\/)?(subjects|topics|questions|lessons|materials|assignments)(\/|$)/.test(url.pathname) ||
              url.pathname.includes('/lessons') ||
              url.pathname.includes('/materials'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lessons-cache',
              expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 },
              networkTimeoutSeconds: 4,
            },
          },
          {
            // Progress / stats nhẹ — hiển thị được offline
            urlPattern: ({ url }) =>
              url.pathname.includes('/me/progress') ||
              url.pathname.includes('/stats/overview') ||
              url.pathname.includes('/notifications'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'progress-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 3600 },
              networkTimeoutSeconds: 4,
            },
          },
        ],
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true,
    // Cho phép truy cập qua domain ngrok khi test (chỉ dùng thử nghiệm)
    allowedHosts: true,
    // API đi cùng-origin /api -> 1 tunnel ngrok duy nhất phục vụ cả web + API,
    // không bị chặn mixed-content khi web chạy https
    proxy: {
      '/api': { target: 'http://127.0.0.1:8765', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
