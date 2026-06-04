import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', '**/node_modules/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      include: ['src/client/lib/**', 'src/client/hooks/**'],
      exclude: ['src/client/hooks/useSSE.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
