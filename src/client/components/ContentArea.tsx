import { useCallback, useEffect, useMemo, useRef } from 'react';
import { waitForFonts } from '../lib/fontReady.ts';
import { findTextRange } from '../lib/markdown.ts';
import { parseBlocks } from '../lib/parseBlocks.ts';
import type { BookmarkEntry, Comment, RecentEntry } from '../types.ts';
import styles from './ContentArea.module.css';
import { MarkdownBlock } from './MarkdownBlock.tsx';

interface ContentAreaProps {
  source: string;
  comments: Comment[];
  isDarkTheme: boolean;
  highlightedBlockLs: number | null;
  welcomeMsg?: string;
  recentFiles?: RecentEntry[];
  bookmarks?: BookmarkEntry[];
  onOpenFile?: (path: string) => void;
  onOpenDir?: (path: string) => void;
  onAddComment: (
    lineStart: number,
    lineEnd: number,
    displayCtx: string,
    blockType: string,
    context: Comment['context'],
    selectionOffset: number | null,
    x: number,
    y: number,
  ) => void;
  onOpenDrawio: (code: string) => void;
  onOpenMermaidZoom: (html: string) => void;
  onClickCommentAnchor: (c: Comment, x: number, y: number) => void;
  /** 用語辞書のハイライト（mark[data-dict-term]）にマウスが乗った / 外れた */
  onTermEnter?: (term: string, rect: DOMRect) => void;
  onTermLeave?: () => void;
  onOrphanedIds?: (ids: Set<Comment['id']>) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  blockRefsMapRef: React.MutableRefObject<Map<string, HTMLElement>>;
}

