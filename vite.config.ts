import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/content':     'http://localhost:6276',
      '/comments':    'http://localhost:6276',
      '/watch':       'http://localhost:6276',
      '/files':       'http://localhost:6276',
      '/diff':        'http://localhost:6276',
      '/checkpoint':  'http://localhost:6276',
      '/active-file': 'http://localhost:6276',
      '/switch-file': 'http://localhost:6276',
      '/close-file':  'http://localhost:6276',
      '/edit-op':     'http://localhost:6276',
    },
  },
});
