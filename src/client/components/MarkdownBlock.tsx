import { diffChars } from 'diff';
import { memo, type ReactNode, useCallback, useState } from 'react';
import { esc } from '../lib/markdown.ts';
import type { BlockData } from '../lib/parseBlocks.ts';
import type { DiffLine } from '../types.ts';

export interface DiffGroup {
  inserts: DiffLine[];
  deletes: DiffLine[];
}

function renderCharDiff(
  oldText: string,
  newText: string,
  side: 'del' | 'ins',
): ReactNode {
  const parts = diffChars(oldText, newText);
  let offset = 0;
  return parts.map((part) => {
    const key = offset;
    offset += part.value.length;
    if (part.removed) {
      return side === 'del' ? (
        <mark key={key} className="diff-char-del">
          {part.value}
        </mark>
      ) : null;
    }
    if (part.added) {
      return side === 'ins' ? (
        <mark key={key} className="diff-char-ins">
          {part.value}
        </mark>
      ) : null;
    }
    return <span key={key}>{part.value}</span>;
  });
}

type AddCommentCb = (
  ls: number,
  le: number,
  displayCtx: string,
  blockType: string,
  context: any,
  selectionOffset: number | null,
) => void;

interface MarkdownBlockProps {
  block: BlockData;
  hasComment: boolean;
  highlighted: boolean;
  diffGroups: DiffGroup[];
  diffMode: boolean;
  onAddComment: AddCommentCb;
  onOpenDrawio: (code: string) => void;
  onRef: (key: string, el: HTMLElement | null) => void;
}

// Inner content is memoized so React doesn't clobber mermaid SVG or hljs
// highlights when only hover / comment state changes on the outer wrapper.
const StableContent = memo(
  ({
    html,
    type,
    mermaidCode,
    mermaidId,
  }: {
    html: string;
    type: string;
    mermaidCode?: string;
    mermaidId?: string;
  }) => {
    if (type === 'mermaid') {
      return (
        <div
          className="mermaid"
          id={mermaidId}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid code from our own parser
          dangerouslySetInnerHTML={{ __html: esc(mermaidCode ?? '') }}
        />
      );
    }
    // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML from our own markdown renderer
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  },
  (prev, next) =>
    prev.html === next.html && prev.mermaidCode === next.mermaidCode,
);

export function MarkdownBlock({
  block,
  hasComment,
  highlighted,
  diffGroups,
  diffMode,
  onAddComment,
  onOpenDrawio,
  onRef,
}: MarkdownBlockProps) {
  const [hovered, setHovered] = useState(false);

  const refCallback = useCallback(
    (el: HTMLElement | null) => onRef(block.key, el),
    [block.key, onRef],
  );

  // relatedTarget が自身の子孫（ボタン含む）のときは mouseleave を無視する。
  // ボタンは left: -34px でボックス外に配置されているが DOM 上は子なので
  // contains() が true を返し、ボタンへ移動してもホバー状態が維持される。
  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const related = e.relatedTarget;
      if (related instanceof Node && e.currentTarget.contains(related)) return;
      setHovered(false);
    },
    [],
  );

  const isDiffChanged = diffMode && diffGroups.length > 0;
  const showPlusButton = block.type === 'table' || block.type === 'mermaid';
  const showButton = hovered || hasComment;

  const className = [
    'md-block',
    hasComment && 'has-comment',
    isDiffChanged && 'diff-changed',
    highlighted && 'highlighted',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={refCallback}
      className={className}
      data-block="true"
      data-ls={block.ls}
      data-le={block.le}
      data-block-type={block.type}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {showPlusButton && (
        <button
          className="comment-btn"
          style={{
            opacity: showButton ? 1 : 0,
            pointerEvents: showButton ? 'auto' : 'none',
          }}
          aria-label="コメント"
          onClick={() =>
            onAddComment(
              block.ls,
              block.le,
              block.commentContext.displayCtx,
              block.type,
              block.commentContext.context,
              null,
            )
          }
        >
          ＋
        </button>
      )}

      {block.type === 'mermaid' ? (
        <div className="mermaid-wrap">
          <div className="mermaid-bar">
            <span className="mermaid-label">
              <em>Mermaid</em> Diagram
            </span>
            <button
              className="btn-drawio"
              onClick={() => onOpenDrawio(block.mermaidCode!)}
            >
              → draw.io
            </button>
          </div>
          <div className="mermaid-area">
            <StableContent
              html={block.html}
              type={block.type}
              mermaidCode={block.mermaidCode}
              mermaidId={block.mermaidId}
            />
          </div>
        </div>
      ) : (
        <StableContent html={block.html} type={block.type} />
      )}

      {isDiffChanged &&
        diffGroups.map((group, gi) => {
          const hasBoth = group.deletes.length > 0 && group.inserts.length > 0;
          const validIns = group.inserts.filter((l) => l.content.trim());
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff groups have no stable id
            <div key={gi}>
              {group.deletes.length > 0 && (
                <div className="diff-side diff-side-del">
                  {group.deletes.map((d, i) => {
                    const paired = hasBoth ? group.inserts[i] : undefined;
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no stable id
                      <span key={i} className="diff-del">
                        −{' '}
                        {paired
                          ? renderCharDiff(d.content, paired.content, 'del')
                          : d.content || ' '}
                      </span>
                    );
                  })}
                </div>
              )}
              {validIns.length > 0 && (
                <div className="diff-side diff-side-ins">
                  {validIns.map((ins, i) => {
                    const paired = hasBoth ? group.deletes[i] : undefined;
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no stable id
                      <span key={i} className="diff-ins">
                        +{' '}
                        {paired
                          ? renderCharDiff(paired.content, ins.content, 'ins')
                          : ins.content}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
