import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { normalizePath } from './pathUtils.ts';

export type ResolvedInputs = {
  /** 監視対象として解決されたファイルの絶対パス（重複排除済み） */
  paths: string[];
  /** ツリーのルート候補として指定されたディレクトリの絶対パス（重複排除済み） */
  dirs: string[];
  /**
   * 実在せず、glob としても何にも一致しなかった引数。
   * ユーザーが打った表記のまま返すので、そのままエラーメッセージに使える。
   */
  missing: string[];
};

/** glob パターンを cwd 基準で展開する関数（テストで差し替えられるようにする） */
export type GlobScan = (pattern: string, cwd: string) => AsyncIterable<string>;

export type ResolveInputsOptions = {
  /** glob 展開の実装（本番は `src/globScan.ts` の Bun 実装） */
  scan: GlobScan;
  /** glob パターンを展開する基準ディレクトリ（デフォルトはカレント） */
  cwd?: string;
};

/**
 * CLI に渡されたファイル/ディレクトリ引数を解決する。
 *
 * 実在するパスはファイルとディレクトリに振り分け、実在しないパスは
 * シェルが展開しなかった glob パターンとして展開を試みる。
 * どちらでもないもの（＝存在しない指定）は `missing` に集めて呼び出し側へ返し、
 * サーバを起動する前にエラーとして扱えるようにする。
 */
export async function resolveInputs(
  fileArgs: string[],
  options: ResolveInputsOptions,
): Promise<ResolvedInputs> {
  const { scan, cwd = '.' } = options;
  const paths: string[] = [];
  const dirs: string[] = [];
  const missing: string[] = [];

  for (const filePath of fileArgs) {
    // symlink 経由でも実体パスに正規化し、同じファイルを別表記で開いても
    // 別ファイル扱いにならないようにする
    const abs = normalizePath(filePath);

    if (existsSync(abs)) {
      if (statSync(abs).isDirectory()) dirs.push(abs);
      else paths.push(abs);
      continue;
    }

    // 実在しないパスは、シェルが展開しなかった glob パターンとして扱う
    const expanded: string[] = [];
    try {
      for await (const f of scan(filePath, cwd)) {
        if (f.endsWith('.md')) {
          expanded.push(normalizePath(isAbsolute(f) ? f : join(cwd, f)));
        }
      }
    } catch {
      /* 不正なパターンは「見つからない」として扱う */
    }

    if (expanded.length > 0) paths.push(...expanded.sort());
    else missing.push(filePath);
  }

  return {
    paths: [...new Set(paths)],
    dirs: [...new Set(dirs)],
    missing,
  };
}
