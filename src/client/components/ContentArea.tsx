import { useCallback, useEffect, useMemo, useRef } from 'react';
import { findTextRange } from '../lib/markdown.ts';
import { parseBlocks } from '../lib/parseBlocks.ts';
import type { Comment, DiffLine, DiffResponse } from '../types.ts';
import { type DiffGroup, MarkdownBlock } from './MarkdownBlock.tsx';

interface ContentAreaProps {
  source: string;
  comments: Comment[];
  diffMode: boolean;
  diffData: DiffResponse | null;
  isDarkTheme: boolean;
  highlightedBlockLs: number | null;
  welcomeMsg?: string;
  onAddComment: (
    ls: number,
    le: number,
    displayCtx: string,
    blockType: string,
    context: any,
    selectionOffset: number | null,
  ) => void;
  onOpenDrawio: (code: string) => void;
  onClickCommentAnchor: (c: Comment, x: number, y: number) => void;
  onOrphanedIds?: (ids: Set<number>) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  blockRefsMapRef: React.MutableRefObject<Map<string, HTMLElement>>;
}

export function ContentArea({
  source,
  comments,
  diffMode,
  diffData,
  isDarkTheme,
  highlightedBlockLs,
  welcomeMsg = 'ファイルを読み込んでいます…',
  onAddComment,
  onOpenDrawio,
  onClickCommentAnchor,
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
      if (comments.some((c) => c.ls <= block.le && c.le >= block.ls)) {
        set.add(block.key);
      }
    }
    return set;
  }, [blocks, comments]);

  const diffGroupsMap = useMemo<Map<string, DiffGroup[]>>(() => {
    const map = new Map<string, DiffGroup[]>();
    if (!diffMode || !diffData) return map;

    const groups = new Map<
      number,
      { inserts: DiffLine[]; deletes: DiffLine[] }
    >();
    for (const l of diffData.lines) {
      if (l.g == null) continue;
      if (!groups.has(l.g)) groups.set(l.g, { inserts: [], deletes: [] });
      const g = groups.get(l.g)!;
      if (l.type === 'insert') g.inserts.push(l);
      else if (l.type === 'delete') g.deletes.push(l);
    }

    for (const block of blocks) {
      const matched: DiffGroup[] = [];
      for (const [, g] of groups) {
        if (
          g.inserts.some(
            (l) =>
              l.n != null &&
              l.n >= block.ls &&
              l.n <= block.le &&
              l.content.trim() !== '',
          )
        ) {
          matched.push(g);
        }
      }
      if (matched.length) map.set(block.key, matched);
    }

    return map;
  }, [blocks, diffMode, diffData]);

  // Persistent comment-anchor highlight for selection comments
  useEffect(() => {
    const container = contentRef.current;
    const hl = (CSS as any).highlights as Map<string, unknown> | undefined;
    if (!container || !hl) return;

    hl.delete('comment-anchor');
    commentRangesRef.current = [];

    const orphaned = new Set<number>();

    // Block-level comments: orphaned if no block starts at c.ls
    for (const c of comments) {
      if (c.block_type === 'selection') continue;
      const found = blocks.some((b) => b.ls === c.ls);
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
        const bls = +(el.dataset.ls ?? 0);
        const ble = +(el.dataset.le ?? 0);
        return bls <= c.le && ble >= c.ls;
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
    hl.set('comment-anchor', new (window as any).Highlight(...ranges));

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
      onClick={handleContentClick}
    >
      {isEmpty && (
        <div id="welcome">
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
        </div>
      )}
      {!isEmpty &&
        blocks.map((block) => (
          <MarkdownBlock
            key={block.key}
            block={block}
            hasComment={hasCommentSet.has(block.key)}
            highlighted={highlightedBlockLs === block.ls}
            diffGroups={diffGroupsMap.get(block.key) ?? []}
            diffMode={diffMode}
            onAddComment={onAddComment}
            onOpenDrawio={onOpenDrawio}
            onRef={handleRef}
          />
        ))}
    </div>
  );
}