export function ContentArea({
  source,
  comments,
  isDarkTheme,
  highlightedBlockLs,
  welcomeMsg = 'ファイルを読み込んでいます…',
  recentFiles = [],
  bookmarks = [],
  onOpenFile,
  onOpenDir,
  onAddComment,
  onOpenDrawio,
  onOpenMermaidZoom,
  onClickCommentAnchor,
  onTermEnter,
  onTermLeave,
  onOrphanedIds,
  contentRef,
  blockRefsMapRef,
}: ContentAreaProps) {
  const commentRangesRef = useRef<Array<{ comment: Comment; range: Range }>>(
    [],
  );
  const blocks = useMemo(() => parseBlocks(source), [source]);

  const handleRef = useCallback(
    (key: string, el: HTMLElement | null) => {
      if (el) {
        blockRefsMapRef.current.set(key, el);
      } else {
        blockRefsMapRef.current.delete(key);
      }
    },
    [blockRefsMapRef],
  );

  const hasCommentSet = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const block of blocks) {
      if (
        comments.some(
          (c) =>
            // 差分への指摘は本文ブロックに紐づかない（行番号は diff 基準）
            c.block_type !== 'diff' &&
            c.lineStart <= block.lineEnd &&
            c.lineEnd >= block.lineStart,
        )
      ) {
        set.add(block.key);
      }
    }
    return set;
  }, [blocks, comments]);

  // Persistent comment-anchor highlight for selection comments
  useEffect(() => {
    const container = contentRef.current;
    const hl = CSS.highlights as HighlightRegistry | undefined;
    if (!container || !hl) return;

    hl.delete('comment-anchor');
    commentRangesRef.current = [];

    const orphaned = new Set<Comment['id']>();

    // Block-level comments: orphaned if no block starts at c.lineStart
    // （selection は後段で判定、diff は App 側で diff データと突き合わせて判定）
    for (const c of comments) {
      if (c.block_type === 'selection' || c.block_type === 'diff') continue;
      const found = blocks.some((b) => b.lineStart === c.lineStart);
      if (!found) orphaned.add(c.id);
    }

    const selComments = comments.filter(
      (c) => c.block_type === 'selection' && typeof c.context === 'string',
    );

    if (!selComments.length) {
      onOrphanedIds?.(orphaned);
      return;
    }

    const ranges: Range[] = [];
    for (const c of selComments) {
      const blockEls = Array.from(
        container.querySelectorAll<HTMLElement>('[data-block="true"]'),
      ).filter((el) => {
        const blockLineStart = +(el.dataset.lineStart ?? 0);
        const blockLineEnd = +(el.dataset.lineEnd ?? 0);
        return blockLineStart <= c.lineEnd && blockLineEnd >= c.lineStart;
      });
      const range = findTextRange(
        blockEls,
        c.context as string,
        c.selection_offset ?? null,
      );
      if (range) {
        ranges.push(range);
        commentRangesRef.current.push({ comment: c, range });
      } else {
        orphaned.add(c.id);
      }
    }

    onOrphanedIds?.(orphaned);

    if (!ranges.length) return;
    hl.set('comment-anchor', new Highlight(...ranges));

    return () => {
      hl.delete('comment-anchor');
    };
  }, [comments, blocks, contentRef, onOrphanedIds]);

  function getCommentAtPoint(x: number, y: number): Comment | null {
    for (const { comment, range } of commentRangesRef.current) {
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        ) {
          return comment;
        }
      }
    }
    return null;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const c = getCommentAtPoint(e.clientX, e.clientY);
    e.currentTarget.style.cursor = c ? 'pointer' : '';
  }

  // 用語ハイライトの mark は applyTermHighlights が本文へ後から差し込むが、
  // React のイベントは #content まで伝播するのでここで拾える。
  // ホバーとフォーカスの両方を同じ処理につないで、キーボード操作でも辞書が引けるようにする。
  function dictTerm(target: EventTarget | null): string | null {
    const el = target as HTMLElement | null;
    if (el?.tagName !== 'MARK') return null;
    return el.getAttribute('data-dict-term');
  }

  function handleTermShow(e: React.SyntheticEvent) {
    const term = dictTerm(e.target);
    if (term === null) return;
    onTermEnter?.(term, (e.target as HTMLElement).getBoundingClientRect());
  }

  function handleTermHide(e: React.SyntheticEvent) {
    if (dictTerm(e.target) === null) return;
    onTermLeave?.();
  }

  function handleContentClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, select')) return;
    const c = getCommentAtPoint(e.clientX, e.clientY);
    if (c) {
      onClickCommentAnchor(c, e.clientX, e.clientY);
    }
  }

  // Run mermaid + hljs after blocks are rendered
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        if (cancelled) return;
        const dark = isDarkTheme;
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: '"JetBrains Mono", monospace',
        });
        // フォント確定前に mermaid がテキストを計測するとノードサイズが変わり、
        // ダイアグラム高さ（ひいては下方コンテンツの位置）が描画ごとに揺れる。
        // document.fonts.ready だけでは Google Fonts の <link> CSS 適用前に
        // 解決するレースが残るため、mermaid が計測に使うフォントを明示的に
        // ロードしてから描画してレイアウトを決定的にする。
        await waitForFonts([
          '16px "JetBrains Mono"',
          '500 16px "JetBrains Mono"',
        ]);
        if (cancelled) return;
        await mermaid.run({ querySelector: '#content .mermaid' });
      } catch (e) {
        console.warn('mermaid:', e);
      }

      if (cancelled) return;

      try {
        const { default: hljs } = await import('highlight.js');
        container.querySelectorAll('pre code').forEach((el) => {
          try {
            hljs.highlightElement(el as HTMLElement);
          } catch (e) {
            console.warn('hljs:', e);
          }
        });
      } catch {
        /* not available */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blocks, contentRef, isDarkTheme]);

  const isEmpty = !source.trim();

  return (
    <div
      id="content"
      ref={contentRef as React.RefObject<HTMLDivElement>}
      onMouseMove={handleMouseMove}
      onMouseOver={handleTermShow}
      onFocus={handleTermShow}
      onMouseOut={handleTermHide}
      onBlur={handleTermHide}
      onClick={handleContentClick}
    >
      {isEmpty && (
        <div className={styles.welcome}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect
              x="6"
              y="4"
              width="28"
              height="32"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M12 13h16M12 19h16M12 25h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p id="welcome-msg">{welcomeMsg}</p>
          {onOpenFile && recentFiles.length > 0 && (
            <div className={styles.welcomeRecent}>
              <div className={styles.welcomeRecentTitle}>
                最近開いたファイル
              </div>
              {recentFiles.map((f) => (
                <button
                  type="button"
                  key={f.path}
                  className={styles.welcomeRecentItem}
                  data-testid="welcome-recent-item"
                  onClick={() => onOpenFile(f.path)}
                >
                  <span className={styles.welcomeRecentName}>{f.name}</span>
                  <span className={styles.welcomeRecentDir}>{f.dir}</span>
                </button>
              ))}
            </div>
          )}
          {onOpenFile && onOpenDir && bookmarks.length > 0 && (
            <div className={styles.welcomeRecent}>
              <div className={styles.welcomeRecentTitle}>ブックマーク</div>
              {bookmarks.map((b) => (
                <button
                  type="button"
                  key={b.path}
                  className={styles.welcomeRecentItem}
                  data-testid="welcome-bookmark-item"
                  data-type={b.type}
                  onClick={() =>
                    b.type === 'dir' ? onOpenDir(b.path) : onOpenFile(b.path)
                  }
                >
                  <span className={styles.welcomeRecentName}>
                    {b.type === 'dir' ? '📁 ' : ''}
                    {b.name}
                  </span>
                  <span className={styles.welcomeRecentDir}>{b.dir}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!isEmpty &&
        blocks.map((block) => (
          <MarkdownBlock
            key={block.key}
            block={block}
            hasComment={hasCommentSet.has(block.key)}
            highlighted={highlightedBlockLs === block.lineStart}
            onAddComment={onAddComment}
            onOpenDrawio={onOpenDrawio}
            onOpenMermaidZoom={onOpenMermaidZoom}
            onRef={handleRef}
          />
        ))}
    </div>
  );
}
