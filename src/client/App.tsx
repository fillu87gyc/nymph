import HLJS_LIGHT from 'highlight.js/styles/github.min.css?url';
import HLJS_DARK from 'highlight.js/styles/tokyo-night-dark.min.css?url';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSWRConfig } from 'swr';
import { isDroppedPath } from '../dropped.ts';
import styles from './App.module.css';
import { CommentModal } from './components/CommentModal.tsx';
import { CommentsPanel } from './components/CommentsPanel.tsx';
import { ConfirmModal, type DeleteMode } from './components/ConfirmModal.tsx';
import { ContentArea } from './components/ContentArea.tsx';
import { ContentResizer } from './components/ContentResizer.tsx';
import { DictTooltip } from './components/DictTooltip.tsx';
import { type DiffHighlightTarget, DiffView } from './components/DiffView.tsx';
import { DrawioModal } from './components/DrawioModal.tsx';
import { FileTabs } from './components/FileTabs.tsx';
import { FileTree } from './components/FileTree.tsx';
import { MermaidZoomModal } from './components/MermaidZoomModal.tsx';
import { QuickOpen } from './components/QuickOpen.tsx';
import { SelectionPopup } from './components/SelectionPopup.tsx';
import { TOAST_DURATION_MS, Toast } from './components/Toast.tsx';
import { TocPanel } from './components/TocPanel.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { WidgetArrangeScreen } from './components/WidgetArrangeScreen.tsx';
import { WidgetSlot } from './components/WidgetSlot.tsx';
import { DiagramsWidget } from './components/widgets/DiagramsWidget.tsx';
import { DiffSummaryWidget } from './components/widgets/DiffSummaryWidget.tsx';
import { FrontmatterWidget } from './components/widgets/FrontmatterWidget.tsx';
import { LinksWidget } from './components/widgets/LinksWidget.tsx';
import { MinimapWidget } from './components/widgets/MinimapWidget.tsx';
import { RecentWidget } from './components/widgets/RecentWidget.tsx';
import { SearchWidget } from './components/widgets/SearchWidget.tsx';
import { StatsWidget } from './components/widgets/StatsWidget.tsx';
import { TasksWidget } from './components/widgets/TasksWidget.tsx';
import { TermsWidget } from './components/widgets/TermsWidget.tsx';
import { useBookmarks } from './hooks/useBookmarks.ts';
import { useComments } from './hooks/useComments.ts';
import { useConnectionStatus } from './hooks/useConnectionStatus.ts';
import {
  contentKeyFor,
  DROPPED_CONTENT_KEY,
  useContent,
} from './hooks/useContent.ts';
import { useDict } from './hooks/useDict.ts';
import { useDiff } from './hooks/useDiff.ts';
import { useOutsideDismiss } from './hooks/useDismiss.ts';
import { useFiles } from './hooks/useFiles.ts';
import { useRecent } from './hooks/useRecent.ts';
import { useSSE } from './hooks/useSSE.ts';
import { useTree } from './hooks/useTree.ts';
import {
  buildReviewPayload,
  commentStatus,
  ctxDisplay,
  isCommentsKey,
  isDiffContext,
} from './lib/comments.ts';
import {
  contentDragFactor,
  loadContentWidth,
  loadMarginCollapse,
  nextContentWidth,
  resizeHandleSides,
  resolveContentMax,
  resolveContentWidthPx,
  saveContentWidth,
  saveMarginCollapse,
} from './lib/contentWidth.ts';
import { summarizeDiff } from './lib/diffSummary.ts';
import { DEFAULT_CONTENT_FONT_ID, getContentFontOption } from './lib/fonts.ts';
import {
  applyLigatures,
  loadLigatures,
  saveLigatures,
} from './lib/ligatures.ts';
import { highlightSelectionText } from './lib/markdown.ts';
import {
  computeOutlineStats,
  loadOutlineBadgeMode,
  type OutlineBadgeMode,
  saveOutlineBadgeMode,
} from './lib/outline.ts';
import {
  loadSlotWidths,
  type SlotWidths,
  saveSlotWidths,
} from './lib/slotWidth.ts';
import { buildCommentSnapshot } from './lib/snapshot.ts';
import { applyTermHighlights } from './lib/termHighlight.ts';
import { extractToc } from './lib/toc.ts';
import { buildWidgetPreviews, widgetVisibility } from './lib/widgetPreview.ts';
import {
  DEFAULT_WIDGET_LAYOUT,
  loadWidgetLayout,
  moveWidget,
  type SlotId,
  saveWidgetLayout,
  type WidgetId,
  type WidgetPlacement,
  widgetPlacement,
} from './lib/widgets.ts';
import type { Comment, DictEntry, FileEntry, PendingComment } from './types.ts';

const GOOGLE_FONTS_BASE = 'https://fonts.googleapis.com/css2?display=swap&';

/** コメントモーダルが開いている間だけ存在する状態。null なら閉じている。 */
interface CommentModalState {
  /** 開くたびに増える通し番号。開き直しを CommentModal 側が検知するのに使う。 */
  seq: number;
  pending: PendingComment;
  editingId: Comment['id'] | null;
  displayCtx: string;
  initialText: string;
  anchor: { x: number; y: number } | null;
}

