import { spawnSync } from 'node:child_process';
import {
  existsSync,
  type FSWatcher,
  watch as fsWatch,
  readFileSync,
  statSync,
} from 'node:fs';
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
import type { Comment } from './client/types.ts';
import { DROPPED_PATH } from './dropped.ts';
import { resolveFrontendUrl } from './frontendUrl.ts';
import { flattenMdFiles, scanMdTree } from './fsTree.ts';
import { checkLinkTargets } from './linkCheck.ts';
import { normalizePath } from './pathUtils.ts';
import { isRecentPath, listRecent, recordRecent } from './recent.ts';
import {
  incrementRound,
  readCheckpoint,
  readComments,
  readRound,
  writeCheckpoint,
  writeComments,
} from './reviewStore.ts';
import { searchFiles } from './search.ts';

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
  cachedContent: string | null;
  droppedContent: string | null;
  droppedName: string | null;
  /** ドロップ由来の擬似タブが選択中か（activeFile は直前の実ファイルを保つ）。 */
  droppedActive: boolean;
  rootDir: string | null;
}

const state: State = {
  filePaths: [],
  activeFile: null,
  cachedContent: null,
  droppedContent: null,
  droppedName: null,
  droppedActive: false,
  rootDir: null,
};

export function initState(paths: string[], rootDir: string | null = null) {
  state.filePaths = paths;
  state.activeFile = paths[0] ?? null;
  state.cachedContent = null;
  state.droppedContent = null;
  state.droppedName = null;
  state.droppedActive = false;
  state.rootDir = rootDir;
}

function activePaths(): string[] {
  return state.filePaths.length
    ? state.filePaths
    : state.activeFile
      ? [state.activeFile]
      : [];
}

/**
 * 実ファイル前提の処理（コメントの読み書き・チェックポイント・diff・
 * リンク検査）の対象ファイル。
 *
 * ドロップ由来の擬似タブを選択中はファイル実体が無いので「対象なし」を返す。
 * activeFile には直前まで開いていた実ファイルが残っているため、そのまま
 * フォールバックさせると画面に出ていないファイルを読み書きしてしまう。
 */
function activeRealFile(): string | null {
  return state.droppedActive ? null : state.activeFile;
}

export interface FileTabsState {
  paths: string[];
  activeFile: string | null;
  droppedName: string | null;
  droppedActive: boolean;
}

/**
 * /files が返すタブ一覧と選択中タブを決める。
 *
 * ドロップされたファイルは、実ファイルを開いているかどうかに関わらず擬似タブ
 * として末尾に並べる（並べないと、ファイルを開いた状態でのドロップが画面上の
 * どこにも現れず無視されたように見える）。実ファイルが1つも無い場合は
 * droppedActive に関係なく擬似タブが選択中になる（他に選べるものが無いため）。
 */
export function resolveFileTabs(s: FileTabsState): {
  files: { path: string; name: string }[];
  activeFile: string | null;
} {
  const files = s.paths.map((p) => ({ path: p, name: basename(p) }));
  if (s.droppedName) files.push({ path: DROPPED_PATH, name: s.droppedName });
  const droppedSelected =
    s.droppedName !== null && (s.droppedActive || s.activeFile === null);
  return {
    files,
    activeFile: droppedSelected ? DROPPED_PATH : s.activeFile,
  };
}

