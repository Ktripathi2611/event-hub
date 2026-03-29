import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt'],
        manifest: {
          name: 'EventHub',
          short_name: 'EventHub',
          description: 'Campus event discovery and ticketing platform',
          start_url: '/',
          display: 'standalone',
          background_color: '#050505',
          theme_color: '#10b981',
          icons: [
            {
              src: '/icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
            },
            {
              src: '/icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico,json}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/images\.unsplash\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'eventhub-external-images',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
              },
            },
            {
              urlPattern: /\/api\/bookings\/user\//,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'eventhub-bookings',
                networkTimeoutSeconds: 2,
              },
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Hot Module Replacement (HMR) configuration.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
