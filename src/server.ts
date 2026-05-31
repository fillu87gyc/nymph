import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { diffArrays } from 'diff';

function resolveAppVersion(): string {
  try {
    return execSync(
      'git describe --tags --exact-match HEAD 2>/dev/null || git rev-parse --short HEAD',
      { encoding: 'utf-8' },
    ).trim();
  } catch {
    return 'unknown';
  }
}

const APP_VERSION = resolveAppVersion();

interface State {
  filePaths: string[];
  activeFile: string | null;
  commentsPath: string | null;
  cachedContent: string | null;
  checkpointContent: string | null;
  droppedContent: string | null;
  droppedName: string | null;
}

const state: State = {
  filePaths: [],
  activeFile: null,
  commentsPath: null,
  cachedContent: null,
  checkpointContent: null,
  droppedContent: null,
  droppedName: null,
};

export function initState(paths: string[]) {
  state.filePaths = paths;
  if (paths.length > 0) {
    state.activeFile = paths[0];
    state.commentsPath = `${paths[0]}.comments.json`;
  }
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

function handleContent(url: URL): Response {
  const fileParam = url.searchParams.get('file');
  const allowed = new Set(activePaths());

  if (fileParam && !allowed.has(fileParam)) return err('Forbidden', 403);

  const target = fileParam ?? state.activeFile;
  try {
    if (target) {
      const text = readFileSync(target, 'utf-8');
      state.cachedContent = text;
      return json({
        content: text,
        filename: basename(target),
        mtime: statSync(target).mtimeMs,
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
  const paths = activePaths();
  const encoder = new TextEncoder();
  const mtimes = new Map<string, number>();
  for (const p of paths) {
    try {
      mtimes.set(p, statSync(p).mtimeMs);
    } catch {
      mtimes.set(p, 0);
    }
  }

  let timer: ReturnType<typeof setInterval>;
  let pingTimer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(ctrl) {
      timer = setInterval(() => {
        for (const p of paths) {
          try {
            const mtime = statSync(p).mtimeMs;
            const prev = mtimes.get(p);
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
    state.checkpointContent = readFileSync(state.activeFile, 'utf-8');
    return json({
      ok: true,
      lines: state.checkpointContent.split('\n').length,
    });
  } catch (e) {
    return err(String(e));
  }
}

function handleDiff(): Response {
  try {
    if (!state.checkpointContent || !state.activeFile)
      return json({ lines: [] });
    const current = readFileSync(state.activeFile, 'utf-8');
    return json({ lines: computeDiff(state.checkpointContent, current) });
  } catch (e) {
    return err(String(e));
  }
}

function computeDiff(checkpoint: string, current: string) {
  const aLines = checkpoint.split('\n');
  const bLines = current.split('\n');
  const changes = diffArrays(aLines, bLines);
  const result: Array<{
    n: number | null;
    type: string;
    content: string;
    g: number | null;
  }> = [];
  let currentN = 0;
  let groupId = 0;
  let i = 0;

  while (i < changes.length) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const line of change.value) {
        currentN++;
        result.push({ n: currentN, type: 'equal', content: line, g: null });
      }
      i++;
    } else if (change.removed) {
      const next = changes[i + 1];
      if (next?.added) {
        for (const line of change.value)
          result.push({ n: null, type: 'delete', content: line, g: groupId });
        for (const line of next.value) {
          currentN++;
          result.push({
            n: currentN,
            type: 'insert',
            content: line,
            g: groupId,
          });
        }
        groupId++;
        i += 2;
      } else {
        for (const line of change.value)
          result.push({ n: null, type: 'delete', content: line, g: groupId });
        groupId++;
        i++;
      }
    } else {
      for (const line of change.value) {
        currentN++;
        result.push({ n: currentN, type: 'insert', content: line, g: groupId });
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
    ) as Array<{ ls: number; le: number }>;
    const editEnd = editLine + oldLineCount - 1;
    for (const c of comments) {
      if (c.ls > editEnd) {
        c.ls += delta;
        c.le += delta;
      } else if (c.le > editEnd) {
        c.le += delta;
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

export function createServer(port: number) {
  return Bun.serve({
    port,
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
        if (path === '/checkpoint') return handleSetCheckpoint();
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
        if (path === '/close-file') return handleCloseFile(req);
      }

      return new Response('Not found', { status: 404 });
    },
  });
}
