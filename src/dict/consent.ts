import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizePath } from '../pathUtils.ts';
import { nymphDataDir } from '../xdgPaths.ts';
import type { NymphYml } from './schema.ts';

/**
 * direnv と同じく XDG_DATA_HOME（~/.local/share）に保存する。
 * 承認済みハッシュはアプリが書くデータであり設定ファイルではない。
 * テスト時は XDG_DATA_HOME 環境変数で一時ディレクトリに切り替えられる。
 */
function getAcceptedHashesPath(): string {
  return join(nymphDataDir(), 'accepted_hashes.json');
}

/**
 * 承認 1 件。**承認はコマンドの内容だけでなく「どの config に対する承認か」
 * にも紐づく**（`configPath`）。
 *
 * 同じコマンドを持つ config は世の中にいくらでもあり得るため、ハッシュだけを
 * 突き合わせると、一度も開いたことのないリポジトリの `.nymph/config.yml` が
 * 「承認済み」と判定されてそのまま実行されてしまう。nymph は他人のリポジトリ
 * を読むためのツールで、`.nymph/config.yml` はそのリポジトリが書ける内容
 * なので、スコープを持たない承認は承認として弱すぎる。
 *
 * `configPath: null` は旧形式（ハッシュだけの裸配列）から読み込んだ
 * エントリ。どの config への承認だったか復元できないため、承認済みとしては
 * 扱わず再承認を求める（`nymph dict allow --list` には表示する）。
 */
export interface AcceptedEntry {
  hash: string;
  /** 承認のスコープ。正規化済みの config 絶対パス。旧形式は null。 */
  configPath: string | null;
  /** 承認した日時（ISO8601）。旧形式は null。 */
  approvedAt: string | null;
  /** 承認時に表示したコマンド（`--list` の表示用。判定には使わない）。 */
  commands: string[];
}

interface AcceptedFile {
  version: 2;
  entries: AcceptedEntry[];
}

/**
 * canonical の先頭に置くスキーマ版。
 *
 * 承認の意味が変わる変更（対象セクションの追加など）をしたらこの値を上げる。
 * 上げると過去の承認は自動的に失効するが、**それが正しい**——ユーザーが
 * 承認したときには存在しなかった内容まで承認済みにしないため。
 */
const CANONICAL_VERSION = 'nymph-consent/v2';

/**
 * config.yml の全ソースコマンドを正規化してSHA256ハッシュを返す。
 *
 * ソースをname順にソートすることで順序変更に対してロバストにする。
 * ソース名・コマンド引数が1バイトでも変わればハッシュが変わる。
 *
 * canonical には版タグとセクション名を必ず含める。単純な連結にすると
 * 「コマンドを持たない設定」が空文字列に落ち、それを一度承認しただけで
 * 同じく空になる別の設定まで承認済みになってしまう。
 */
export function computeCommandsHash(config: NymphYml): string {
  const sorted = [...(config.sources ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  // \x1f = Unit Separator、\x1e = Record Separator（制御文字で曖昧性を排除）
  const canonical = [
    CANONICAL_VERSION,
    'sources',
    ...sorted.map((s) => [s.name, ...(s.fetch?.cmd ?? [])].join('\x1f')),
  ].join('\x1e');
  return (
    'sha256:' + createHash('sha256').update(canonical, 'utf-8').digest('hex')
  );
}

/** 承認のスコープキー。表記揺れ（`..`・symlink）を吸収して同一視する。 */
function scopeKey(configPath: string): string {
  return normalizePath(configPath);
}

function loadAccepted(): AcceptedEntry[] {
  try {
    const path = getAcceptedHashesPath();
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    // 旧形式: ハッシュだけの裸配列。スコープを復元できないので
    // configPath: null（＝承認済みとして扱わない）に読み替える。
    if (Array.isArray(parsed)) {
      return (parsed as string[])
        .filter((h) => typeof h === 'string')
        .map((hash) => ({
          hash,
          configPath: null,
          approvedAt: null,
          commands: [],
        }));
    }
    if (Array.isArray((parsed as AcceptedFile)?.entries)) {
      return (parsed as AcceptedFile).entries.filter(
        (e) => typeof e?.hash === 'string',
      );
    }
  } catch {
    // ファイル破損や読み取りエラーは無視して空扱いにする
  }
  return [];
}

function saveAccepted(entries: AcceptedEntry[]): void {
  const path = getAcceptedHashesPath();
  const data: AcceptedFile = { version: 2, entries };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * このハッシュが「この config に対して」承認済みか。
 *
 * 判定はハッシュと configPath の**両方**一致で行う。どちらかでも違えば
 * 未承認として扱う。
 */
export function isCommandHashAccepted(
  hash: string,
  configPath: string,
): boolean {
  const scope = scopeKey(configPath);
  return loadAccepted().some((e) => e.hash === hash && e.configPath === scope);
}

/** 承認を記録する。同じ (hash, configPath) の重複は作らない。 */
export function saveAcceptedHash(
  hash: string,
  configPath: string,
  commands: string[] = [],
): void {
  const scope = scopeKey(configPath);
  const entries = loadAccepted().filter(
    (e) => !(e.hash === hash && e.configPath === scope),
  );
  entries.push({
    hash,
    configPath: scope,
    approvedAt: new Date().toISOString(),
    commands,
  });
  saveAccepted(entries);
}

/** 承認済みエントリの一覧（`nymph dict allow --list`）。 */
export function listAcceptedEntries(): AcceptedEntry[] {
  return loadAccepted();
}

/**
 * 承認を失効させる（`nymph dict allow --revoke`）。
 *
 * `configPath` を渡すとその config への承認だけを、省略するとすべてを消す。
 * 失効手段の無い承認は承認ではない——一度出した許可を取り消せる経路を必ず
 * 用意しておく。戻り値は消したエントリ数。
 */
export function revokeAcceptedEntries(configPath?: string): number {
  const entries = loadAccepted();
  const scope = configPath === undefined ? null : scopeKey(configPath);
  const kept =
    scope === null ? [] : entries.filter((e) => e.configPath !== scope);
  const removed = entries.length - kept.length;
  if (removed > 0) saveAccepted(kept);
  return removed;
}
