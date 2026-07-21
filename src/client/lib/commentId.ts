import type { Comment } from '../types.ts';

// コメント ID の採番方式。従来は Math.max(既存 id) + 1 の整数インクリメント
// だったが、削除後の再利用や複数タブでの同時操作時に採番が衝突・曖昧になる
// 問題があった。crypto 由来の乱数 hex に切り替え、衝突時のみ再生成する
// （決定論的キーではなくランダムだが、生成のたびに既存 ID 集合と突き合わせて
// 確実に一意にする）。既存の整数 ID は非破壊で共存させるため、比較は
// 文字列/数値どちらの型でも安全な `Set` の同一性チェックに委ねる。
const ID_PREFIX = 'c_';
const ID_HEX_LENGTH = 6;
const MAX_ATTEMPTS = 1000;

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/** 既存 ID（新旧混在可）と衝突しない `c_` + 6桁hex の新規コメント ID を生成する。 */
export function generateCommentId(
  existingIds: Iterable<Comment['id']>,
): string {
  const existing = new Set(existingIds);
  let id: string;
  let attempts = 0;
  do {
    id = `${ID_PREFIX}${randomHex(ID_HEX_LENGTH)}`;
    attempts++;
  } while (existing.has(id) && attempts < MAX_ATTEMPTS);
  return id;
}
