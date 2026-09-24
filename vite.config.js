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
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
  }
})
