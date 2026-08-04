import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { normalizeFrontendUrl } from './src/frontendUrl.ts';

const backendOrigin = `http://localhost:${process.env.NYMPH_PORT ?? '6276'}`;

// dev では CLI が NYMPH_FRONTEND_URL（= この dev server の URL）を案内する。
// 実際の待受ポートがそれとズレると案内が嘘になるので、指定があれば
// strictPort で固定し、埋まっていれば黙って別ポートに逃げず失敗させる。
const advertisedFrontend = normalizeFrontendUrl(process.env.NYMPH_FRONTEND_URL);
const advertisedPort = advertisedFrontend
  ? Number(new URL(advertisedFrontend).port || 80)
  : null;

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    ...(advertisedPort ? { port: advertisedPort, strictPort: true } : {}),
    proxy: {
      '/content': backendOrigin,
      '/comments': backendOrigin,
      '/watch': backendOrigin,
      '/files': backendOrigin,
      '/diff': backendOrigin,
      '/checkpoint': backendOrigin,
      '/active-file': backendOrigin,
      '/switch-file': backendOrigin,
      '/close-file': backendOrigin,
      '/open-file': backendOrigin,
      '/open-dir': backendOrigin,
      '/pick-file': backendOrigin,
      '/pick-dir': backendOrigin,
      '/recent': backendOrigin,
      '/search': backendOrigin,
      '/link-check': backendOrigin,
      '/tree': backendOrigin,
      '/bookmarks': backendOrigin,
      '/edit-op': backendOrigin,
      '/version': backendOrigin,
    },
  },
});
