import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],   // PNGs (icons/, branding/) are precached by globPatterns
      manifest: {
        name: 'Qritiko — Science Fair Judging',
        short_name: 'Qritiko',
        description: 'Multi-school digital judging platform for science fairs',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          // The platform's own mark. One origin serves every school, so the installed app icon can
          // never be a school's logo (it was Dishchii'bikoh's wildcat for everyone until 2026-10l).
          { src: 'icons/qritiko-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/qritiko-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/qritiko-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB — the app bundle; images are small now
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // Schools' uploaded logos / posters (Supabase Storage). Every upload gets a NEW file name,
          // so a cached copy is never stale — CacheFirst is safe and keeps the landing page
          // branded when an installed app opens offline.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/storage/v1/object/public/school-branding/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'school-branding',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
