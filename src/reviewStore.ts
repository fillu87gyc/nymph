import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { Comment } from './client/types.ts';
import { nymphDataDir } from './xdgPaths.ts';

/**
 * レビューデータ（コメント・チェックポイント）の保存場所。
 *
 * 従来はレビュー対象ファイルの隣に `<file>.comments.json` / `<file>.checkpoint`
 * として保存しており、レビュー対象リポジトリを汚していた。
 * ここでは XDG データディレクトリ配下 `$XDG_DATA_HOME/nymph/reviews/<key>/` に
 * 保存する。`<key>` はファイルの絶対パスから決定論的に導出する（同じパスなら
 * 常に同じ保存先になる）ので、レビュー対象リポジトリには何も残らない。
 *
 * 既存の `<file>.comments.json`（裸配列）/ `<file>.checkpoint` はレガシー形式
 * として読み取り時に自動移行する（このモジュールが唯一の入出力窓口）。
 */

interface CommentsEnvelope {
  version: 2;
  file: string;
  updatedAt: string;
  comments: Comment[];
}

const COMMENTS_FILE = 'comments.json';
const CHECKPOINT_FILE = 'checkpoint';

/** ファイルの絶対パスから決定論的なキー（SHA-256 hex 先頭12文字）を導出する。
 * `resolve()` のみを使い symlink はたどらない（realpath 不使用）。 */
export function reviewKey(absPath: string): string {
  const resolved = resolve(absPath);
  return createHash('sha256')
    .update(resolved, 'utf-8')
    .digest('hex')
    .slice(0, 12);
}

/** レビューデータの保存先ディレクトリ（`$XDG_DATA_HOME/nymph/reviews/<key>/`）。 */
export function getReviewDir(absPath: string): string {
  return join(nymphDataDir(), 'reviews', reviewKey(absPath));
}

/** 同一ディレクトリに一時ファイルを書いて rename するアトミック書き込み。 */
function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(
    dir,
    `.${basename(filePath)}.tmp-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
  );
  writeFileSync(tmpPath, data, 'utf-8');
  renameSync(tmpPath, filePath);
}

// 破損した comments.json をサイレントに上書きしないよう退避する。
// 退避自体が失敗しても（権限エラー等）致命的にはせずログのみに留める。
function quarantineCorrupt(filePath: string): void {
  const dest = `${filePath}.corrupt-${Date.now()}`;
  try {
    renameSync(filePath, dest);
  } catch (e) {
    console.error(`破損ファイルの退避に失敗しました: ${filePath}`, e);
  }
}

// レガシーファイルの削除は非致命（失敗してもログのみで処理は続行する）。
function removeLegacy(legacyPath: string): void {
  try {
    rmSync(legacyPath);
  } catch (e) {
    console.error(`レガシーファイルの削除に失敗しました: ${legacyPath}`, e);
  }
}

/** 保存済みコメント。新store未存在時はレガシー(`<file>.comments.json`)から自動移行する。 */
export function readComments(absPath: string): Comment[] {
  const commentsPath = join(getReviewDir(absPath), COMMENTS_FILE);

  if (existsSync(commentsPath)) {
    try {
      const raw = readFileSync(commentsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CommentsEnvelope>;
      if (Array.isArray(parsed?.comments)) return parsed.comments;
      throw new Error('comments.json: 想定外の形式です');
    } catch {
      quarantineCorrupt(commentsPath);
      return [];
    }
  }

  const legacyPath = `${resolve(absPath)}.comments.json`;
  if (existsSync(legacyPath)) {
    let legacyComments: Comment[] = [];
    try {
      const parsed = JSON.parse(readFileSync(legacyPath, 'utf-8'));
      if (Array.isArray(parsed)) legacyComments = parsed as Comment[];
    } catch {
      legacyComments = [];
    }
    writeComments(absPath, legacyComments);
    removeLegacy(legacyPath);
    return legacyComments;
  }

  return [];
}

/** コメントをエンベロープ（version/file/updatedAt/comments）に包んでアトミックに保存する。 */
export function writeComments(absPath: string, comments: Comment[]): void {
  const commentsPath = join(getReviewDir(absPath), COMMENTS_FILE);
  const envelope: CommentsEnvelope = {
    version: 2,
    file: resolve(absPath),
    updatedAt: new Date().toISOString(),
    comments,
  };
  atomicWriteFileSync(commentsPath, `${JSON.stringify(envelope, null, 2)}\n`);
}

/** 保存済みチェックポイント（全文テキスト）。無ければ null。
 * 新store未存在時はレガシー(`<file>.checkpoint`)から自動移行する。 */
export function readCheckpoint(absPath: string): string | null {
  const cpPath = join(getReviewDir(absPath), CHECKPOINT_FILE);

  if (existsSync(cpPath)) {
    try {
      return readFileSync(cpPath, 'utf-8');
    } catch (e) {
      console.error(`checkpoint の読み取りに失敗しました: ${cpPath}`, e);
      return null;
    }
  }

  const legacyPath = `${resolve(absPath)}.checkpoint`;
  if (existsSync(legacyPath)) {
    let content: string;
    try {
      content = readFileSync(legacyPath, 'utf-8');
    } catch (e) {
      console.error(
        `legacy checkpoint の読み取りに失敗しました: ${legacyPath}`,
        e,
      );
      return null;
    }
    writeCheckpoint(absPath, content);
    removeLegacy(legacyPath);
    return content;
  }

  return null;
}

/** チェックポイント（全文テキスト、エンベロープなし）をアトミックに保存する。 */
export function writeCheckpoint(absPath: string, content: string): void {
  const cpPath = join(getReviewDir(absPath), CHECKPOINT_FILE);
  atomicWriteFileSync(cpPath, content);
}

/** チェックポイントが存在するか（レガシーからの移行も行った上で判定する）。 */
export function hasCheckpoint(absPath: string): boolean {
  return readCheckpoint(absPath) !== null;
}