function applyContentFont(id: string) {
  const font = getContentFontOption(id);
  document.documentElement.style.setProperty('--content-font', font.bodyFont);
  document.documentElement.style.setProperty(
    '--content-heading-font',
    font.headingFont,
  );
}

const versionPromise = fetch('/version')
  .then((r) => r.json())
  .then((d: { version: string }) => d.version)
  .catch(() => '');

export function App() {
  const appVersion = use(versionPromise);
  const { mutate } = useSWRConfig();
  const [panelOpen, setPanelOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [outlineBadgeMode, setOutlineBadgeMode] =
    useState<OutlineBadgeMode>(loadOutlineBadgeMode);
  // 左右のウィジェット枠に何を積むか。テーマや本文幅と同じ表示設定なので
  // localStorage に持つ（配置画面から変更する）。
  const [widgetLayout, setWidgetLayout] = useState(loadWidgetLayout);
  // 左右のウィジェット枠の幅（px）。枠と本文の境目のドラッグで変える。
  const [slotWidths, setSlotWidths] = useState<SlotWidths>(loadSlotWidths);
  // ウィジェット配置画面を開いているか。設定ポップオーバーから開く。
  const [widgetArrangeOpen, setWidgetArrangeOpen] = useState(false);
  // 表示中のトースト。出すたびに新しいオブジェクトにして、同じ文言を連続で
  // 出したときもタイマーが張り直されるようにする（null なら非表示）。
  const [toastState, setToastState] = useState<{ msg: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hljsTheme, setHljsTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('nymph-theme');
    const theme = saved === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    return theme;
  });
  const [contentFontId, setContentFontId] = useState<string>(() => {
    const saved =
      localStorage.getItem('nymph-content-font') ?? DEFAULT_CONTENT_FONT_ID;
    applyContentFont(saved);
    return saved;
  });
  // 合字の有無は本文フォントと同じく「描画前に確定していてほしい」設定なので、
  // Effect ではなく初期化中に CSS 変数へ流しておく（初回描画のちらつき防止）。
  const [ligaturesEnabled, setLigaturesEnabled] = useState<boolean>(() => {
    const saved = loadLigatures();
    applyLigatures(saved);
    return saved;
  });
  const [highlightedBlockLs, setHighlightedBlockLs] = useState<number | null>(
    null,
  );
  const [marginCollapse, setMarginCollapse] = useState(loadMarginCollapse);
  // ドラッグで指定した本文幅（px）。null ならプリセット（折りたたみ状態）に従う。
  const [manualWidth, setManualWidth] = useState<number | null>(
    loadContentWidth,
  );
  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const resizeStartWidthRef = useRef(0);
  const manualWidthRef = useRef<number | null>(null);
  const [blockOrphanIds, setBlockOrphanIds] = useState<Set<Comment['id']>>(
    new Set(),
  );
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
  // コメントモーダルの状態は「開いている間だけ存在する 1 個のオブジェクト」にまとめる。
  // 常に一括で更新される値を別々の state に散らすと、開き直しのたびに
  // 子側で Effect による初期化が必要になっていた（公式が挙げるアンチパターン）。
  // seq は開くたびに増える通し番号で、閉じずに開き直したときに CommentModal が
  // 入力内容をリセットするための目印。
  const [commentModal, setCommentModal] = useState<CommentModalState | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawioOpen, setDrawioOpen] = useState(false);
  const [drawioCode, setDrawioCode] = useState<string | null>(null);
  const [mermaidZoomHtml, setMermaidZoomHtml] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const anchorPopupRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const blockRefsMapRef = useRef<Map<string, HTMLElement>>(new Map());

  // マージン折りたたみボタンやその周囲の余白はスクロール領域の外にあるため、
  // その上でホイールしてもスクロールチェインが本文コンテナまで届かない。
  // スクロール領域内で発生したイベントはネイティブ処理に任せ、それ以外は手動転送する。
  function forwardWheelToContent(e: React.WheelEvent<HTMLDivElement>) {
    const scrollEl = contentScrollRef.current;
    if (!scrollEl || scrollEl.contains(e.target as Node)) return;
    scrollEl.scrollBy(0, e.deltaY);
  }

  const {
    files,
    activeFile,
    filesLoaded,
    switchFile,
    closeFile,
    openFile,
    pickFile,
  } = useFiles();
  const {
    comments,
    addComment,
    updateComment,
    deleteComment,
    toggleResolved,
    clearAll,
    clearOrphaned,
  } = useComments(filesLoaded ? activeFile : undefined);
  const { recentFiles } = useRecent();
  const [recentOpen, setRecentOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const { root, rootName, tree, openDir, pickDir } = useTree();
  const { bookmarks, toggle: toggleBookmark, isBookmarked } = useBookmarks();
  const { source, updateTime, welcomeMsg, contentKey } = useContent(
    filesLoaded ? activeFile : undefined,
  );
  const tocItems = useMemo(() => extractToc(source), [source]);
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
    const ids = new Set<Comment['id']>();
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

  // アウトラインパネルの見出しバッジ（未解決コメント数・diff増減）。
  // モードに依存させず常に集計しておき、表示側（TocPanel）で
  // badgeMode に応じて出し分ける。
  const outlineStats = useMemo(
    () => computeOutlineStats(tocItems, comments, orphanedCommentIds, diffData),
    [tocItems, comments, orphanedCommentIds, diffData],
  );

  function handleChangeOutlineBadgeMode(mode: OutlineBadgeMode) {
    setOutlineBadgeMode(mode);
    saveOutlineBadgeMode(mode);
  }

  // ツールバーのバッジは全件数ではなく未解決件数。crit の思想（未処理の指摘だけ
  // を目立たせる）に合わせる。対象の文章が消えたコメントは「削除済」であって
  // 未解決ではないため、パネルの未解決フィルタと同じく除外する。
  const openCommentCount = useMemo(
    () =>
      comments.filter(
        (c) => commentStatus(c, orphanedCommentIds.has(c.id)) === 'open',
      ).length,
    [comments, orphanedCommentIds],
  );

  function toast(msg: string) {
    setToastState({ msg });
  }

  // 一定時間で自動的に消す。タイマーという外部システムの管理なので Effect が正しい用途。
  // toast は出すたびに新しいオブジェクトになるため、同じ文言を続けて出しても張り直る。
  useEffect(() => {
    if (!toastState) return;
    const timeoutId = setTimeout(() => setToastState(null), TOAST_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [toastState]);

  // SSE: ファイル変更・dict 更新・タブ一覧の変化を処理
  useSSE((msg) => {
    if (msg.dictUpdated) {
      revalidateDict();
      return;
    }
    if (msg.filesChanged) {
      // 別プロセスの `nymph <file>` 委譲や別ウィンドウの操作でタブ一覧が
      // 変わった。/files を取り直せば activeFile 経由で本文・コメントも
      // 追従する（履歴も委譲時に増えているので併せて取り直す）。
      void mutate('/files');
      void mutate('/recent');
      return;
    }
    const changedFile = msg.file;
    if (!changedFile || !activeFile) return;
    if (changedFile === activeFile) {
      void mutate(contentKey);
      void mutate(isCommentsKey);
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

  // 用語 mark のホバーでツールチップを表示・非表示にする。
  // 以前は Effect で contentRef へ直接 addEventListener していたが、React の
  // イベントハンドラで足りる（＝Effect が要らない）うえ、辞書が更新されるたびに
  // 購読し直していた。ハンドラなら毎レンダー作り直されるので dictEntries も常に最新。
  function handleTermEnter(term: string, rect: DOMRect) {
    setDictTooltipEntry(dictEntries.find((en) => en.term === term) ?? null);
    setDictTooltipRect(rect);
  }

  function handleTermLeave() {
    setDictTooltipEntry(null);
    setDictTooltipRect(null);
  }

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

  function handleChangeContentFont(id: string) {
    setContentFontId(id);
    applyContentFont(id);
    localStorage.setItem('nymph-content-font', id);
  }

  function handleToggleLigatures() {
    const next = !ligaturesEnabled;
    setLigaturesEnabled(next);
    applyLigatures(next);
    saveLigatures(next);
  }

  function toggleMargin(side: 'left' | 'right') {
    // 折りたたみトグルは幅のプリセット。手動幅が残っているとトグルが
    // 効かなくなるため、プリセットを選び直したものとして破棄する。
    resetContentWidth();
    setMarginCollapse((prev) => {
      const next = { ...prev, [side]: !prev[side] };
      saveMarginCollapse(next);
      return next;
    });
  }

  function resetContentWidth() {
    manualWidthRef.current = null;
    setManualWidth(null);
    saveContentWidth(null);
  }

  function handleResizeStart() {
    // 開始時点の実幅を基準にする。プリセット由来（手動幅 null）でも
    // 実測値からそのまま連続的にドラッグを始められる。
    resizeStartWidthRef.current =
      contentRef.current?.getBoundingClientRect().width ?? 0;
    // ドラッグせずに離した場合に既存の手動幅を消さないよう現在値を控える
    manualWidthRef.current = manualWidth;
    setIsResizingWidth(true);
  }

  function handleResize(side: 'left' | 'right', deltaX: number) {
    const startWidth = resizeStartWidthRef.current;
    if (startWidth <= 0) return;
    const next = nextContentWidth({
      startWidth,
      deltaX,
      side,
      factor: contentDragFactor(marginCollapse),
      maxWidth: contentScrollRef.current?.clientWidth ?? startWidth,
    });
    manualWidthRef.current = next;
    setManualWidth(next);
  }

  function handleResizeEnd() {
    setIsResizingWidth(false);
    saveContentWidth(manualWidthRef.current);
  }

  /** ウィジェット枠の幅の更新（ドラッグ中は保存せず画面だけ動かす）。 */
  const handleSlotWidthChange = useCallback((side: SlotId, width: number) => {
    setSlotWidths((prev) => ({ ...prev, [side]: width }));
  }, []);

  /** ウィジェット枠の幅の確定（ドラッグ終了・キー操作・リセット）。 */
  const handleSlotWidthCommit = useCallback((side: SlotId, width: number) => {
    setSlotWidths((prev) => {
      const next = { ...prev, [side]: width };
      saveSlotWidths(next);
      return next;
    });
  }, []);

  useOutsideDismiss(anchorPopupRef, () => setAnchorPopup(null), {
    enabled: anchorPopup !== null,
  });

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

  /**
   * 差分チェックモードへ切り替えて、その行をハイライトする。
   * 差分へのコメントからのジャンプと、差分サマリウィジェットの共通経路。
   */
  const jumpToDiffLine = useCallback(
    (side: 'old' | 'new', line: number) => {
      void showDiff();
      setDiffHighlight((prev) => ({ side, line, v: (prev?.v ?? 0) + 1 }));
    },
    [showDiff],
  );

  const scrollToComment = useCallback(
    (c: Comment) => {
      // 差分への指摘: 差分チェックモードへ切り替えて該当行をハイライト
      if (c.block_type === 'diff') {
        if (!isDiffContext(c.context)) return;
        const ctx = c.context;
        const line = ctx.side === 'old' ? ctx.oldLine : ctx.newLine;
        if (line == null) return;
        jumpToDiffLine(ctx.side, line);
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
    [flashBlockHighlight, jumpToDiffLine],
  );

  /**
   * 指定行へスクロールしてフラッシュする。狙いは次の順で決める。
   *
   * 1. その行から始まるブロック（見出し＝アウトラインからのジャンプ）
   * 2. その行を含む最も内側のブロック（タスクやリンクのようにブロックの
   *    途中の行を指す場合）
   * 3. その行の直後のブロック（空行やコードフェンスの隙間を指す場合。
   *    ミニマップのクリックのように狙いが大まかなときに効く）
   */
  const scrollToLine = useCallback(
    (line: number) => {
      let exact: HTMLElement | null = null;
      let innermost: HTMLElement | null = null;
      let after: HTMLElement | null = null;
      let last: HTMLElement | null = null;
      for (const el of blockRefsMapRef.current.values()) {
        const ls = +(el.dataset.lineStart ?? 0);
        const le = +(el.dataset.lineEnd ?? 0);
        if (ls === line) exact = el;
        if (!last || ls > +(last.dataset.lineStart ?? 0)) last = el;
        if (ls > line) {
          if (!after || ls < +(after.dataset.lineStart ?? 0)) after = el;
          continue;
        }
        if (le < line) continue;
        if (!innermost || ls > +(innermost.dataset.lineStart ?? 0))
          innermost = el;
      }
      const targetEl = exact ?? innermost ?? after ?? last;
      if (!targetEl) return;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      flashBlockHighlight(+(targetEl.dataset.lineStart ?? 0));
    },
    [flashBlockHighlight],
  );

  // Comment modal
  /** 開くたびに seq を進めて「別インスタンス」として作り直させる。 */
  function openCommentModalWith(state: Omit<CommentModalState, 'seq'>) {
    setCommentModal((prev) => ({ ...state, seq: (prev?.seq ?? 0) + 1 }));
  }

  function openCommentModal(
    lineStart: number,
    lineEnd: number,
    displayCtx: string,
    blockType: string,
    context: Comment['context'],
    selectionOffset: number | null,
    x: number,
    y: number,
  ) {
    openCommentModalWith({
      pending: {
        lineStart,
        lineEnd,
        block_type: blockType,
        context,
        selection_offset: selectionOffset,
      },
      editingId: null,
      displayCtx,
      initialText: '',
      anchor: { x, y },
    });
  }

  function openEditModal(c: Comment, x?: number, y?: number) {
    openCommentModalWith({
      pending: {
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        block_type: c.block_type,
        context: c.context,
        selection_offset: c.selection_offset ?? null,
      },
      editingId: c.id,
      displayCtx: ctxDisplay(c),
      initialText: c.text,
      anchor: x != null && y != null ? { x, y } : null,
    });
  }

  async function handleCommentSubmit(text: string) {
    const modal = commentModal;
    if (!modal) return;
    setCommentModal(null);
    if (modal.editingId !== null) {
      const ok = await updateComment(modal.editingId, text);
      toast(ok ? 'コメントを更新しました' : 'コメントを保存できませんでした');
    } else {
      // 「もとの文章」は作成時点でしか正確に切り出せない（後で対象が削除される）。
      // ここでスナップショットを取ってコメントと一緒に保存する。
      const ok = await addComment(
        modal.pending,
        text,
        buildCommentSnapshot(modal.pending, source, diffData),
      );
      setPanelOpen(true);
      toast(ok ? 'コメントを追加しました' : 'コメントを保存できませんでした');
    }
  }

  function handleSelectionComment(
    lineStart: number,
    lineEnd: number,
    ctx: string,
    selectionOffset: number | null,
    x: number,
    y: number,
  ) {
    openCommentModalWith({
      pending: {
        lineStart,
        lineEnd,
        block_type: 'selection',
        context: ctx,
        selection_offset: selectionOffset,
      },
      editingId: null,
      displayCtx: ctx,
      initialText: '',
      anchor: { x, y },
    });
  }

  // Copy review（解決済みコメントは含めない）
  function copyReview() {
    if (!comments.length) {
      toast('コメントがありません');
      return;
    }
    const payload = buildReviewPayload(comments, activeFile);
    if (!payload.comment_count) {
      toast('未解決のコメントがありません');
      return;
    }
    const out = JSON.stringify(payload, null, 2);
    navigator.clipboard
      .writeText(out)
      .then(() => toast('レビューをコピーしました'))
      .catch(() => toast('クリップボードへのコピーに失敗しました'));
  }

  // Copy active file's full path
  function copyFilePath() {
    if (!activeFile || isDroppedPath(activeFile)) {
      toast('コピーできるファイルがありません');
      return;
    }
    navigator.clipboard
      .writeText(activeFile)
      .then(() => toast('ファイルパスをコピーしました'))
      .catch(() => toast('クリップボードへのコピーに失敗しました'));
  }

  // 印刷 / PDF 保存。紙向けの体裁は styles/print.css（@media print）が持つので、
  // ここはブラウザの印刷ダイアログを開くだけ。Ctrl/Cmd+P からでも同じ結果になる。
  function handlePrint() {
    window.print();
  }

  async function handleDeleteComment(id: Comment['id']) {
    const ok = await deleteComment(id);
    if (!ok) toast('コメントを保存できませんでした');
  }

  async function handleToggleResolved(id: Comment['id']) {
    const ok = await toggleResolved(id);
    if (!ok) toast('コメントを保存できませんでした');
  }

  // Clear comments
  function handleClearAll() {
    if (!comments.length) {
      toast('コメントがありません');
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmAction(mode: DeleteMode) {
    if (mode === 'all') {
      const ok = await clearAll();
      setPanelOpen(false);
      toast(
        ok ? 'コメントをすべて削除しました' : 'コメントを保存できませんでした',
      );
    } else {
      const count = orphanedCommentIds.size;
      const ok = await clearOrphaned(orphanedCommentIds);
      toast(
        ok
          ? `削除済みコメントを${count}件削除しました`
          : 'コメントを保存できませんでした',
      );
    }
    setConfirmOpen(false);
  }

  // Checkpoint
  async function handleCheckpoint() {
    const lines = await setCheckpoint();
    // チェックポイント設定はサーバー側で round を進める（reviewStore.ts の
    // incrementRound）。以降に作るコメントへ新しい round を反映させるため、
    // コメントキャッシュを再検証して round を取得し直す。
    await mutate(isCommentsKey);
    toast(`チェックポイントを設定しました（${lines}行）`);
  }

  // Switch file
  async function handleSwitchFile(path: string) {
    await switchFile(path);
    await mutate(isCommentsKey);
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

  // 全文検索の結果からファイルを開き、該当行を含むブロックへスクロールする。
  // 開いた直後はまだブロックが描画されていないため、pendingScrollLine に積んで
  // おき、source 更新後の effect で解決する（下の useEffect）。
  const [pendingScrollLine, setPendingScrollLine] = useState<{
    path: string;
    line: number;
  } | null>(null);

  const handleOpenFileAtLine = useCallback(
    async (path: string, line: number) => {
      try {
        await openFile(path);
        setPendingScrollLine({ path, line });
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        toast(message || 'ファイルを開けませんでした');
      }
    },
    [openFile],
  );

  // source（本文）が描画されてから、対象行を含む最も内側のブロックへ
  // スクロールしてフラッシュする。ブロック未描画なら次の source 更新で再試行。
  useEffect(() => {
    if (!pendingScrollLine || activeFile !== pendingScrollLine.path) return;
    const id = requestAnimationFrame(() => {
      let target: HTMLElement | null = null;
      for (const el of blockRefsMapRef.current.values()) {
        const ls = +(el.dataset.lineStart ?? 0);
        const le = +(el.dataset.lineEnd ?? 0);
        if (ls > pendingScrollLine.line || le < pendingScrollLine.line)
          continue;
        if (!target || ls > +(target.dataset.lineStart ?? 0)) target = el;
      }
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flashBlockHighlight(+(target.dataset.lineStart ?? 0));
      setPendingScrollLine(null);
    });
    return () => cancelAnimationFrame(id);
  }, [pendingScrollLine, activeFile, source, flashBlockHighlight]);

  // ディレクトリを開く（ツリーのルート切替。タブは維持）
  const handleOpenDir = useCallback(
    async (path: string) => {
      try {
        await openDir(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        toast(message || 'ディレクトリを開けませんでした');
      }
    },
    [openDir],
  );

  // OS ネイティブのダイアログでファイル/フォルダを選ぶ
  const handlePickFile = useCallback(async () => {
    try {
      await pickFile();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast(message || 'ファイルを開けませんでした');
    }
  }, [pickFile]);

  const handlePickDir = useCallback(async () => {
    try {
      await pickDir();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast(message || 'ディレクトリを開けませんでした');
    }
  }, [pickDir]);

  // ブックマーク対象: アクティブファイル優先、なければツリーのルート dir
  const bookmarkTarget =
    activeFile && !isDroppedPath(activeFile)
      ? { path: activeFile, type: 'file' as const }
      : root
        ? { path: root, type: 'dir' as const }
        : null;

  const handleToggleBookmark = useCallback(async () => {
    if (!bookmarkTarget) return;
    try {
      const added = await toggleBookmark(
        bookmarkTarget.path,
        bookmarkTarget.type,
      );
      toast(
        added ? 'ブックマークに追加しました' : 'ブックマークを解除しました',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast(message || 'ブックマークを更新できませんでした');
    }
  }, [bookmarkTarget, toggleBookmark]);

  // ショートカット: Ctrl/Cmd+P で Quick Open
  // （ブラウザの印刷ダイアログは preventDefault で抑止。Ctrl/Cmd+R はブラウザのリロードに譲る）
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'p') {
        e.preventDefault();
        setRecentOpen(false);
        setQuickOpenOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close file
  async function handleCloseFile(path: string) {
    const nextActive = await closeFile(path);
    await mutate(isCommentsKey);
    // 擬似タブ（ドロップ）と「1つも開いていない」状態は同じ '/content' キーを
    // 共有する。キーが変わらない遷移では SWR が取り直さないため、擬似タブを
    // 最後に閉じても本文がキャッシュのまま画面に残り続けていた（全部閉じたのに
    // welcome 画面にならない）。キーが変わらないときだけ明示的に取り直す。
    if (contentKeyFor(nextActive) === contentKey) await mutate(contentKey);
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
      const res = await fetch('/switch-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename: file.name }),
      });
      if (!res.ok) throw new Error('ファイルを開けませんでした');
      // ドロップは実ファイルを開いていてもタブが1つ増えて選択される。
      // サーバーが返す新しいタブ一覧をそのまま反映する（返り値を使わず
      // 再フェッチするだけだと、既に他のファイルを開いているときに
      // 擬似タブが増えたことへ画面が追従しない）。
      const updated = (await res.json()) as {
        files: FileEntry[];
        activeFile: string | null;
      };
      await mutate('/files', updated, { revalidate: false });
      await mutate(isCommentsKey);
      // ドロップ由来の擬似タブの内容は常に '/content'（file パラメータ無し）
      // という同じキーで配信される。既にドロップ済みの状態で別ファイルを
      // 再ドロップするとキーが変わらず前回分がそのまま残ってしまうため、
      // いま読んだ内容でキャッシュを上書きしておく。
      await mutate(
        DROPPED_CONTENT_KEY,
        { content, filename: file.name },
        { revalidate: false },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast(message || 'ファイルの読み込みに失敗しました');
    }
  }

  function handleMoveWidget(
    id: WidgetId,
    placement: WidgetPlacement,
    index: number,
  ) {
    setWidgetLayout((prev) => {
      const next = moveWidget(prev, id, placement, index);
      saveWidgetLayout(next);
      return next;
    });
  }

  function handleResetWidgetLayout() {
    const next = {
      left: [...DEFAULT_WIDGET_LAYOUT.left],
      right: [...DEFAULT_WIDGET_LAYOUT.right],
    };
    saveWidgetLayout(next);
    setWidgetLayout(next);
  }

  // ウィジェットを出す条件。配置（どの枠に置くか）とは別軸で、従来どおり
  // それぞれのトグルや状態で決まる。判定そのものは配置画面の「今は非表示」
  // の注記と同じ関数から作るので、注記と実際の画面がずれない。
  const widgetVis = widgetVisibility({
    fileCount: files.length,
    hasRoot: !!root,
    outlineOpen: tocOpen,
    commentsOpen: panelOpen,
  });

  // 配置画面に出す中身の縮小プレビュー。本文の走査を含むので、画面を開いて
  // いるあいだだけ作る（閉じているあいだは本文が変わっても計算しない）。
  const widgetPreviews = useMemo(
    () =>
      widgetArrangeOpen
        ? buildWidgetPreviews({
            source,
            headings: tocItems.map((t) => t.text),
            openFiles: files.map((f) => f.name),
            treeEntries: tree.map((n) => n.name),
            comments: comments.map((c) => c.text),
            recent: [
              ...recentFiles.map((r) => r.name),
              ...bookmarks.map((b) => b.name),
            ],
            terms: dictEntries.map((e) => e.term),
            diffHunks: summarizeDiff(diffData?.lines ?? []).hunks.map(
              (h) => h.preview,
            ),
            checkpointSet,
          })
        : null,
    [
      widgetArrangeOpen,
      source,
      tocItems,
      files,
      tree,
      comments,
      recentFiles,
      bookmarks,
      dictEntries,
      diffData,
      checkpointSet,
    ],
  );

  function slotHasContent(side: SlotId): boolean {
    return widgetLayout[side].some((id) => widgetVis[id].visible);
  }

  function renderWidget(id: WidgetId) {
    if (!widgetVis[id].visible) return null;
    switch (id) {
      case 'tabs':
        return (
          <FileTabs
            files={files}
            activeFile={activeFile}
            orientation="vertical"
            onSwitch={handleSwitchFile}
            onClose={handleCloseFile}
          />
        );
      case 'explorer':
        return (
          <FileTree
            rootName={rootName}
            tree={tree}
            activeFile={activeFile}
            onOpenFile={(path) => void handleOpenFile(path)}
          />
        );
      case 'outline':
        return (
          <TocPanel
            items={tocItems}
            onSelect={scrollToLine}
            stats={outlineStats}
            badgeMode={outlineBadgeMode}
            hasCheckpoint={checkpointSet}
          />
        );
      case 'comments':
        return (
          <CommentsPanel
            open
            variant="slot"
            comments={comments}
            orphanedIds={orphanedCommentIds}
            onScrollToComment={scrollToComment}
            onEdit={openEditModal}
            onDelete={(cid) => void handleDeleteComment(cid)}
            onToggleResolved={(cid) => void handleToggleResolved(cid)}
            onClose={() => setPanelOpen(false)}
          />
        );
      case 'search':
        return (
          <SearchWidget
            onOpenFileAtLine={(path, line) =>
              void handleOpenFileAtLine(path, line)
            }
          />
        );
      case 'recent':
        return (
          <RecentWidget
            recentFiles={recentFiles}
            bookmarks={bookmarks}
            activeFile={activeFile}
            onOpenFile={(path) => void handleOpenFile(path)}
            onOpenDir={(path) => void handleOpenDir(path)}
          />
        );
      case 'minimap':
        return (
          <MinimapWidget
            source={source}
            comments={comments}
            orphanedIds={orphanedCommentIds}
            contentScrollRef={contentScrollRef}
            diffMode={diffMode}
            onSelectLine={scrollToLine}
          />
        );
      case 'diagrams':
        return <DiagramsWidget source={source} onSelectLine={scrollToLine} />;
      case 'tasks':
        return <TasksWidget source={source} onSelectLine={scrollToLine} />;
      case 'links':
        return <LinksWidget source={source} onSelectLine={scrollToLine} />;
      case 'terms':
        return (
          <TermsWidget
            entries={dictEntries}
            source={source}
            onSelectLine={scrollToLine}
          />
        );
      case 'frontmatter':
        return <FrontmatterWidget source={source} />;
      case 'diffsummary':
        return (
          <DiffSummaryWidget
            diffData={diffData}
            checkpointSet={checkpointSet}
            onSelectDiffLine={jumpToDiffLine}
          />
        );
      case 'stats':
        return <StatsWidget source={source} />;
    }
  }

  // 差分チェックモードで左右の枠がどちらも空のときだけ、折りたたみボタン等の
  // 追加レイアウトを挟まないシンプルな1カラムを維持する
  // （余計な flex ネストを挟むと VRT スクリーンショットの端数ピクセルがズレるため）。
  const diffSingleColumn =
    diffMode && !slotHasContent('left') && !slotHasContent('right');

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
      {(() => {
        const param = getContentFontOption(contentFontId).googleFontsParam;
        return (
          param &&
          createPortal(
            <link rel="stylesheet" href={`${GOOGLE_FONTS_BASE}${param}`} />,
            document.head,
          )
        );
      })()}
      {isDragging && (
        <div id="drop-overlay" className={styles.dropOverlay}>
          📂 .md ファイルをドロップ
        </div>
      )}
      <Toolbar
        version={appVersion}
        updateTime={updateTime}
        commentCount={openCommentCount}
        diffMode={diffMode}
        checkpointSet={checkpointSet}
        isConnected={isConnected}
        recentFiles={recentFiles}
        recentOpen={recentOpen}
        bookmarks={bookmarks}
        bookmarkActive={isBookmarked(bookmarkTarget?.path ?? null)}
        canBookmark={bookmarkTarget !== null}
        onToggleBookmark={() => void handleToggleBookmark()}
        onToggleRecent={setRecentOpen}
        onOpenFile={(path) => void handleOpenFile(path)}
        onOpenDir={(path) => void handleOpenDir(path)}
        onPickFile={() => void handlePickFile()}
        onPickDir={() => void handlePickDir()}
        onTogglePanel={() => setPanelOpen((o) => !o)}
        tocOpen={tocOpen}
        onToggleToc={() => setTocOpen((o) => !o)}
        onCopyReview={copyReview}
        canCopyPath={!!activeFile && !isDroppedPath(activeFile)}
        onCopyPath={copyFilePath}
        onClearAll={handleClearAll}
        onCheckpoint={handleCheckpoint}
        onPrint={handlePrint}
        onToggleDiff={toggleDiff}
        onToggleTheme={handleToggleTheme}
        contentFontId={contentFontId}
        onChangeContentFont={handleChangeContentFont}
        ligaturesEnabled={ligaturesEnabled}
        onToggleLigatures={handleToggleLigatures}
        onDictSync={handleDictSync}
        isDictSyncing={isDictSyncing}
        marginCollapse={marginCollapse}
        onToggleMargin={toggleMargin}
        manualWidth={manualWidth}
        onResetWidth={resetContentWidth}
        outlineBadgeMode={outlineBadgeMode}
        onChangeOutlineBadgeMode={handleChangeOutlineBadgeMode}
        onOpenWidgetArrange={() => setWidgetArrangeOpen(true)}
      />
      {widgetPlacement(widgetLayout, 'tabs') === null && (
        <FileTabs
          files={files}
          activeFile={activeFile}
          onSwitch={handleSwitchFile}
          onClose={handleCloseFile}
        />
      )}
      <div
        id="main"
        className={diffSingleColumn ? styles.main : styles.mainRow}
      >
        <WidgetSlot
          side="left"
          widgets={widgetLayout.left}
          width={slotWidths.left}
          render={renderWidget}
          onWidthChange={handleSlotWidthChange}
          onWidthCommit={handleSlotWidthCommit}
        />
        {diffMode ? (
          <div
            ref={contentScrollRef}
            className={diffSingleColumn ? undefined : styles.contentCol}
            data-testid="content-scroll"
            data-print-region="true"
          >
            <DiffView
              diffData={diffData}
              comments={comments}
              highlightTarget={diffHighlight}
              onAddComment={openCommentModal}
              onClickCommentAnchor={handleClickCommentAnchor}
            />
          </div>
        ) : (
          <div
            className={styles.contentColMargins}
            onWheel={forwardWheelToContent}
            data-print-region="true"
          >
            <div
              ref={contentScrollRef}
              className={styles.contentGrid}
              data-testid="content-scroll"
              data-resizing={String(isResizingWidth)}
              style={
                {
                  '--gutter-l': marginCollapse.left ? '0px' : '1fr',
                  '--gutter-r': marginCollapse.right ? '0px' : '1fr',
                  '--content-max': resolveContentMax(
                    marginCollapse,
                    manualWidth,
                  ),
                } as React.CSSProperties
              }
            >
              {resizeHandleSides(marginCollapse).left && (
                <ContentResizer
                  side="left"
                  width={resolveContentWidthPx(marginCollapse, manualWidth)}
                  onResizeStart={handleResizeStart}
                  onResize={handleResize}
                  onResizeEnd={handleResizeEnd}
                  onReset={resetContentWidth}
                />
              )}
              {resizeHandleSides(marginCollapse).right && (
                <ContentResizer
                  side="right"
                  width={resolveContentWidthPx(marginCollapse, manualWidth)}
                  onResizeStart={handleResizeStart}
                  onResize={handleResize}
                  onResizeEnd={handleResizeEnd}
                  onReset={resetContentWidth}
                />
              )}
              <ContentArea
                source={source}
                activeFile={activeFile}
                comments={comments}
                isDarkTheme={hljsTheme === 'dark'}
                highlightedBlockLs={highlightedBlockLs}
                onAddComment={openCommentModal}
                onOpenDrawio={(code) => {
                  setDrawioCode(code);
                  setDrawioOpen(true);
                }}
                onOpenMermaidZoom={(html) => {
                  setMermaidZoomHtml(html);
                }}
                onClickCommentAnchor={handleClickCommentAnchor}
                onTermEnter={handleTermEnter}
                onTermLeave={handleTermLeave}
                onOrphanedIds={setBlockOrphanIds}
                contentRef={contentRef}
                blockRefsMapRef={blockRefsMapRef}
                welcomeMsg={
                  root && !activeFile
                    ? 'ツリーからファイルを選択してください'
                    : welcomeMsg
                }
                recentFiles={recentFiles}
                bookmarks={bookmarks}
                onOpenFile={(path) => void handleOpenFile(path)}
                onOpenDir={(path) => void handleOpenDir(path)}
              />
            </div>
          </div>
        )}
        <WidgetSlot
          side="right"
          widgets={widgetLayout.right}
          width={slotWidths.right}
          render={renderWidget}
          onWidthChange={handleSlotWidthChange}
          onWidthCommit={handleSlotWidthCommit}
        />
      </div>
      {widgetPlacement(widgetLayout, 'comments') === null && (
        <CommentsPanel
          open={panelOpen}
          comments={comments}
          orphanedIds={orphanedCommentIds}
          onScrollToComment={scrollToComment}
          onEdit={openEditModal}
          onDelete={(id) => void handleDeleteComment(id)}
          onToggleResolved={(id) => void handleToggleResolved(id)}
          onClose={() => setPanelOpen(false)}
        />
      )}
      {/* 開いている間だけマウントする（閉じている間の state を持たせない）。
          key を使わないのは、この children リストで key を付け替えると、同じ
          コミットで消える兄弟の DOM が残ることがあったため。開き直しの
          リセットは seq を見て CommentModal 側がレンダー中に行う。 */}
      {commentModal && (
        <CommentModal
          openSeq={commentModal.seq}
          pending={commentModal.pending}
          editingId={commentModal.editingId}
          displayCtx={commentModal.displayCtx}
          initialText={commentModal.initialText}
          anchor={commentModal.anchor}
          onSubmit={handleCommentSubmit}
          onClose={() => setCommentModal(null)}
        />
      )}
      {confirmOpen && (
        <ConfirmModal
          orphanedCount={orphanedCommentIds.size}
          onConfirm={confirmAction}
          onClose={() => setConfirmOpen(false)}
        />
      )}
      <DrawioModal
        open={drawioOpen}
        code={drawioCode}
        onClose={() => {
          setDrawioOpen(false);
          setDrawioCode(null);
        }}
        onToast={toast}
      />
      {mermaidZoomHtml !== null && (
        <MermaidZoomModal
          html={mermaidZoomHtml}
          onClose={() => setMermaidZoomHtml(null)}
        />
      )}
      {!diffMode && (
        <SelectionPopup
          contentRef={contentRef}
          onComment={handleSelectionComment}
        />
      )}
      {widgetArrangeOpen && widgetPreviews && (
        <WidgetArrangeScreen
          layout={widgetLayout}
          visibility={widgetVis}
          previews={widgetPreviews}
          onMove={handleMoveWidget}
          onReset={handleResetWidgetLayout}
          onClose={() => setWidgetArrangeOpen(false)}
        />
      )}
      {quickOpenOpen && (
        <QuickOpen
          tabs={files}
          recentFiles={recentFiles}
          bookmarks={bookmarks}
          tree={tree}
          onClose={() => setQuickOpenOpen(false)}
          onOpenFile={(path) => void handleOpenFile(path)}
          onOpenDir={(path) => void handleOpenDir(path)}
          onOpenFileAtLine={(path, line) =>
            void handleOpenFileAtLine(path, line)
          }
        />
      )}
      <DictTooltip entry={dictTooltipEntry} anchorRect={dictTooltipRect} />
      {anchorPopup &&
        createPortal(
          <div
            ref={anchorPopupRef}
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
                  openEditModal(
                    anchorPopup.comment,
                    anchorPopup.x,
                    anchorPopup.y,
                  );
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
      {toastState && <Toast message={toastState.msg} />}
    </div>
  );
}
