/**
 * 相対リンクの生死チェック。
 *
 * 「リンク / 画像」ウィジェットが、本文に書かれた相対パス（`./img/a.png`,
 * `../docs/b.md`）を実在するファイルかどうか確かめるための小さな API。
 *
 * 任意のパスの存在を答える窓口にはしない。レビュー対象そのものと同じ範囲
 * ——ルートディレクトリ（`nymph docs/`）があればその配下、無ければ開いて
 * いるファイルのディレクトリ配下——だけを判定し、外に出るものは
 * `exists: null`（＝未確認）で返す。呼ぶ側はそれを「判定できません」として
 * 見せる。
 */

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** 1 件ぶんの判定結果。exists が null なら判定していない（範囲外）。 */
export interface LinkCheckResult {
  target: string;
  exists: boolean | null;
  /** 実在した場合、それがディレクトリか。 */
  isDir?: boolean;
}

/** 一度に問い合わせられる件数の上限（本文 1 枚ぶんとして十分な数）。 */
export const MAX_LINK_TARGETS = 300;

/**
 * リンクの行き先から、存在を確かめるべき絶対パスを求める。
 *
 * - アンカー（`#sec`）とクエリは落とす
 * - スキーム付き（`https:` など）と絶対パスは対象外（null）
 * - 判定してよい範囲（scopeDir）の外に出るものも対象外（null）
 */
export function resolveLinkTarget(
  target: string,
  baseDir: string,
  scopeDir: string,
): string | null {
  const path = target.split('#')[0].split('?')[0].trim();
  if (!path) return null;
  // スキーム付き（http:, mailto:, data: …）と protocol-relative は外部
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
  if (isAbsolute(path)) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // 壊れたパーセントエンコードはそのままのパスとして扱う
    decoded = path;
  }

  const abs = resolve(baseDir, decoded);
  const rel = relative(scopeDir, abs);
  // 範囲そのもの（rel === ''）は「ディレクトリを指すリンク」として許す
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return abs;
}

/**
 * リンクの行き先をまとめて判定する。
 *
 * @param targets 本文に書かれたままの行き先
 * @param baseDir 相対パスの基準（＝開いているファイルのディレクトリ）
 * @param scopeDir 判定してよい範囲（ルートがあればルート、無ければ baseDir）
 */
export function checkLinkTargets(
  targets: readonly string[],
  baseDir: string,
  scopeDir: string,
): LinkCheckResult[] {
  const out: LinkCheckResult[] = [];
  const seen = new Set<string>();
  for (const target of targets.slice(0, MAX_LINK_TARGETS)) {
    if (typeof target !== 'string' || seen.has(target)) continue;
    seen.add(target);
    const abs = resolveLinkTarget(target, baseDir, scopeDir);
    if (abs === null) {
      out.push({ target, exists: null });
      continue;
    }
    if (!existsSync(abs)) {
      out.push({ target, exists: false });
      continue;
    }
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      // 直後に消された等。存在した事実だけ返す
    }
    out.push({ target, exists: true, isDir });
  }
  return out;
}
