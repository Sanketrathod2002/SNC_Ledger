import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    // Relative base path so dist/ deploys cleanly to any GitHub Pages repository subpath
    // (https://<username>.github.io/<repo>/) as well as root hosting.
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
        manifest: {
          id: './',
          name: 'M/S Parag Sureshrao Chaware (HUF)',
          short_name: 'SNC Ledger',
          description: 'Suresh Namdeorao Chaware — Wholesale Vegetables Merchant. Offline customer ledger with vegetable-wise bills and Google Sheets + Drive sync.',
          theme_color: '#061a0e',
          background_color: '#061a0e',
          display: 'standalone',
          orientation: 'any',
          categories: ['business', 'finance'],
          prefer_related_applications: false,
          start_url: './',
          scope: './',
          icons: [
            {
              src: './icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // Ignore large uploaded user reference assets in public/assets/aistudio during precaching
          globIgnores: ['assets/aistudio/**'],
          // Strictly bypass Apps Script / Google API URLs so unique JSONP callbacks never bloat Cache Storage
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/script\.google\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/script\.googleusercontent\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          // Never publish chat-uploaded CSVs/screenshots from public/assets/aistudio to dist/
          const leakedAttachmentsDir = path.resolve(distDir, 'assets/aistudio');
          if (fs.existsSync(leakedAttachmentsDir)) {
            fs.rmSync(leakedAttachmentsDir, {recursive: true, force: true});
          }
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
