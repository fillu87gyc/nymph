/**
 * 本文中の画像として扱う拡張子と MIME。
 *
 * HTML エクスポートのデータ URI 埋め込み（`reviewBlocks.ts`）と、アプリが
 * 相対パスの画像を配信する `/image`（`server.ts`）が共有する。ここに無い
 * 拡張子は「画像ではない」として扱う——配信も埋め込みもしない。
 */
export const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};
