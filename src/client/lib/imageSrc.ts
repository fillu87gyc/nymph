/**
 * 本文中の画像を、開いている md ファイルを起点とした相対パスで表示する。
 *
 * marked が出す `<img src="./img/a.png">` をそのままブラウザに渡すと、相対
 * パスは「md ファイルの場所」ではなく「画面の URL（= アプリのルート）」を
 * 基準に解決されるため、画像は必ず 404 になる。ここで src を `/image` へ
 * 向け直し、どのファイルを起点に解決するかをサーバーへ伝える。
 *
 * 書き換えるのは相対パスだけ。`https://…` や `data:` の画像は本文に書かれた
 * ままブラウザに解決させる（サーバーを経由させる理由がない）。
 */

import { isDroppedPath } from '../../dropped.ts';

/**
 * 画像の src を `/image` の URL にする。書き換える必要が無ければ null。
 *
 * @param src  本文に書かれたままの src
 * @param file 相対パスの起点にする md ファイルの絶対パス
 */
export function toImageUrl(src: string, file: string | null): string | null {
  // ドロップ由来の擬似タブにはファイル実体が無く、起点を決められない。
  if (!file || isDroppedPath(file)) return null;
  const path = src.trim();
  if (!path) return null;
  // スキーム付き（http:, data:, file: …）と protocol-relative はそのまま
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
  // ルート絶対パスとフラグメントのみの参照は「相対パス」ではない
  if (path.startsWith('/') || path.startsWith('#')) return null;
  return `/image?file=${encodeURIComponent(file)}&path=${encodeURIComponent(path)}`;
}

/**
 * レンダリング済み HTML 内の `<img>` の相対 src を `/image` へ向け直す。
 *
 * marked が生成した画像と、本文に直接書かれた `<img>` タグの両方を同じ規則で
 * 扱うため、トークンではなく出力 HTML に対して適用する。
 */
export function rewriteImageSrc(html: string, file: string | null): string {
  if (!file || !html.includes('<img')) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  for (const img of doc.body.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (src === null) continue;
    const url = toImageUrl(src, file);
    if (url === null) continue;
    img.setAttribute('src', url);
    changed = true;
  }
  return changed ? doc.body.innerHTML : html;
}
