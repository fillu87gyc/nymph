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
  // チェックポイント設定を「ラウンド境界」として数える通し番号。省略時は 0
  // 相当（未着手のレビュー）。追加の optional フィールドなので version は
  // 上げない。
  round?: number;
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
// force: true により、既に無い場合（他経路で先に削除済み等）は無音で成功扱いにする。
function removeLegacy(legacyPath: string): void {
  try {
    rmSync(legacyPath, { force: true });
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
    let legacyComments: Comment[];
    try {
      const parsed = JSON.parse(readFileSync(legacyPath, 'utf-8'));
      if (!Array.isArray(parsed))
        throw new Error('legacy comments.json: 想定外の形式です');
      legacyComments = parsed as Comment[];
    } catch {
      // パース不能・想定外形式のレガシーは、ユーザーのコメントデータが
      // 復元可能かもしれないため黙って消さず、新store側の破損時と同じく
      // 退避してから空配列で開始する。
      quarantineCorrupt(legacyPath);
      return [];
    }
    // writeComments が新storeへの保存と合わせてレガシーの削除まで行う。
    writeComments(absPath, legacyComments);
    return legacyComments;
  }

  return [];
}

// comments.json の round フィールドだけを覗き見る（レガシー移行は行わない。
// レガシーには round の概念が無いため常に 0 が正しい既定値）。
// 破損ファイルの退避は readComments 側の読み取り経路に委ねる。
export function readRound(absPath: string): number {
  const commentsPath = join(getReviewDir(absPath), COMMENTS_FILE);
  if (!existsSync(commentsPath)) return 0;
  try {
    const raw = readFileSync(commentsPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CommentsEnvelope>;
    return typeof parsed?.round === 'number' ? parsed.round : 0;
  } catch {
    return 0;
  }
}

function writeEnvelope(
  absPath: string,
  comments: Comment[],
  round: number,
): void {
  const commentsPath = join(getReviewDir(absPath), COMMENTS_FILE);
  const envelope: CommentsEnvelope = {
    version: 2,
    file: resolve(absPath),
    updatedAt: new Date().toISOString(),
    round,
    comments,
  };
  atomicWriteFileSync(commentsPath, `${JSON.stringify(envelope, null, 2)}\n`);
  removeLegacy(`${resolve(absPath)}.comments.json`);
}

/**
 * コメントをエンベロープ（version/file/updatedAt/round/comments）に包んで
 * アトミックに保存する。POST は全量置換セマンティクスのため、レガシー
 * (`<file>.comments.json`)が残っていれば読み取りを経ていなくてもここで
 * 削除する（レビュー対象リポジトリに汚れを残さないため。中身は新store側の
 * 保存内容で意図的に上書きされたとみなす）。
 *
 * round はこの関数では変更しない（既存の envelope から引き継ぐ）。round を
 * 進めるのはチェックポイント設定時の `incrementRound` の責務。
 */
export function writeComments(absPath: string, comments: Comment[]): void {
  writeEnvelope(absPath, comments, readRound(absPath));
}

/**
 * チェックポイント設定（＝レビューのラウンド境界）のたびに呼ぶ。
 * 既存のコメントは保持したまま round だけ +1 して保存し、更新後の round を
 * 返す。comments.json が未存在（コメント0件でチェックポイントだけ設定した
 * 場合）でも、round だけを持つ envelope を新規作成してよい。
 */
export function incrementRound(absPath: string): number {
  const commentsPath = join(getReviewDir(absPath), COMMENTS_FILE);
  let comments: Comment[] = [];
  let round = 0;
  if (existsSync(commentsPath)) {
    try {
      const raw = readFileSync(commentsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CommentsEnvelope>;
      if (Array.isArray(parsed?.comments)) comments = parsed.comments;
      if (typeof parsed?.round === 'number') round = parsed.round;
    } catch {
      // 破損している場合は writeComments と同様、安全側に倒して
      // 0 件・round 0 起点で上書きする（この呼び出し自体が書き込みのため
      // quarantine はせず、次の envelope で置き換える）。
    }
  }
  const next = round + 1;
  writeEnvelope(absPath, comments, next);
  return next;
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
    // writeCheckpoint が新storeへの保存と合わせてレガシーの削除まで行う。
    writeCheckpoint(absPath, content);
    return content;
  }

  return null;
}

/**
 * チェックポイント（全文テキスト、エンベロープなし）をアトミックに保存する。
 * writeComments と同様、残っているレガシー(`<file>.checkpoint`)があれば
 * 読み取りを経ていなくてもここで削除する。
 */
export function writeCheckpoint(absPath: string, content: string): void {
  const cpPath = join(getReviewDir(absPath), CHECKPOINT_FILE);
  atomicWriteFileSync(cpPath, content);
  removeLegacy(`${resolve(absPath)}.checkpoint`);
}

/** チェックポイントが存在するか（レガシーからの移行も行った上で判定する）。 */
export function hasCheckpoint(absPath: string): boolean {
  return readCheckpoint(absPath) !== null;
}
