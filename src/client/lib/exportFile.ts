/**
 * 画面からのエクスポート（⋯ → エクスポート）で使う、形式と出力ファイル名の定義。
 *
 * サーバー（`src/exportPayload.ts` → `Content-Disposition`）とクライアント
 * （blob をダウンロードするときの `<a download>`）の両方が同じ名前を付ける
 * 必要があるため、ここを唯一の出どころにする。ブラウザでも動くよう
 * node の API には触れない（`basename` 済みの名前を受け取る）。
 */

/** 画面から書き出せる形式。CLI の `--export` / `--annotate` / `nymph export` に対応する。 */
export type ExportFormat = 'html' | 'md' | 'csv';

export const EXPORT_FORMATS: ExportFormat[] = ['html', 'md', 'csv'];

export function isExportFormat(v: unknown): v is ExportFormat {
  return v === 'html' || v === 'md' || v === 'csv';
}

/** ダウンロードされるファイルの MIME。CSV は Excel に渡ることを想定する。 */
export const EXPORT_CONTENT_TYPE: Record<ExportFormat, string> = {
  html: 'text/html; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
};

/**
 * 出力ファイル名を決める。`sample.md` → `sample-review.html`。
 *
 * `-review` を挟むのは、Markdown 書き戻し（`md`）が元ファイルと同じ拡張子に
 * なるため。ダウンロードフォルダで元ファイルと並んでも取り違えないようにし、
 * かつ「元ファイルは書き換えない」という CLI 側の約束を名前でも守る。
 */
export function exportFilename(name: string, format: ExportFormat): string {
  const stem = name.replace(/\.(md|markdown)$/i, '') || 'export';
  return `${stem}-review.${format}`;
}
