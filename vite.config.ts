import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    license({
      thirdParty: {
        output: {
          file: 'dist/LICENSES.txt',
          template(deps) {
            return deps
              .map(
                (d) =>
                  `${d.name} ${d.version ?? ''}\nLicense: ${d.license ?? 'UNKNOWN'}\n${d.licenseText ?? ''}`.trimEnd(),
              )
              .join('\n\n---\n\n');
          },
        },
      },
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/content': 'http://localhost:6276',
      '/comments': 'http://localhost:6276',
      '/watch': 'http://localhost:6276',
      '/files': 'http://localhost:6276',
      '/diff': 'http://localhost:6276',
      '/checkpoint': 'http://localhost:6276',
      '/active-file': 'http://localhost:6276',
      '/switch-file': 'http://localhost:6276',
      '/close-file': 'http://localhost:6276',
      '/edit-op': 'http://localhost:6276',
      '/version': 'http://localhost:6276',
    },
  },
});
