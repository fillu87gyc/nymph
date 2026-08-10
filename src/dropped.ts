/**
 * ブラウザへドロップされた .md を表す擬似タブの識別子。
 *
 * ドロップされたファイルはブラウザ経由で内容だけを受け取るため、サーバー側に
 * ファイル実体（＝パス）が無い。タブ一覧にはこの識別子で並べ、パスを前提に
 * する処理（コメントの保存先・相対リンクの基準・パスのコピー等）からは
 * `isDroppedPath` で除外する。
 */
export const DROPPED_PATH = '__dropped__';

/** ドロップ由来の擬似タブかどうか（実ファイルのパスなら false）。 */
export function isDroppedPath(path: string | null | undefined): boolean {
  return path === DROPPED_PATH;
}
