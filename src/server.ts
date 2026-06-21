import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { diffArrays } from 'diff';
import {
  isBookmarkedPath,
  listBookmarks,
  toggleBookmark,
} from './bookmarks.ts';
import { scanMdTree } from './fsTree.ts';
import { isRecentPath, listRecent, recordRecent } from './recent.ts';

// NYMPH_DICT_DIR に絶対パスを指定した場合はそのまま使い、
// 省略時は process.cwd()/.nymph を使う（E2E ワーカー分離に対応）。
const _dictDir = process.env.NYMPH_DICT_DIR ?? join(process.cwd(), '.nymph');
const DICT_JSON_PATH = join(_dictDir, 'dict.json');

// shell を介さずに git を実行する（shell 経由のインジェクション余地を残さない）。
function git(args: string[]): string | null {
  const res = spawnSync('git', args, { encoding: 'utf-8' });
  if (res.status === 0 && res.stdout) return res.stdout.trim();
  return null;
}

function resolveAppVersion(): string {
  return (
    git(['describe', '--tags', '--exact-match', 'HEAD']) ??
    git(['rev-parse', '--short', 'HEAD']) ??
    'unknown'
  );
}

const APP_VERSION = resolveAppVersion();

interface State {
  filePaths: string[];
  activeFile: string | null;
  commentsPath: string | null;
  cachedContent: string | null;
  droppedContent: string | null;
  droppedName: string | null;
  rootDir: string | null;
}

const state: State = {
  filePaths: [],
  activeFile: null,
  commentsPath: null,
  cachedContent: null,
  droppedContent: null,
  droppedName: null,
  rootDir: null,
};

// checkpoint はサーバーを再起動しても diff（と差分コメント）が意味を保つよう、
// レビュー対象ファイルの隣にスナップショットとして永続化する（.comments.json と同じ扱い）。
function checkpointPath(file: string): string {
  return `${file}.checkpoint`;
}

export function initState(paths: string[], rootDir: string | null = null) {
  state.filePaths = paths;
  state.activeFile = paths[0] ?? null;
  state.commentsPath = paths.length > 0 ? `${paths[0]}.comments.json` : null;
  state.cachedContent = null;
  state.droppedContent = null;
  state.droppedName = null;
  state.rootDir = rootDir;
}

