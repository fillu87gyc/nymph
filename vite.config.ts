import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { MERMAID_BUNDLE_FILE } from './src/htmlExport.ts';
import { normalizeFrontendUrl } from './src/frontendUrl.ts';

/**
 * mermaid の自己完結バンドルを `dist/` へ置く。
 *
 * HTML エクスポート（`--export --export-mermaid`）が生成物へ丸ごと焼き込む
 * ための「1 ファイルで完結した mermaid」。アプリ本体のビルド成果物からは
 * 取り出せない（本体は図の種類ごとに動的 import でチャンク分割される）ので、
 * mermaid が自分で配っている UMD ビルドをそのまま複製する。
 *
 * mermaid は devDependency のまま。公開パッケージには node_modules ではなく
 * この `dist/` 経由で届く（`package.json` の files に dist が入っている）。
 */
function copyMermaidBundle(): Plugin {
  return {
    name: 'nymph-copy-mermaid-bundle',
    apply: 'build',
    closeBundle() {
      const require = createRequire(import.meta.url);
      const src = require.resolve('mermaid/dist/mermaid.min.js');
      copyFileSync(src, join('dist', MERMAID_BUNDLE_FILE));
    },
  };
}

const backendOrigin = `http://localhost:${process.env.NYMPH_PORT ?? '6276'}`;

// dev では CLI が NYMPH_FRONTEND_URL（= この dev server の URL）を案内する。
// 実際の待受ポートがそれとズレると案内が嘘になるので、指定があれば
// strictPort で固定し、埋まっていれば黙って別ポートに逃げず失敗させる。
const advertisedFrontend = normalizeFrontendUrl(process.env.NYMPH_FRONTEND_URL);
const advertisedPort = advertisedFrontend
  ? Number(new URL(advertisedFrontend).port || 80)
  : null;

export default defineConfig({
  plugins: [react(), copyMermaidBundle()],
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
      '/image': backendOrigin,
      '/diff': backendOrigin,
      '/export': backendOrigin,
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
