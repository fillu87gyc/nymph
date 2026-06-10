import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendOrigin = `http://localhost:${process.env.NYMPH_PORT ?? '6276'}`;

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
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
      '/edit-op': backendOrigin,
      '/version': backendOrigin,
    },
  },
});