function filesPayload(): ReturnType<typeof resolveFileTabs> {
  return resolveFileTabs({
    paths: activePaths(),
    activeFile: state.activeFile,
    droppedName: state.droppedName,
    droppedActive: state.droppedActive,
  });
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

  const target = fileParam ?? activeRealFile();
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
  // fs.watch を主信号にし、mtime で「実際に内容が変わったか」を確認する。
  // 変化がないイベント（inotify のノイズ）や、同じ mtime での連続イベントを弾く。
  const mtimes = new Map<string, number>();
  const watchers = new Map<string, FSWatcher>();
  let closed = false;
  let dictMtime = 0;
  try {
    dictMtime = statSync(dictPath).mtimeMs;
  } catch {
    /* dict.json が存在しない場合はスキップ */
  }

  let syncTimer: ReturnType<typeof setInterval>;
  let pingTimer: ReturnType<typeof setInterval>;
  let dictWatcher: FSWatcher | undefined;
  let dictRetryTimer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    start(ctrl) {
      const emit = (data: object) => {
        // fs.watch のコールバックは Bun の I/O スレッドから呼ばれるため、
        // 直接 ctrl.enqueue するとメイン event loop での flush と競合し、
        // クライアントに届く前にストリームが閉じられることがある。
        // queueMicrotask で JS 側の event loop に載せてから enqueue する。
        queueMicrotask(() => {
          if (closed) return;
          try {
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            /* stream already closed */
          }
        });
      };

      const checkFile = (p: string) => {
        try {
          const mtime = statSync(p).mtimeMs;
          const prev = mtimes.get(p);
          // mtime 変化が無ければ何もしない（同一書き込みに対する複数 inotify
          // イベントや no-op イベントを filter）。
          if (prev !== undefined && mtime !== prev) {
            emit({ file: p });
          }
          mtimes.set(p, mtime);
        } catch {
          /* deleted or transiently unavailable — ignore */
        }
      };

      const attachWatcher = (p: string) => {
        if (watchers.has(p)) return;
        let currentMtime = 0;
        try {
          currentMtime = statSync(p).mtimeMs;
        } catch {
          // ファイルが存在しない・権限エラー等。sync tick で再挑戦する。
          return;
        }
        try {
          const w = fsWatch(p, (eventType) => {
            // 同期的にチェックする。デバウンスすると、SSE クライアントが
            // 再接続してこの接続が閉じたタイミングでイベントを取りこぼす。
            // mtime 比較で redundant なイベントは checkFile 内で filter される。
            checkFile(p);
            if (eventType === 'rename') {
              // temp+rename で書かれた場合、元 inode の watcher は死んでいるため
              // 再アタッチする（新しい inode を掴み直す）
              const old = watchers.get(p);
              old?.close();
              watchers.delete(p);
              setTimeout(() => {
                if (!closed && activePaths().includes(p)) attachWatcher(p);
              }, 30);
            }
          });
          w.on('error', () => {
            watchers.delete(p);
          });
          watchers.set(p, w);
          // アタッチ時に「配信済み mtime との差分」があれば emit する。
          // 例: /open-file でファイルが追加された直後、syncTimer が attach する
          // より前に外部から書き込まれたケース。ここで拾わないと fs.watch は
          // 以降の変化しか通知しないため、client が古い内容を握り続ける。
          //
          // servedMtimes は「そのファイルに対して直近で /content が返した
          // mtime」であり、client の握っている内容と一致する。ここでは属性値の
          // スナップショットとして 1 回だけ参照し、以降のイベント処理では
          // 使わない（イベント処理での fallback は、並行 /content 更新で
          // 変化なし判定になり誤検出する）。
          const served = servedMtimes.get(p);
          if (served !== undefined && served !== currentMtime) {
            emit({ file: p });
          }
          mtimes.set(p, currentMtime);
        } catch {
          // ファイルが存在しない・権限エラー等。sync tick で再挑戦する。
        }
      };

      const syncWatchers = () => {
        const active = new Set(activePaths());
        for (const p of active) attachWatcher(p);
        for (const [p, w] of watchers) {
          if (!active.has(p)) {
            w.close();
            watchers.delete(p);
            mtimes.delete(p);
          }
        }
        // fs.watch のイベントが取りこぼされたケース（Bun / OS レイヤーの race や、
        // クライアント再接続と emit の flush 競合）を拾うための安全網。
        // すべての active path を stat し、直前の mtime と違えば emit する。
        for (const p of active) checkFile(p);
      };

      const attachDictWatcher = () => {
        if (dictWatcher || closed) return;
        try {
          const w = fsWatch(dictPath, () => {
            try {
              const mtime = statSync(dictPath).mtimeMs;
              if (mtime !== dictMtime) {
                emit({ dictUpdated: true });
                dictMtime = mtime;
              }
            } catch {
              /* consumed by rename branch */
            }
          });
          w.on('error', () => {
            dictWatcher?.close();
            dictWatcher = undefined;
            if (!closed) dictRetryTimer = setTimeout(attachDictWatcher, 1000);
          });
          dictWatcher = w;
        } catch {
          // dict.json 未生成なら 1s 後に再試行
          if (!closed) dictRetryTimer = setTimeout(attachDictWatcher, 1000);
        }
      };

      syncWatchers();
      attachDictWatcher();

      // /open-file で追加された新パスを拾うため、低頻度で watcher 集合を同期する。
      // fs.watch そのものはネイティブ通知なので、ここでの stat は行わない。
      syncTimer = setInterval(syncWatchers, 2000);

      pingTimer = setInterval(() => {
        emit({});
      }, 1000);
    },
    cancel() {
      closed = true;
      clearInterval(syncTimer);
      clearInterval(pingTimer);
      if (dictRetryTimer) clearTimeout(dictRetryTimer);
      for (const w of watchers.values()) w.close();
      watchers.clear();
      dictWatcher?.close();
      dictWatcher = undefined;
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

  const target = fileParam ?? activeRealFile();
  if (!target) return json({ round: 0, comments: [] });
  try {
    return json({ round: readRound(target), comments: readComments(target) });
  } catch (e) {
    return err(String(e));
  }
}

async function handleSaveComments(req: Request, url: URL): Promise<Response> {
  const fileParam = url.searchParams.get('file');
  let target: string | null;
  if (fileParam) {
    const allowed = new Set(activePaths());
    if (!allowed.has(fileParam)) return err('Forbidden', 403);
    target = fileParam;
  } else {
    target = activeRealFile();
  }
  // 保存先が確定できない場合（ディレクトリモード起動直後で未選択、または
  // __dropped__ 表示中でファイル実体がない）はサイレントに 200 を返さず
  // 4xx にしてクライアントに保存失敗を伝える。
  if (!target) return err('保存先のファイルが確定できません', 400);
  try {
    const body = (await req.json()) as Comment[];
    writeComments(target, body);
    return json({});
  } catch (e) {
    return err(String(e));
  }
}

function handleFiles(): Response {
  return json(filesPayload());
}

async function handleSetActiveFile(req: Request): Promise<Response> {
  try {
    const { path } = (await req.json()) as { path: string };
    // ドロップ由来の擬似タブへの切り替え。実ファイルの activeFile は
    // 「擬似タブを閉じたときの戻り先」として残す。
    if (path === DROPPED_PATH) {
      if (!state.droppedName) return json({ error: 'invalid path' }, 400);
      state.droppedActive = true;
      return json(filesPayload());
    }
    const allowed = new Set(activePaths());
    if (!path || !allowed.has(path))
      return json({ error: 'invalid path' }, 400);
    state.activeFile = path;
    state.droppedActive = false;
    return json(filesPayload());
  } catch (e) {
    return err(String(e));
  }
}

async function handleCloseFile(req: Request): Promise<Response> {
  try {
    const { path } = (await req.json()) as { path: string };
    if (path === DROPPED_PATH) {
      state.droppedContent = null;
      state.droppedName = null;
      state.droppedActive = false;
      return json(filesPayload());
    }
    const idx = state.filePaths.indexOf(path);
    if (idx === -1) return json({ error: 'not found' }, 404);
    state.filePaths.splice(idx, 1);
    if (state.activeFile === path) {
      const next = state.filePaths[idx] ?? state.filePaths[idx - 1] ?? null;
      state.activeFile = next;
    }
    return json(filesPayload());
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

// OS ネイティブのファイル/フォルダ選択ダイアログを起動して選択パスを返す。
// キャンセル時は path: null（エラーではない）。未対応 OS ではエラーを返す。
function runOsascript(
  script: string,
): { ok: true; value: string } | { ok: false } {
  const res = spawnSync('osascript', ['-e', script], { encoding: 'utf-8' });
  if (res.status === 0) return { ok: true, value: res.stdout.trim() };
  return { ok: false };
}

const CANCELED = '__NYMPH_DIALOG_CANCELED__';

function runPowerShellDialog(
  kind: 'file' | 'dir',
): { ok: true; value: string } | { ok: false } {
  const script =
    kind === 'dir'
      ? `Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath } else { Write-Output '${CANCELED}' }`
      : `Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Filter = 'Markdown files (*.md)|*.md'
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.FileName } else { Write-Output '${CANCELED}' }`;
  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    { encoding: 'utf-8' },
  );
  const out = (res.stdout ?? '').trim();
  if (res.status === 0 && out && out !== CANCELED)
    return { ok: true, value: out };
  return { ok: false };
}

function pickNativePath(
  kind: 'file' | 'dir',
): { path: string | null } | { error: string } {
  if (process.platform === 'darwin') {
    const script =
      kind === 'dir'
        ? 'POSIX path of (choose folder)'
        : 'POSIX path of (choose file)';
    const res = runOsascript(script);
    return { path: res.ok ? res.value : null };
  }
  if (process.platform === 'win32') {
    const res = runPowerShellDialog(kind);
    return { path: res.ok ? res.value : null };
  }
  return { error: 'このOSではネイティブダイアログに対応していません' };
}

function handlePickDir(): Response {
  const result = pickNativePath('dir');
  if ('error' in result) return json({ error: result.error }, 501);
  return json({ path: result.path });
}

function handlePickFile(): Response {
  const result = pickNativePath('file');
  if ('error' in result) return json({ error: result.error }, 501);
  return json({ path: result.path });
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

// 全文検索の対象: 開いているタブ + ツリー（rootDir）配下の .md。
// タブを先に並べて「開いているファイルの一致が上位に出る」ようにする。
function collectSearchPaths(): string[] {
  const seen = new Set<string>(activePaths());
  if (state.rootDir) {
    for (const p of flattenMdFiles(scanMdTree(state.rootDir))) seen.add(p);
  }
  return [...seen];
}

function handleSearch(url: URL): Response {
  const query = (url.searchParams.get('q') ?? '').trim();
  if (!query) return json({ query, results: [], truncated: false });
  try {
    const { results, truncated } = searchFiles(collectSearchPaths(), query);
    return json({ query, results, truncated });
  } catch (e) {
    return err(String(e));
  }
}

/**
 * 本文中の相対リンクが実在するかを返す（「リンク / 画像」ウィジェット用）。
 *
 * 基準は開いているファイルのディレクトリ。判定してよい範囲はルートが
 * あればルート配下、無ければ基準ディレクトリ配下で、外に出る行き先は
 * exists: null（未確認）を返す。任意パスの存在を答える窓口にはしない。
 */
async function handleLinkCheck(req: Request): Promise<Response> {
  try {
    const { targets } = (await req.json()) as { targets?: unknown };
    if (!Array.isArray(targets)) return json({ error: 'invalid targets' }, 400);
    // ドロップ由来の擬似タブにはファイル実体（＝相対リンクの基準ディレクトリ）
    // が無いため、判定せず未確認扱いにする。
    const target = activeRealFile();
    if (!target) return json({ results: [] });
    const baseDir = dirname(target);
    const results = checkLinkTargets(
      targets.filter((t): t is string => typeof t === 'string'),
      baseDir,
      state.rootDir ?? baseDir,
    );
    return json({ results });
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
    const abs = normalizePath(path);
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
    // symlink 経由でも実体パスに正規化し、既に開いているファイルと同一視する
    const abs = normalizePath(path);
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
    state.droppedActive = false;
    recordRecent([abs]);
    return json(filesPayload());
  } catch (e) {
    return err(String(e));
  }
}

/**
 * ブラウザへドロップされた .md を受け取る。
 *
 * ファイル実体を持たない「ドロップ由来の擬似タブ」として保持し、そのまま
 * 選択状態にする（実ファイルを開いていてもタブが増えて中身が切り替わる）。
 * 保持できるドロップは1つで、続けてドロップすると擬似タブの中身が入れ替わる。
 */
async function handleSwitchFile(req: Request): Promise<Response> {
  try {
    const { content, filename } = (await req.json()) as {
      content: string;
      filename: string;
    };
    if (typeof content !== 'string' || typeof filename !== 'string')
      return json({ error: 'invalid payload' }, 400);
    state.droppedContent = content;
    state.droppedName = filename;
    state.droppedActive = true;
    return json(filesPayload());
  } catch (e) {
    return err(String(e));
  }
}

function handleSetCheckpoint(): Response {
  try {
    const target = activeRealFile();
    if (!target) return json({ ok: true, lines: 0 });
    const content = readFileSync(target, 'utf-8');
    writeCheckpoint(target, content);
    // チェックポイント設定は「ラウンド境界」。以降に作られるコメントへ
    // 記録される round をここで進める。
    const round = incrementRound(target);
    return json({
      ok: true,
      lines: content.split('\n').length,
      round,
    });
  } catch (e) {
    return err(String(e));
  }
}

function handleDiff(): Response {
  try {
    const target = activeRealFile();
    if (!target) return json({ lines: [], hasCheckpoint: false });
    const checkpoint = readCheckpoint(target);
    if (checkpoint === null) return json({ lines: [], hasCheckpoint: false });
    const current = readFileSync(target, 'utf-8');
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

/**
 * 編集による行番号のずれをコメントへ反映する（破壊的更新）。
 *
 * 編集範囲より後ろにあるコメントは全体を delta 行ずらし、編集範囲をまたぐ
 * コメントは終端だけを伸縮させる。もとの文章スナップショットの行番号も
 * lineStart と一緒にずらす（ずらさないと、コメントの行表示と吹き出しの
 * 行番号が食い違って見えるため）。
 */
export function remapCommentLines(
  comments: Comment[],
  editLine: number,
  oldLineCount: number,
  delta: number,
): void {
  const editEnd = editLine + oldLineCount - 1;
  for (const c of comments) {
    if (c.lineStart > editEnd) {
      c.lineStart += delta;
      c.lineEnd += delta;
      if (c.snapshot) {
        c.snapshot.startLine = Math.max(1, c.snapshot.startLine + delta);
      }
    } else if (c.lineEnd > editEnd) {
      c.lineEnd += delta;
    }
  }
}

function remapComments(editLine: number, oldLineCount: number, delta: number) {
  if (!state.activeFile) return;
  try {
    const comments = readComments(state.activeFile);
    if (comments.length === 0) return;
    remapCommentLines(comments, editLine, oldLineCount, delta);
    writeComments(state.activeFile, comments);
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
// LAN 共有は認証機構が無い以上意図的に提供しない（意図せず公開されるリスクの方が大きい）。
export const SERVER_HOSTNAME = '127.0.0.1';

export function createServer(port: number) {
  // 後から `nymph <file>` を実行した CLI が「開くべき URL」を問い合わせられる
  // よう、このインスタンスのフロント URL を /version で公開する。
  const frontendUrl = resolveFrontendUrl(port, process.env.NYMPH_FRONTEND_URL);

  return Bun.serve({
    port,
    hostname: SERVER_HOSTNAME,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      if (req.method === 'GET') {
        if (path === '/version')
          return json({ nymph: true, version: APP_VERSION, frontendUrl });
        if (path === '/content') return handleContent(url);
        if (path === '/watch') return handleWatch();
        if (path === '/comments') return handleGetComments(url);
        if (path === '/diff') return handleDiff();
        if (path === '/files') return handleFiles();
        if (path === '/recent') return handleRecent();
        if (path === '/search') return handleSearch(url);
        if (path === '/tree') return handleTree();
        if (path === '/bookmarks') return handleBookmarks();
        if (path === '/checkpoint') return handleSetCheckpoint();
        if (path === '/dict') return handleGetDict();
        const staticResp = serveStatic(url);
        if (staticResp) return staticResp;
        return new Response('Not found', { status: 404 });
      }

      if (req.method === 'POST') {
        if (path === '/comments') return handleSaveComments(req, url);
        if (path === '/edit-op') return handleEditOp(req);
        if (path === '/checkpoint') return handleSetCheckpoint();
        if (path === '/switch-file') return handleSwitchFile(req);
        if (path === '/active-file') return handleSetActiveFile(req);
        if (path === '/open-file') return handleOpenFile(req);
        if (path === '/open-dir') return handleOpenDir(req);
        if (path === '/pick-file') return handlePickFile();
        if (path === '/pick-dir') return handlePickDir();
        if (path === '/bookmarks/toggle') return handleToggleBookmark(req);
        if (path === '/link-check') return handleLinkCheck(req);
        if (path === '/close-file') return handleCloseFile(req);
        if (path === '/dict/sync') return handleDictSync();
      }

      return new Response('Not found', { status: 404 });
    },
  });
}
