import type { Comment, DiffResponse } from '../types.ts';
import { commentStatus } from './comments.ts';
import type { TocItem } from './toc.ts';

/**
 * アウトライン（目次パネル）の見出しに付けるバッジ種別。
 * - off: バッジなし（従来の目次と同じ見た目）
 * - comments: 未解決コメント数のみ
 * - diff: チェックポイントからの追加/削除行数のみ
 * - both: 両方
 */
export type OutlineBadgeMode = 'off' | 'comments' | 'diff' | 'both';

const VALID_MODES: readonly OutlineBadgeMode[] = [
  'off',
  'comments',
  'diff',
  'both',
];
const DEFAULT_MODE: OutlineBadgeMode = 'comments';
const STORAGE_KEY = 'nymph-outline-badge-mode';

export function loadOutlineBadgeMode(): OutlineBadgeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return (VALID_MODES as readonly string[]).includes(saved ?? '')
    ? (saved as OutlineBadgeMode)
    : DEFAULT_MODE;
}

export function saveOutlineBadgeMode(mode: OutlineBadgeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * 「差分量」モードはチェックポイント未設定だと表示するものが無い。
 * その場合は設定を変えさせずに「コメント数」表示へ自動フォールバックする。
 * 「両方」はコメント側だけで意味が成立するため対象外。
 */
export function resolveEffectiveBadgeMode(
  mode: OutlineBadgeMode,
  hasCheckpoint: boolean,
): OutlineBadgeMode {
  if (mode === 'diff' && !hasCheckpoint) return 'comments';
  return mode;
}

export interface OutlineStats {
  openComments: number;
  added: number;
  deleted: number;
}

function emptyStats(): OutlineStats {
  return { openComments: 0, added: 0, deleted: 0 };
}

/**
 * 見出し配下（次の見出しの手前まで、文書順）の未解決コメント数と、
 * チェックポイントからの追加/削除行数を見出しごとに集計する。
 *
 * diff の削除行は現在ファイル上の行番号を持たない（サーバー側 computeDiff の
 * n が null）ため、直前に見えた現在行番号（insert/equal 行の n）が指す
 * 見出しへ帰属させる。差分コメント（block_type: 'diff'）は現在の見出し構造
 * との対応が別軸のためここでは数えない。
 */
export function computeOutlineStats(
  items: TocItem[],
  comments: Comment[],
  orphanedIds: Set<Comment['id']>,
  diffData: DiffResponse | null,
): Map<string, OutlineStats> {
  const stats = new Map<string, OutlineStats>();
  for (const item of items) stats.set(item.key, emptyStats());
  if (items.length === 0) return stats;

  // items は文書順（toc.ts の抽出順）で lineStart 昇順。
  function sectionKeyFor(line: number): string | null {
    let key: string | null = null;
    for (const item of items) {
      if (item.lineStart > line) break;
      key = item.key;
    }
    return key;
  }

  for (const c of comments) {
    if (c.block_type === 'diff') continue;
    if (commentStatus(c, orphanedIds.has(c.id)) !== 'open') continue;
    const key = sectionKeyFor(c.lineStart);
    if (!key) continue;
    // biome-ignore lint/style/noNonNullAssertion: key は items から得たものなので必ず存在する
    stats.get(key)!.openComments++;
  }

  if (diffData) {
    let anchor = 0;
    for (const line of diffData.lines) {
      if (line.n != null) anchor = line.n;
      if (line.type === 'equal') continue;
      const key = sectionKeyFor(anchor);
      if (!key) continue;
      // biome-ignore lint/style/noNonNullAssertion: key は items から得たものなので必ず存在する
      const s = stats.get(key)!;
      if (line.type === 'insert') s.added++;
      else s.deleted++;
    }
  }

  return stats;
}
