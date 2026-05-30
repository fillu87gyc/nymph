import { useEffect, useRef } from 'react';
import {
  applyDiffHighlight,
  renderMarkdown,
  restoreIndicators,
} from '../lib/markdown.ts';
import type { Comment, DiffResponse } from '../types.ts';

interface ContentAreaProps {
  source: string;
  comments: Comment[];
  diffMode: boolean;
  diffData: DiffResponse | null;
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
}

export function ContentArea({
  source,
  comments,
  diffMode,
  diffData,
  onAddComment,
  onOpenDrawio,
  contentRef,
}: ContentAreaProps) {
  const welcomeRef = useRef<HTMLDivElement>(null);
  const renderVersion = useRef(0);

  // Full re-render when source changes
  useEffect(() => {
    const container = contentRef.current;
    const welcome = welcomeRef.current;
    if (!container || !welcome) return;

    const ver = ++renderVersion.current;
    (async () => {
      await renderMarkdown(
        container,
        welcome,
        source,
        onAddComment,
        onOpenDrawio,
      );
      if (ver !== renderVersion.current) return;
      restoreIndicators(container, comments);
      applyDiffHighlight(container, diffMode, diffData);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    onAddComment,
    contentRef.current,
    onOpenDrawio,
    diffMode,
    diffData,
    comments,
  ]);

  // Update indicators when comments change (no full re-render)
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    restoreIndicators(container, comments);
  }, [comments, contentRef]);

  // Update diff highlighting
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    applyDiffHighlight(container, diffMode, diffData);
  }, [diffMode, diffData, contentRef]);

  return (
    <div id="content" ref={contentRef as React.RefObject<HTMLDivElement>}>
      <div id="welcome" ref={welcomeRef}>
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
        <p id="welcome-msg">ファイルを読み込んでいます…</p>
      </div>
    </div>
  );
}
