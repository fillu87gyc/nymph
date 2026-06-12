import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSWRConfig } from 'swr';
import styles from './App.module.css';
import { CommentModal } from './components/CommentModal.tsx';
import { CommentsPanel } from './components/CommentsPanel.tsx';
import { ConfirmModal, type DeleteMode } from './components/ConfirmModal.tsx';
import { ContentArea } from './components/ContentArea.tsx';
import { DictTooltip } from './components/DictTooltip.tsx';
import { type DiffHighlightTarget, DiffView } from './components/DiffView.tsx';
import { DrawioModal } from './components/DrawioModal.tsx';
import { SelectionPopup } from './components/SelectionPopup.tsx';
import { Toast } from './components/Toast.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { useComments } from './hooks/useComments.ts';
import { useConnectionStatus } from './hooks/useConnectionStatus.ts';
import { useContent } from './hooks/useContent.ts';
import { useDict } from './hooks/useDict.ts';
import { useDiff } from './hooks/useDiff.ts';
import { useFiles } from './hooks/useFiles.ts';
import { useRecent } from './hooks/useRecent.ts';
import { useSSE } from './hooks/useSSE.ts';
import { ctxDisplay, isDiffContext } from './lib/comments.ts';
import { highlightSelectionText } from './lib/markdown.ts';
import { applyTermHighlights } from './lib/termHighlight.ts';
import type { Comment, DictEntry, PendingComment } from './types.ts';

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
  const { mutate } = useSWRConfig();
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastState, setToastState] = useState({ msg: '', v: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hljsTheme, setHljsTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('nymph-theme');
    const theme = saved === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    return theme;
  });
  const [highlightedBlockLs, setHighlightedBlockLs] = useState<number | null>(
    null,
  );
  const [blockOrphanIds, setBlockOrphanIds] = useState<Set<number>>(new Set());
  const [diffHighlight, setDiffHighlight] =
    useState<DiffHighlightTarget | null>(null);
  const [anchorPopup, setAnchorPopup] = useState<{
    comment: Comment;
    x: number;
    y: number;
  } | null>(null);
  const { isConnected } = useConnectionStatus();

  // Dict state
  const { entries: dictEntries, revalidate: revalidateDict } = useDict();
  const [isDictSyncing, setIsDictSyncing] = useState(false);
  const [dictTooltipEntry, setDictTooltipEntry] = useState<DictEntry | null>(
    null,
  );
  const [dictTooltipRect, setDictTooltipRect] = useState<DOMRect | null>(null);

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
    addComment,
    updateComment,
    deleteComment,
    clearAll,
    clearOrphaned,
  } = useComments();
  const { files, activeFile, switchFile, closeFile, openFile } = useFiles();
  const { recentFiles } = useRecent();
  const [recentOpen, setRecentOpen] = useState(false);
  const { source, updateTime, welcomeMsg, contentKey } = useContent(activeFile);
  const {
    diffMode,
    diffData,
    checkpointSet,
    setCheckpoint,
    toggleDiff,
    showDiff,
    loadDiff,
  } = useDiff();

  // checkpoint はファイルに永続化されているため、リロード後・ファイル切替後に
  // /diff を引いてボタン状態（と差分コメントの orphan 判定材料）を復元する
  useEffect(() => {
    if (activeFile) void loadDiff();
  }, [activeFile, loadDiff]);

  // 差分コメント（block_type: 'diff'）の orphan 判定。
  // 現在の diff に side + 行番号 + 行内容が一致する行がなければ「削除済み」扱い。
  // diff 未取得（null）の間は判定しない。
  const diffOrphanIds = useMemo(() => {
    const ids = new Set<number>();
    if (!diffData) return ids;
    for (const c of comments) {
      if (c.block_type !== 'diff') continue;
      if (!isDiffContext(c.context)) {
        ids.add(c.id);
        continue;
      }
      const ctx = c.context;
      const line = ctx.side === 'old' ? ctx.oldLine : ctx.newLine;
      const matched =
        line != null &&
        diffData.lines.some((l) =>
          ctx.side === 'old'
            ? l.o === line && l.content === ctx.line
            : l.n === line && l.content === ctx.line,
        );
      if (!matched) ids.add(c.id);
    }
    return ids;
  }, [comments, diffData]);

  const orphanedCommentIds = useMemo(
    () => new Set([...blockOrphanIds, ...diffOrphanIds]),
    [blockOrphanIds, diffOrphanIds],
  );

  function toast(msg: string) {
    setToastState((s) => ({ msg, v: s.v + 1 }));
  }

  // SSE: ファイル変更と dict 更新を処理
  useSSE((changedFile, dictUpdated) => {
    if (dictUpdated) {
      revalidateDict();
      return;
    }
    if (!changedFile || !activeFile) return;
    if (changedFile === activeFile) {
      void mutate(contentKey);
      void mutate('/comments');
      // 通常モードでも diff を取り直す（差分コメントの orphan 判定が古くならないように）
      void loadDiff();
      toast('ファイルが更新されました');
    }
  });

  // content が更新されたら term ハイライトを再適用
  // （diffMode から通常モードへ戻ると ContentArea が再マウントされるため依存に含める）
  useEffect(() => {
    if (diffMode || !contentRef.current || dictEntries.length === 0) return;
    // DOM 更新後に実行
    const id = requestAnimationFrame(() => {
      if (contentRef.current) {
        applyTermHighlights(contentRef.current, dictEntries);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [source, dictEntries, diffMode]);

  // mark ホバーでツールチップを表示
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    function onMouseEnter(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'MARK' || !target.hasAttribute('data-dict-term'))
        return;
      const termName = target.getAttribute('data-dict-term') ?? '';
      const entry = dictEntries.find((en) => en.term === termName) ?? null;
      setDictTooltipEntry(entry);
      setDictTooltipRect(target.getBoundingClientRect());
    }

    function onMouseLeave(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'MARK' || !target.hasAttribute('data-dict-term'))
        return;
      setDictTooltipEntry(null);
      setDictTooltipRect(null);
    }

    container.addEventListener('mouseover', onMouseEnter);
    container.addEventListener('mouseout', onMouseLeave);
    return () => {
      container.removeEventListener('mouseover', onMouseEnter);
      container.removeEventListener('mouseout', onMouseLeave);
    };
  }, [dictEntries]);

  async function handleDictSync() {
    setIsDictSyncing(true);
    try {
      await fetch('/dict/sync', { method: 'POST' });
      revalidateDict();
    } finally {
      setIsDictSyncing(false);
    }
  }

  function handleToggleTheme() {
    const next = hljsTheme === 'light' ? 'dark' : 'light';
    setHljsTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('nymph-theme', next);
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

  const flashBlockHighlight = useCallback((lineStart: number) => {
    setHighlightedBlockLs(lineStart);
    setTimeout(
      () => setHighlightedBlockLs((prev) => (prev === lineStart ? null : prev)),
      1400,
    );
  }, []);

  const scrollToComment = useCallback(
    (c: Comment) => {
      // 差分への指摘: 差分チェックモードへ切り替えて該当行をハイライト
      if (c.block_type === 'diff') {
        if (!isDiffContext(c.context)) return;
        const ctx = c.context;
        const line = ctx.side === 'old' ? ctx.oldLine : ctx.newLine;
        if (line == null) return;
        void showDiff();
        setDiffHighlight((prev) => ({
          side: ctx.side,
          line,
          v: (prev?.v ?? 0) + 1,
        }));
        return;
      }

      const map = blockRefsMapRef.current;
      let targetEl: HTMLElement | null = null;
      const blocksInRange: HTMLElement[] = [];

      for (const el of map.values()) {
        const blockLineStart = +(el.dataset.lineStart ?? 0);
        const blockLineEnd = +(el.dataset.lineEnd ?? 0);
        if (blockLineStart === c.lineStart) targetEl = el;
        if (blockLineStart <= c.lineEnd && blockLineEnd >= c.lineStart)
          blocksInRange.push(el);
      }

      if (!targetEl) return;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (c.block_type === 'selection' && typeof c.context === 'string') {
        highlightSelectionText(
          blocksInRange,
          c.lineStart,
          c.lineEnd,
          c.context,
          c.selection_offset ?? null,
          flashBlockHighlight,
        );
      } else {
        flashBlockHighlight(c.lineStart);
      }
    },
    [flashBlockHighlight, showDiff],
  );

  // Comment modal
  function openCommentModal(
    lineStart: number,
    lineEnd: number,
    displayCtx: string,
    blockType: string,
    context: Comment['context'],
    selectionOffset: number | null,
  ) {
    setPending({
      lineStart,
      lineEnd,
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
      lineStart: c.lineStart,
      lineEnd: c.lineEnd,
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
      addComment(pending, text);
      setPanelOpen(true);
      toast('コメントを追加しました');
    }
    setPending(null);
    setEditingId(null);
  }

  function handleSelectionComment(
    lineStart: number,
    lineEnd: number,
    ctx: string,
    selectionOffset: number | null,
  ) {
    setPending({
      lineStart,
      lineEnd,
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
        line_start: c.lineStart,
        line_end: c.lineEnd,
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

  // Clear comments
  function handleClearAll() {
    if (!comments.length) {
      toast('コメントがありません');
      return;
    }
    setConfirmOpen(true);
  }

  function confirmAction(mode: DeleteMode) {
    if (mode === 'all') {
      clearAll();
      setPanelOpen(false);
      toast('コメントをすべて削除しました');
    } else {
      const count = orphanedCommentIds.size;
      clearOrphaned(orphanedCommentIds);
      toast(`削除済みコメントを${count}件削除しました`);
    }
    setConfirmOpen(false);
  }

  // Checkpoint
  async function handleCheckpoint() {
    const lines = await setCheckpoint();
    toast(`チェックポイントを設定しました（${lines}行）`);
  }

  // Switch file
  async function handleSwitchFile(path: string) {
    await switchFile(path);
    await mutate('/comments');
  }

  // 履歴などタブ外からファイルを開く
  const handleOpenFile = useCallback(
    async (path: string) => {
      try {
        await openFile(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        toast(message || 'ファイルを開けませんでした');
      }
    },
    [openFile],
  );

  // ショートカット: Ctrl/Cmd+R で履歴メニューを開く（ブラウザのリロードを抑止）
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setRecentOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close file
  async function handleCloseFile(path: string) {
    await closeFile(path);
    await mutate('/comments');
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
      await mutate('/files');
      await mutate('/comments');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast(message || 'ファイルの読み込みに失敗しました');
    }
  }

  return (
    <div
      id="app"
      className={styles.app}
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
      {isDragging && (
        <div id="drop-overlay" className={styles.dropOverlay}>
          📂 .md ファイルをドロップ
        </div>
      )}
      <Toolbar
        version={appVersion}
        updateTime={updateTime}
        commentCount={comments.length}
        diffMode={diffMode}
        checkpointSet={checkpointSet}
        isConnected={isConnected}
        files={files}
        activeFile={activeFile}
        recentFiles={recentFiles}
        recentOpen={recentOpen}
        onToggleRecent={setRecentOpen}
        onOpenFile={(path) => void handleOpenFile(path)}
        onTogglePanel={() => setPanelOpen((o) => !o)}
        onCopyReview={copyReview}
        onClearAll={handleClearAll}
        onCheckpoint={handleCheckpoint}
        onToggleDiff={toggleDiff}
        onToggleTheme={handleToggleTheme}
        onSwitchFile={handleSwitchFile}
        onCloseFile={handleCloseFile}
        onDictSync={handleDictSync}
        isDictSyncing={isDictSyncing}
      />
      <div id="main" className={styles.main}>
        {diffMode ? (
          <DiffView
            diffData={diffData}
            comments={comments}
            highlightTarget={diffHighlight}
            onAddComment={openCommentModal}
            onClickCommentAnchor={handleClickCommentAnchor}
          />
        ) : (
          <ContentArea
            source={source}
            comments={comments}
            isDarkTheme={hljsTheme === 'dark'}
            highlightedBlockLs={highlightedBlockLs}
            onAddComment={openCommentModal}
            onOpenDrawio={(code) => {
              setDrawioCode(code);
              setDrawioOpen(true);
            }}
            onClickCommentAnchor={handleClickCommentAnchor}
            onOrphanedIds={setBlockOrphanIds}
            contentRef={contentRef}
            blockRefsMapRef={blockRefsMapRef}
            welcomeMsg={welcomeMsg}
            recentFiles={recentFiles}
            onOpenFile={(path) => void handleOpenFile(path)}
          />
        )}
      </div>
      <CommentsPanel
        open={panelOpen}
        comments={comments}
        orphanedIds={orphanedCommentIds}
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
        orphanedCount={orphanedCommentIds.size}
        onConfirm={confirmAction}
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
      {!diffMode && (
        <SelectionPopup
          contentRef={contentRef}
          onComment={handleSelectionComment}
        />
      )}
      <DictTooltip entry={dictTooltipEntry} anchorRect={dictTooltipRect} />
      {anchorPopup &&
        createPortal(
          <div
            id="anchor-comment-popup"
            className={styles.anchorPopup}
            style={{
              left: Math.min(anchorPopup.x, window.innerWidth - 290),
              top: Math.min(anchorPopup.y + 20, window.innerHeight - 180),
            }}
          >
            <div className={styles.acpText} data-testid="acp-text">
              {anchorPopup.comment.text}
            </div>
            <div className={styles.acpFoot}>
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
                className={`btn icon ${styles.acpDel}`}
                data-testid="acp-del"
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
