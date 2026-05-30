import { useState, useCallback, useRef, useEffect } from 'react';
import { Toolbar } from './components/Toolbar.tsx';
import { ContentArea } from './components/ContentArea.tsx';
import { CommentsPanel } from './components/CommentsPanel.tsx';
import { CommentModal } from './components/CommentModal.tsx';
import { ConfirmModal } from './components/ConfirmModal.tsx';
import { DrawioModal } from './components/DrawioModal.tsx';
import { SelectionPopup } from './components/SelectionPopup.tsx';
import { Toast } from './components/Toast.tsx';
import { useComments } from './hooks/useComments.ts';
import { useFiles } from './hooks/useFiles.ts';
import { useDiff } from './hooks/useDiff.ts';
import { useSSE } from './hooks/useSSE.ts';
import type { Comment, PendingComment } from './types.ts';
import { ctxDisplay } from './lib/comments.ts';

const HLJS_DARK = 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/base16/gruvbox-dark-medium.min.css';
const HLJS_LIGHT = 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/base16/gruvbox-light-medium.min.css';

export function App() {
  const [source, setSource] = useState('');
  const [updateTime, setUpdateTime] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastKey = useRef(0);

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
  const { comments, nextId, loadComments, addComment, updateComment, deleteComment, clearAll } = useComments();
  const { files, activeFile, setActiveFile, loadFiles, switchFile } = useFiles();
  const { diffMode, diffData, checkpointSet, setCheckpoint, toggleDiff, loadDiff } = useDiff();

  function toast(msg: string) {
    toastKey.current++;
    setToastMsg(`${msg}__${toastKey.current}`);
  }

  const loadContent = useCallback(async (filePath?: string | null) => {
    const url = filePath ? `/content?file=${encodeURIComponent(filePath)}` : '/content';
    try {
      const res = await fetch(url);
      const { content, filename } = await res.json();
      if (filename === null) {
        const wm = document.getElementById('welcome-msg');
        if (wm) wm.textContent = '.md ファイルをここにドロップ';
      }
      setSource(content);
      const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setUpdateTime(`更新: ${now}`);
    } catch { /* ignore */ }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      await loadContent();
      await loadComments();
      await loadFiles();
    })();
  }, []);

  // SSE
  useSSE((changedFile) => {
    if (!changedFile || !activeFile) return;
    const activeName = activeFile.split('/').pop();
    if (changedFile === activeName || changedFile === activeFile) {
      loadContent(activeFile).then(() => loadComments()).then(() => toast('ファイルが更新されました'));
    }
  });

  // Theme
  function applyHljsTheme(dark: boolean) {
    let el = document.getElementById('hljs-theme') as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement('link');
      el.id = 'hljs-theme';
      el.rel = 'stylesheet';
      document.head.appendChild(el);
    }
    el.href = dark ? HLJS_DARK : HLJS_LIGHT;
  }

  useEffect(() => {
    const saved = localStorage.getItem('nymph-theme');
    if (saved) {
      document.documentElement.dataset.theme = saved;
      applyHljsTheme(saved !== 'light');
    } else {
      applyHljsTheme(true);
    }
  }, []);

  function handleToggleTheme() {
    const isLight = document.documentElement.dataset.theme === 'light';
    document.documentElement.dataset.theme = isLight ? 'dark' : 'light';
    applyHljsTheme(isLight);
    localStorage.setItem('nymph-theme', document.documentElement.dataset.theme);
    // Re-trigger source to re-render mermaid
    setSource(s => s + '');
  }

  // Comment modal
  function openCommentModal(
    ls: number, le: number, displayCtx: string, blockType: string, context: any, selectionOffset: number | null,
  ) {
    setPending({ ls, le, blockType, context, selectionOffset });
    setEditingId(null);
    setEditingDisplayCtx(displayCtx);
    setEditingInitialText('');
    setCommentModalOpen(true);
  }

  function openEditModal(c: Comment) {
    setPending({ ls: c.ls, le: c.le, blockType: c.block_type, context: c.context, selectionOffset: c.selection_offset ?? null });
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

  function handleSelectionComment(ls: number, le: number, ctx: string, selectionOffset: number | null) {
    setPending({ ls, le, blockType: 'selection', context: ctx, selectionOffset });
    setEditingId(null);
    setEditingDisplayCtx(ctx);
    setEditingInitialText('');
    setCommentModalOpen(true);
  }

  // Copy review
  function copyReview() {
    if (!comments.length) { toast('コメントがありません'); return; }
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
    navigator.clipboard.writeText(out)
      .then(() => toast('レビューをコピーしました'))
      .catch(() => {
        const ta = Object.assign(document.createElement('textarea'), { value: out });
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        toast('レビューをコピーしました');
      });
  }

  // Clear all
  function handleClearAll() {
    if (!comments.length) { toast('コメントがありません'); return; }
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

  // Drag & drop
  useEffect(() => {
    const overlay = document.getElementById('drop-overlay');
    function onDragOver(e: DragEvent) { e.preventDefault(); overlay?.classList.add('active'); }
    function onDragLeave(e: DragEvent) {
      if (!e.relatedTarget || !document.body.contains(e.relatedTarget as Node)) {
        overlay?.classList.remove('active');
      }
    }
    async function onDrop(e: DragEvent) {
      e.preventDefault();
      overlay?.classList.remove('active');
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (!file.name.endsWith('.md')) { toast('Markdownファイルをドロップしてください'); return; }
      try {
        const content = await file.text();
        await fetch('/switch-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, filename: file.name }),
        });
        await loadContent();
        await loadComments();
      } catch (err: any) {
        toast(err.message || 'ファイルの読み込みに失敗しました');
      }
    }
    document.body.addEventListener('dragover', onDragOver);
    document.body.addEventListener('dragleave', onDragLeave);
    document.body.addEventListener('drop', onDrop);
    return () => {
      document.body.removeEventListener('dragover', onDragOver);
      document.body.removeEventListener('dragleave', onDragLeave);
      document.body.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <div id="app">
      <div id="drop-overlay">📂 .md ファイルをドロップ</div>
      <Toolbar
        updateTime={updateTime}
        commentCount={comments.length}
        diffMode={diffMode}
        checkpointSet={checkpointSet}
        files={files}
        activeFile={activeFile}
        onTogglePanel={() => setPanelOpen(o => !o)}
        onCopyReview={copyReview}
        onClearAll={handleClearAll}
        onCheckpoint={handleCheckpoint}
        onToggleDiff={toggleDiff}
        onToggleTheme={handleToggleTheme}
        onSwitchFile={handleSwitchFile}
      />
      <div id="main">
        <ContentArea
          source={source}
          comments={comments}
          diffMode={diffMode}
          diffData={diffData}
          onAddComment={openCommentModal}
          onOpenDrawio={(code) => { setDrawioCode(code); setDrawioOpen(true); }}
          contentRef={contentRef}
        />
      </div>
      <CommentsPanel
        open={panelOpen}
        comments={comments}
        contentRef={contentRef}
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
        onClose={() => { setCommentModalOpen(false); setPending(null); setEditingId(null); }}
      />
      <ConfirmModal
        open={confirmOpen}
        onConfirm={confirmClearAll}
        onClose={() => setConfirmOpen(false)}
      />
      <DrawioModal
        open={drawioOpen}
        code={drawioCode}
        onClose={() => { setDrawioOpen(false); setDrawioCode(null); }}
        onToast={toast}
      />
      <SelectionPopup contentId="content" onComment={handleSelectionComment} />
      <Toast message={toastMsg} />
    </div>
  );
}
