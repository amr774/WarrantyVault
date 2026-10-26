import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'WarrantyVault',
        short_name: 'WarrantyVault',
        description: 'Your purchases, protected.',
        theme_color: '#6d4aff',
        background_color: '#f8f9fc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': { target: process.env.DEV_API_TARGET ?? 'http://localhost:3100', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          router: ['react-router-dom'],
        },
      },
    },
  },
});
