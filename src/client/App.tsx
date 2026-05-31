import { use, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CommentModal } from './components/CommentModal.tsx';
import { CommentsPanel } from './components/CommentsPanel.tsx';
import { ConfirmModal } from './components/ConfirmModal.tsx';
import { ContentArea } from './components/ContentArea.tsx';
import { DrawioModal } from './components/DrawioModal.tsx';
import { SelectionPopup } from './components/SelectionPopup.tsx';
import { Toast } from './components/Toast.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { useComments } from './hooks/useComments.ts';
import { useConnectionStatus } from './hooks/useConnectionStatus.ts';
import { useDiff } from './hooks/useDiff.ts';
import { useFiles } from './hooks/useFiles.ts';
import { useSSE } from './hooks/useSSE.ts';
import { ctxDisplay } from './lib/comments.ts';
import { highlightSelectionText } from './lib/markdown.ts';
import type { Comment, PendingComment } from './types.ts';

const HLJS_DARK =
  'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/base16/gruvbox-dark-medium.min.css';
const HLJS_LIGHT =
  'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/base16/gruvbox-light-medium.min.css';

const versionPromise = fetch('/version')
  .then((r) => r.json())
  .then((d: { version: string }) => d.version)
  .catch(() => '');

export function App() {
  const appVersion = use(versionPromise);
  const [source, setSource] = useState('');
  const [updateTime, setUpdateTime] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastState, setToastState] = useState({ msg: '', v: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState('ファイルを読み込んでいます…');
  const [hljsTheme, setHljsTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('nymph-theme');
    const theme = saved === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    return theme;
  });
  const [highlightedBlockLs, setHighlightedBlockLs] = useState<number | null>(
    null,
  );
  const [anchorPopup, setAnchorPopup] = useState<{
    comment: Comment;
    x: number;
    y: number;
  } | null>(null);
  const { isConnected } = useConnectionStatus();

  // Modal state
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [pending, setPending] = useState<PendingComment | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDisplayCtx, setEditingDisplayCtx] = useState('');
  const [editingInitialText, setEditingInitialText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawioOpen, setDrawioOpen] = useState(false);
  const [drawioCode, setDrawioCode] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const blockRefsMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const {
    comments,
    nextId,
    loadComments,
    addComment,
    updateComment,
    deleteComment,
    clearAll,
  } = useComments();
  const { files, activeFile, setActiveFile, loadFiles, switchFile, closeFile } =
    useFiles();
  const {
    diffMode,
    diffData,
    checkpointSet,
    setCheckpoint,
    toggleDiff,
    loadDiff,
  } = useDiff();

  function toast(msg: string) {
    setToastState((s) => ({ msg, v: s.v + 1 }));
  }

  const loadContent = useCallback(async (filePath?: string | null) => {
    const url = filePath
      ? `/content?file=${encodeURIComponent(filePath)}`
      : '/content';
    try {
      const res = await fetch(url);
      const { content, filename } = await res.json();
      if (filename === null) {
        setWelcomeMsg('.md ファイルをここにドロップ');
      }
      setSource(content);
      const now = new Date().toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setUpdateTime(`更新: ${now}`);
    } catch {
      /* ignore */
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      await loadContent();
      await loadComments();
      await loadFiles();
    })();
  }, [loadComments, loadContent, loadFiles]);

  // SSE
  useSSE((changedFile) => {
    if (!changedFile || !activeFile) return;
    if (changedFile === activeFile) {
      void (async () => {
        await loadContent(activeFile);
        await loadComments();
        if (diffMode) await loadDiff();
        toast('ファイルが更新されました');
      })();
    }
  });

  function handleToggleTheme() {
    const next = hljsTheme === 'light' ? 'dark' : 'light';
    setHljsTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('nymph-theme', next);
    setSource((s) => `${s}`);
  }

  useEffect(() => {
    if (!anchorPopup) return;
    function close(e: MouseEvent) {
      const popup = document.getElementById('anchor-comment-popup');
      if (popup?.contains(e.target as Node)) return;
      setAnchorPopup(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [anchorPopup]);

  function handleClickCommentAnchor(c: Comment, x: number, y: number) {
    setAnchorPopup({ comment: c, x, y });
  }

  const flashBlockHighlight = useCallback((ls: number) => {
    setHighlightedBlockLs(ls);
    setTimeout(
      () => setHighlightedBlockLs((prev) => (prev === ls ? null : prev)),
      1400,
    );
  }, []);

  const scrollToComment = useCallback(
    (c: Comment) => {
      const map = blockRefsMapRef.current;
      let targetEl: HTMLElement | null = null;
      const blocksInRange: HTMLElement[] = [];

      for (const el of map.values()) {
        const bls = +(el.dataset.ls ?? 0);
        const ble = +(el.dataset.le ?? 0);
        if (bls === c.ls) targetEl = el;
        if (bls <= c.le && ble >= c.ls) blocksInRange.push(el);
      }

      if (!targetEl) return;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (c.block_type === 'selection' && typeof c.context === 'string') {
        highlightSelectionText(
          blocksInRange,
          c.ls,
          c.le,
          c.context,
          c.selection_offset ?? null,
          flashBlockHighlight,
        );
      } else {
        flashBlockHighlight(c.ls);
      }
    },
    [flashBlockHighlight],
  );

  // Comment modal
  function openCommentModal(
    ls: number,
    le: number,
    displayCtx: string,
    blockType: string,
    context: any,
    selectionOffset: number | null,
  ) {
    setPending({
      ls,
      le,
      block_type: blockType,
      context,
      selection_offset: selectionOffset,
    });
    setEditingId(null);
    setEditingDisplayCtx(displayCtx);
    setEditingInitialText('');
    setCommentModalOpen(true);
  }

  function openEditModal(c: Comment) {
    setPending({
      ls: c.ls,
      le: c.le,
      block_type: c.block_type,
      context: c.context,
      selection_offset: c.selection_offset ?? null,
    });
    setEditingId(c.id);
    setEditingDisplayCtx(ctxDisplay(c));
    setEditingInitialText(c.text);
    setCommentModalOpen(true);
  }

  function handleCommentSubmit(text: string) {
    if (!pending) return;
    setCommentModalOpen(false);
    if (editingId !== null) {
      updateComment(editingId, text);
      toast('コメントを更新しました');
    } else {
      addComment(pending, text, nextId);
      setPanelOpen(true);
      toast('コメントを追加しました');
    }
    setPending(null);
    setEditingId(null);
  }

  function handleSelectionComment(
    ls: number,
    le: number,
    ctx: string,
    selectionOffset: number | null,
  ) {
    setPending({
      ls,
      le,
      block_type: 'selection',
      context: ctx,
      selection_offset: selectionOffset,
    });
    setEditingId(null);
    setEditingDisplayCtx(ctx);
    setEditingInitialText('');
    setCommentModalOpen(true);
  }

  // Copy review
  function copyReview() {
    if (!comments.length) {
      toast('コメントがありません');
      return;
    }
    const payload = {
      date: new Date().toLocaleDateString('ja-JP'),
      file: activeFile ? activeFile.split('/').pop() : '—',
      comment_count: comments.length,
      comments: comments.map((c, i) => ({
        id: i + 1,
        line_start: c.ls,
        line_end: c.le,
        block_type: c.block_type || 'unknown',
        context: c.context,
        comment: c.text,
      })),
    };
    const out = JSON.stringify(payload, null, 2);
    navigator.clipboard
      .writeText(out)
      .then(() => toast('レビューをコピーしました'))
      .catch(() => toast('クリップボードへのコピーに失敗しました'));
  }

  // Clear all
  function handleClearAll() {
    if (!comments.length) {
      toast('コメントがありません');
      return;
    }
    setConfirmOpen(true);
  }
  function confirmClearAll() {
    clearAll();
    setConfirmOpen(false);
    setPanelOpen(false);
    toast('コメントをすべて削除しました');
  }

  // Checkpoint
  async function handleCheckpoint() {
    const lines = await setCheckpoint();
    toast(`チェックポイントを設定しました（${lines}行）`);
  }

  // Switch file
  async function handleSwitchFile(path: string) {
    await switchFile(path);
    await loadContent(path);
    await loadComments();
  }

  // Close file
  async function handleCloseFile(path: string) {
    const next = await closeFile(path);
    await loadContent(next ?? undefined);
    await loadComments();
  }

  // Drag & drop
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.relatedTarget || !document.body.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!file.name.endsWith('.md')) {
      toast('Markdownファイルをドロップしてください');
      return;
    }
    try {
      const content = await file.text();
      await fetch('/switch-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename: file.name }),
      });
      await loadContent();
      await loadComments();
      await loadFiles();
    } catch (err: any) {
      toast(err.message || 'ファイルの読み込みに失敗しました');
    }
  }

  return (
    <div
      id="app"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        void handleDrop(e);
      }}
    >
      {createPortal(
        <link
          rel="stylesheet"
          href={hljsTheme === 'dark' ? HLJS_DARK : HLJS_LIGHT}
        />,
        document.head,
      )}
      {isDragging && <div id="drop-overlay">📂 .md ファイルをドロップ</div>}
      <Toolbar
        version={appVersion}
        updateTime={updateTime}
        commentCount={comments.length}
        diffMode={diffMode}
        checkpointSet={checkpointSet}
        isConnected={isConnected}
        files={files}
        activeFile={activeFile}
        onTogglePanel={() => setPanelOpen((o) => !o)}
        onCopyReview={copyReview}
        onClearAll={handleClearAll}
        onCheckpoint={handleCheckpoint}
        onToggleDiff={toggleDiff}
        onToggleTheme={handleToggleTheme}
        onSwitchFile={handleSwitchFile}
        onCloseFile={handleCloseFile}
      />
      <div id="main">
        <ContentArea
          source={source}
          comments={comments}
          diffMode={diffMode}
          diffData={diffData}
          isDarkTheme={hljsTheme === 'dark'}
          highlightedBlockLs={highlightedBlockLs}
          onAddComment={openCommentModal}
          onOpenDrawio={(code) => {
            setDrawioCode(code);
            setDrawioOpen(true);
          }}
          onClickCommentAnchor={handleClickCommentAnchor}
          contentRef={contentRef}
          blockRefsMapRef={blockRefsMapRef}
          welcomeMsg={welcomeMsg}
        />
      </div>
      <CommentsPanel
        open={panelOpen}
        comments={comments}
        onScrollToComment={scrollToComment}
        onEdit={openEditModal}
        onDelete={deleteComment}
        onClose={() => setPanelOpen(false)}
      />
      <CommentModal
        open={commentModalOpen}
        pending={pending}
        editingId={editingId}
        displayCtx={editingDisplayCtx}
        initialText={editingInitialText}
        onSubmit={handleCommentSubmit}
        onClose={() => {
          setCommentModalOpen(false);
          setPending(null);
          setEditingId(null);
        }}
      />
      <ConfirmModal
        open={confirmOpen}
        onConfirm={confirmClearAll}
        onClose={() => setConfirmOpen(false)}
      />
      <DrawioModal
        open={drawioOpen}
        code={drawioCode}
        onClose={() => {
          setDrawioOpen(false);
          setDrawioCode(null);
        }}
        onToast={toast}
      />
      <SelectionPopup
        contentRef={contentRef}
        onComment={handleSelectionComment}
      />
      {anchorPopup &&
        createPortal(
          <div
            id="anchor-comment-popup"
            style={{
              left: Math.min(anchorPopup.x, window.innerWidth - 290),
              top: Math.min(anchorPopup.y + 20, window.innerHeight - 180),
            }}
          >
            <div className="acp-text">{anchorPopup.comment.text}</div>
            <div className="acp-foot">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  openEditModal(anchorPopup.comment);
                  setAnchorPopup(null);
                }}
              >
                ✎ 編集
              </button>
              <button
                type="button"
                className="btn icon acp-del"
                title="削除"
                onClick={() => {
                  deleteComment(anchorPopup.comment.id);
                  setAnchorPopup(null);
                }}
              >
                🗑
              </button>
              <button
                type="button"
                className="btn icon"
                onClick={() => setAnchorPopup(null)}
              >
                ✕
              </button>
            </div>
          </div>,
          document.body,
        )}
      <Toast message={toastState.msg} version={toastState.v} />
    </div>
  );
}
