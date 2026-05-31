import { useCallback, useEffect, useMemo } from 'react';
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
  contentRef,
  blockRefsMapRef,
}: ContentAreaProps) {
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
    <div id="content" ref={contentRef as React.RefObject<HTMLDivElement>}>
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
