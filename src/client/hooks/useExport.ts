import { useCallback } from 'react';
import { isDroppedPath } from '../../dropped.ts';
import { type ExportFormat, exportFilename } from '../lib/exportFile.ts';

export interface ExportOptions {
  /** HTML に Mermaid 描画エンジンを同梱する（CLI の `--export-mermaid` 相当）。 */
  mermaid?: boolean;
}

/** `/export` に投げるクエリ文字列を組み立てる（テストしやすいよう分けてある）。 */
export function exportUrl(
  file: string,
  format: ExportFormat,
  options: ExportOptions = {},
): string {
  const params = new URLSearchParams({ file, format });
  if (format === 'html' && options.mermaid) params.set('mermaid', '1');
  return `/export?${params}`;
}

/**
 * 開いているファイルを CLI と同じ形式で書き出し、ブラウザにダウンロードさせる。
 *
 * リンクを直接踏ませず fetch → Blob を経由するのは、失敗をこちらで拾って
 * トーストに出すため。`<a href="/export?...">` のままだとサーバーが 4xx/5xx を
 * 返したときブラウザがエラー本文をそのまま表示してしまい、レビュー中の画面を
 * 巻き添えにする。
 *
 * 保存先はブラウザに委ねる（サーバー側にファイルは残さない）。`download` 属性の
 * 名前はサーバーの `Content-Disposition` と同じ規則で付ける（`exportFile.ts`）。
 */
export function useExport(activeFile: string | null | undefined) {
  const canExport = !!activeFile && !isDroppedPath(activeFile);

  const exportDocument = useCallback(
    async (
      format: ExportFormat,
      options: ExportOptions = {},
    ): Promise<
      { ok: true; filename: string } | { ok: false; error: string }
    > => {
      if (!activeFile || isDroppedPath(activeFile)) {
        return { ok: false, error: 'エクスポートできるファイルがありません' };
      }
      let blob: Blob;
      try {
        const res = await fetch(exportUrl(activeFile, format, options));
        if (!res.ok) {
          const detail = (await res.text().catch(() => '')).trim();
          return {
            ok: false,
            error: detail || `エクスポートに失敗しました (${res.status})`,
          };
        }
        blob = await res.blob();
      } catch {
        return { ok: false, error: 'エクスポートに失敗しました' };
      }

      const filename = exportFilename(
        activeFile.split(/[/\\]/).pop() ?? '',
        format,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // revoke は少し遅らせる。click と同じターンで消すと、ダウンロードが
      // 始まる前に URL が無効になるブラウザがある（保存ダイアログを挟む
      // 設定だと猶予はさらに要る）。放置するとページを開いている間ずっと
      // blob がメモリに残るため、消しはする。
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { ok: true, filename };
    },
    [activeFile],
  );

  return { canExport, exportDocument };
}