function activePaths(): string[] {
  return state.filePaths.length
    ? state.filePaths
    : state.activeFile
      ? [state.activeFile]
      : [];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(msg: string, status = 500): Response {
  return new Response(msg, { status });
}

// クライアントに最後に配信した mtime。SSE 接続後に /open-file で増えた
// ファイルの監視ベースラインに使う（接続時スナップショットに無いため）。
const servedMtimes = new Map<string, number>();

function handleContent(url: URL): Response {
  const fileParam = url.searchParams.get('file');
  const allowed = new Set(activePaths());

  if (fileParam && !allowed.has(fileParam)) return err('Forbidden', 403);

  const target = fileParam ?? state.activeFile;
  try {
    if (target) {
      const text = readFileSync(target, 'utf-8');
      state.cachedContent = text;
      const mtime = statSync(target).mtimeMs;
      servedMtimes.set(target, mtime);
      return json({
        content: text,
        filename: basename(target),
        mtime,
      });
    }
    if (state.droppedContent !== null) {
      return json({
        content: state.droppedContent,
        filename: state.droppedName,
        mtime: 0,
      });
    }
    return json({ content: '', filename: null, mtime: 0 });
  } catch (e) {
    return err(String(e));
  }
}

function handleWatch(): Response {
  const dictPath = DICT_JSON_PATH;
  const encoder = new TextEncoder();
  const mtimes = new Map<string, number>();
  for (const p of activePaths()) {
    try {
      mtimes.set(p, statSync(p).mtimeMs);
    } catch {
      mtimes.set(p, 0);
    }
  }
  // dict.json の初期 mtime を記録
  let dictMtime = 0;
  try {
    dictMtime = statSync(dictPath).mtimeMs;
  } catch {
    /* dict.json が存在しない場合はスキップ */
  }

  let timer: ReturnType<typeof setInterval>;
  let pingTimer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(ctrl) {
      timer = setInterval(() => {
        // 接続後に /open-file で増えたファイルも監視できるよう毎回取得する。
        // 初見のパスは配信済み mtime をベースラインにし、配信後〜初回 tick の間の
        // 書き込みを取りこぼさない（未配信なら記録のみで発火しない）。
        for (const p of activePaths()) {
          try {
            const mtime = statSync(p).mtimeMs;
            const prev = mtimes.get(p) ?? servedMtimes.get(p);
            if (prev !== undefined && mtime !== prev) {
              ctrl.enqueue(
                encoder.encode(`data: ${JSON.stringify({ file: p })}\n\n`),
              );
            }
            mtimes.set(p, mtime);
          } catch {
            /* ignore deleted files */
          }
        }
        // dict.json の変化を監視
        try {
          const mtime = statSync(dictPath).mtimeMs;
          if (mtime !== dictMtime) {
            ctrl.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ dictUpdated: true })}\n\n`,
              ),
            );
            dictMtime = mtime;
          }
        } catch {
          /* dict.json が存在しない場合はスキップ */
        }
      }, 500);
      pingTimer = setInterval(() => {
        ctrl.enqueue(encoder.encode('data: {}\n\n'));
      }, 1000);
    },
    cancel() {
      clearInterval(timer);
      clearInterval(pingTimer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function handleGetDict(): Response {
  const dictPath = DICT_JSON_PATH;
  if (!existsSync(dictPath)) {
    return json({ version: 1, updatedAt: '', entries: [] });
  }
  try {
    return new Response(readFileSync(dictPath, 'utf-8'), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return err(String(e));
  }
}

let dictSyncing = false;

async function handleDictSync(): Promise<Response> {
  if (dictSyncing) return json({ error: 'sync already in progress' }, 409);
  dictSyncing = true;
  try {
    const configPath = join(process.cwd(), '.nymph/config.yml');
    if (existsSync(configPath)) {
      // コマンド承認チェック（未承認の場合は実行せず 403 を返す）
      const { loadConfig } = await import('./dict/config.ts');
      const { computeCommandsHash, isCommandHashAccepted } = await import(
        './dict/consent.ts'
      );
      const config = loadConfig(configPath);
      const hash = computeCommandsHash(config);
      if (!isCommandHashAccepted(hash)) {
        return json(
          {
            error:
              'コマンドが未承認です。ターミナルで nymph dict allow を実行してください。',
          },
          403,
        );
      }

      spawnSync(
        process.execPath,
        [
          join(import.meta.dir, 'cli.ts'),
          'dict',
          'build',
          '--config',
          configPath,
          '--out',
          DICT_JSON_PATH,
        ],
        { shell: false, encoding: 'utf-8' },
      );
    }
    return handleGetDict();
  } finally {
    dictSyncing = false;
  }
}

function handleGetComments(url: URL): Response {
  const fileParam = url.searchParams.get('file');
  const allowed = new Set(activePaths());

  if (fileParam && !allowed.has(fileParam)) return err('Forbidden', 403);

  const cp = fileParam ? `${fileParam}.comments.json` : state.commentsPath;
  if (!cp) return json([]);
  try {
    return new Response(existsSync(cp) ? readFileSync(cp, 'utf-8') : '[]', {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return err(String(e));
  }
}

async function handleSaveComments(req: Request): Promise<Response> {
  if (!state.commentsPath) return json({});
  try {
    const body = await req.json();
    writeFileSync(state.commentsPath, JSON.stringify(body, null, 2), 'utf-8');
    return json({});
  } catch (e) {
    return err(String(e));
  }
}

function handleFiles(): Response {
  const paths = activePaths();
  const files = paths.map((p) => ({ path: p, name: basename(p) }));
  if (files.length === 0 && state.droppedName) {
    files.push({ path: '__dropped__', name: state.droppedName });
  }
  const activeFile =
    state.activeFile ?? (state.droppedName ? '__dropped__' : null);
  return json({ files, activeFile });
}

async function handleSetActiveFile(req: Request): Promise<Response> {
  try {
    const { path } = (await req.json()) as { path: string };
    const allowed = new Set(activePaths());
    if (!path || !allowed.has(path))
      return json({ error: 'invalid path' }, 400);
    state.activeFile = path;
    state.commentsPath = `${path}.comments.json`;
    return json({});
  } catch (e) {
    return err(String(e));
  }
}

async function handleCloseFile(req: Request): Promise<Response> {
  try {
    const { path } = (await req.json()) as { path: string };
    if (path === '__dropped__') {
      state.droppedContent = null;
      state.droppedName = null;
      const activeFile = state.activeFile ?? null;
      return json({
        activeFile,
        files: state.filePaths.map((p) => ({ path: p, name: basename(p) })),
      });
    }
    const idx = state.filePaths.indexOf(path);
    if (idx === -1) return json({ error: 'not found' }, 404);
    state.filePaths.splice(idx, 1);
    if (state.activeFile === path) {
      const next = state.filePaths[idx] ?? state.filePaths[idx - 1] ?? null;
      state.activeFile = next;
      state.commentsPath = next ? `${next}.comments.json` : null;
    }
    return json({
      activeFile: state.activeFile,
      files: state.filePaths.map((p) => ({ path: p, name: basename(p) })),
    });
  } catch (e) {
    return err(String(e));
  }
}

// path が rootDir の内側（rootDir 自身は除く）かどうか。
// relative() が正規化するので `..` を含む traversal も弾ける。
export function isUnderRoot(path: string, rootDir: string | null): boolean {
  if (!rootDir) return false;
  const rel = relative(rootDir, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

// リクエスト毎に再スキャンして起動後に増えたファイルも拾う
// （docs ツリーの走査は ms オーダーなのでキャッシュ不要）。
function handleTree(): Response {
  if (!state.rootDir) return json({ root: null, tree: [] });
  return json({
    root: state.rootDir,
    rootName: basename(state.rootDir),
    tree: scanMdTree(state.rootDir),
  });
}

// ブラウザからツリーのルートを切り替える。loopback バインドのローカル専用
// ツールとして任意パスを許可する設計（開いているタブは維持される）。
async function handleOpenDir(req: Request): Promise<Response> {
  try {
    const { path } = (await req.json()) as { path: string };
    if (!path || typeof path !== 'string')
      return json({ error: 'invalid path' }, 400);
    const abs = resolve(path);
    try {
      if (!statSync(abs).isDirectory()) return err('Not a directory', 404);
    } catch {
      return err('Not found', 404);
    }
    state.rootDir = abs;
    return json({
      root: abs,
      rootName: basename(abs),
      tree: scanMdTree(abs),
    });
  } catch (e) {
    return err(String(e));
  }
}

function handleRecent(): Response {
  const files = listRecent().map((e) => ({
    path: e.path,
    name: basename(e.path),
    dir: dirname(e.path),
    openedAt: e.openedAt,
  }));
  return json({ files });
}

function bookmarksPayload() {
  return {
    bookmarks: listBookmarks().map((e) => ({
      path: e.path,
      name: basename(e.path),
      dir: dirname(e.path),
      type: e.type,
      addedAt: e.addedAt,
    })),
  };
}

function handleBookmarks(): Response {
  return json(bookmarksPayload());
}

async function handleToggleBookmark(req: Request): Promise<Response> {
  try {
    const { path, type } = (await req.json()) as {
      path: string;
      type: 'file' | 'dir';
    };
    if (
      !path ||
      typeof path !== 'string' ||
      (type !== 'file' && type !== 'dir')
    )
      return json({ error: 'invalid request' }, 400);
    const abs = resolve(path);
    try {
      const st = statSync(abs);
      if (type === 'file' && (!st.isFile() || !abs.endsWith('.md')))
        return json({ error: 'invalid file' }, 400);
      if (type === 'dir' && !st.isDirectory())
        return json({ error: 'invalid dir' }, 400);
    } catch {
      return err('Not found', 404);
    }
    const bookmarked = toggleBookmark(abs, type);
    return json({ bookmarked, ...bookmarksPayload() });
  } catch (e) {
    return err(String(e));
  }
}

// ブラウザから履歴・ツリー・ブックマーク経由でファイルを開く。
// 任意パスを開放しないよう、既知のパスか rootDir 配下のみ許可する。
async function handleOpenFile(req: Request): Promise<Response> {
  try {
    const { path } = (await req.json()) as { path: string };
    if (!path || typeof path !== 'string')
      return json({ error: 'invalid path' }, 400);
    const abs = resolve(path);
    if (!abs.endsWith('.md')) return err('Forbidden', 403);
    if (
      !isRecentPath(abs) &&
      !isBookmarkedPath(abs) &&
      !isUnderRoot(abs, state.rootDir)
    )
      return err('Forbidden', 403);
    if (!existsSync(abs)) return err('Not found', 404);

    if (!state.filePaths.includes(abs)) state.filePaths.push(abs);
    state.activeFile = abs;
    state.commentsPath = `${abs}.comments.json`;
    recordRecent([abs]);
    return json({
      files: state.filePaths.map((p) => ({ path: p, name: basename(p) })),
      activeFile: state.activeFile,
    });
  } catch (e) {
    return err(String(e));
  }
}

async function handleSwitchFile(req: Request): Promise<Response> {
  try {
    const { content, filename } = (await req.json()) as {
      content: string;
      filename: string;
    };
    state.droppedContent = content;
    state.droppedName = filename;
    return json({});
  } catch (e) {
    return err(String(e));
  }
}

function handleSetCheckpoint(): Response {
  try {
    if (!state.activeFile) return json({ ok: true, lines: 0 });
    const content = readFileSync(state.activeFile, 'utf-8');
    writeFileSync(checkpointPath(state.activeFile), content, 'utf-8');
    return json({
      ok: true,
      lines: content.split('\n').length,
    });
  } catch (e) {
    return err(String(e));
  }
}

function handleDiff(): Response {
  try {
    if (!state.activeFile) return json({ lines: [], hasCheckpoint: false });
    const cpPath = checkpointPath(state.activeFile);
    if (!existsSync(cpPath)) return json({ lines: [], hasCheckpoint: false });
    const checkpoint = readFileSync(cpPath, 'utf-8');
    const current = readFileSync(state.activeFile, 'utf-8');
    return json({
      lines: computeDiff(checkpoint, current),
      hasCheckpoint: true,
    });
  } catch (e) {
    return err(String(e));
  }
}

export interface ServerDiffLine {
  n: number | null;
  o: number | null;
  type: 'equal' | 'insert' | 'delete';
  content: string;
  g: number | null;
}

export function computeDiff(
  checkpoint: string,
  current: string,
): ServerDiffLine[] {
  const aLines = checkpoint.split('\n');
  const bLines = current.split('\n');
  const changes = diffArrays(aLines, bLines);
  const result: ServerDiffLine[] = [];
  let currentN = 0;
  let currentO = 0;
  let groupId = 0;
  let i = 0;

  while (i < changes.length) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const line of change.value) {
        currentN++;
        currentO++;
        result.push({
          n: currentN,
          o: currentO,
          type: 'equal',
          content: line,
          g: null,
        });
      }
      i++;
    } else if (change.removed) {
      const next = changes[i + 1];
      if (next?.added) {
        for (const line of change.value) {
          currentO++;
          result.push({
            n: null,
            o: currentO,
            type: 'delete',
            content: line,
            g: groupId,
          });
        }
        for (const line of next.value) {
          currentN++;
          result.push({
            n: currentN,
            o: null,
            type: 'insert',
            content: line,
            g: groupId,
          });
        }
        groupId++;
        i += 2;
      } else {
        for (const line of change.value) {
          currentO++;
          result.push({
            n: null,
            o: currentO,
            type: 'delete',
            content: line,
            g: groupId,
          });
        }
        groupId++;
        i++;
      }
    } else {
      for (const line of change.value) {
        currentN++;
        result.push({
          n: currentN,
          o: null,
          type: 'insert',
          content: line,
          g: groupId,
        });
      }
      groupId++;
      i++;
    }
  }
  return result;
}

async function handleEditOp(req: Request): Promise<Response> {
  try {
    const op = (await req.json()) as {
      tool_input?: { old_string?: string; new_string?: string };
      old_string?: string;
      new_string?: string;
    };
    const ti = op.tool_input ?? op;
    const oldString = ti.old_string ?? '';
    const newString = ti.new_string ?? '';

    if (!oldString || !state.activeFile) return json({});

    if (!state.cachedContent) {
      state.cachedContent = readFileSync(state.activeFile, 'utf-8');
    }
    const idx = state.cachedContent.indexOf(oldString);
    if (idx !== -1) {
      const startLine = state.cachedContent
        .substring(0, idx)
        .split('\n').length;
      const oldLineCount = oldString.split('\n').length;
      const newLineCount = newString.split('\n').length;
      const delta = newLineCount - oldLineCount;
      state.cachedContent = state.cachedContent.replace(oldString, newString);
      if (delta !== 0) remapComments(startLine, oldLineCount, delta);
    }
    return json({});
  } catch (e) {
    return err(String(e));
  }
}

function remapComments(editLine: number, oldLineCount: number, delta: number) {
  if (!state.commentsPath || !existsSync(state.commentsPath)) return;
  try {
    const comments = JSON.parse(
      readFileSync(state.commentsPath, 'utf-8'),
    ) as Array<{ lineStart: number; lineEnd: number }>;
    const editEnd = editLine + oldLineCount - 1;
    for (const c of comments) {
      if (c.lineStart > editEnd) {
        c.lineStart += delta;
        c.lineEnd += delta;
      } else if (c.lineEnd > editEnd) {
        c.lineEnd += delta;
      }
    }
    writeFileSync(
      state.commentsPath,
      JSON.stringify(comments, null, 2),
      'utf-8',
    );
  } catch {
    /* ignore */
  }
}

function serveStatic(url: URL): Response | null {
  const distDir = join(import.meta.dir, '..', 'dist');
  if (!existsSync(distDir)) return null;

  let filePath = join(
    distDir,
    url.pathname === '/' ? 'index.html' : url.pathname,
  );
  if (!existsSync(filePath)) filePath = join(distDir, 'index.html');

  try {
    const file = Bun.file(filePath);
    return new Response(file);
  } catch {
    return null;
  }
}

// レビュー対象ファイルを認証なしで読み書きする API を公開しているため、
// LAN 全体に晒さないよう必ずループバックアドレスにバインドする。
export const SERVER_HOSTNAME = '127.0.0.1';

export function createServer(port: number) {
  return Bun.serve({
    port,
    hostname: SERVER_HOSTNAME,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (req.method === 'GET') {
        if (path === '/version') return json({ version: APP_VERSION });
        if (path === '/content') return handleContent(url);
        if (path === '/watch') return handleWatch();
        if (path === '/comments') return handleGetComments(url);
        if (path === '/diff') return handleDiff();
        if (path === '/files') return handleFiles();
        if (path === '/recent') return handleRecent();
        if (path === '/tree') return handleTree();
        if (path === '/bookmarks') return handleBookmarks();
        if (path === '/checkpoint') return handleSetCheckpoint();
        if (path === '/dict') return handleGetDict();
        const staticResp = serveStatic(url);
        if (staticResp) return staticResp;
        return new Response('Not found', { status: 404 });
      }

      if (req.method === 'POST') {
        if (path === '/comments') return handleSaveComments(req);
        if (path === '/edit-op') return handleEditOp(req);
        if (path === '/checkpoint') return handleSetCheckpoint();
        if (path === '/switch-file') return handleSwitchFile(req);
        if (path === '/active-file') return handleSetActiveFile(req);
        if (path === '/open-file') return handleOpenFile(req);
        if (path === '/open-dir') return handleOpenDir(req);
        if (path === '/bookmarks/toggle') return handleToggleBookmark(req);
        if (path === '/close-file') return handleCloseFile(req);
        if (path === '/dict/sync') return handleDictSync();
      }

      return new Response('Not found', { status: 404 });
    },
  });
}
