import { memo, useState } from 'react';
import { esc } from '../lib/markdown.ts';
import type { BlockData } from '../lib/parseBlocks.ts';
import type { DiffLine } from '../types.ts';

export interface DiffGroup {
  inserts: DiffLine[];
  deletes: DiffLine[];
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
  diffGroups: DiffGroup[];
  diffMode: boolean;
  onAddComment: AddCommentCb;
  onOpenDrawio: (code: string) => void;
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
  diffGroups,
  diffMode,
  onAddComment,
  onOpenDrawio,
}: MarkdownBlockProps) {
  const [hovered, setHovered] = useState(false);

  const showButton = hovered || hasComment;
  const isDiffChanged = diffMode && diffGroups.length > 0;

  const diffDels = isDiffChanged ? diffGroups.flatMap((g) => g.deletes) : [];
  const diffIns = isDiffChanged
    ? diffGroups.flatMap((g) => g.inserts).filter((l) => l.content.trim())
    : [];

  return (
    <div
      className={`md-block${hasComment ? ' has-comment' : ''}${isDiffChanged ? ' diff-changed' : ''}`}
      data-ls={block.ls}
      data-le={block.le}
      data-block-type={block.type}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
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

      {diffDels.length > 0 && (
        <div className="diff-side diff-side-del">
          {diffDels.map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no stable id
            <span key={i} className="diff-del">
              − {d.content || ' '}
            </span>
          ))}
        </div>
      )}
      {diffIns.length > 0 && (
        <div className="diff-side diff-side-ins">
          {diffIns.map((ins, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no stable id
            <span key={i} className="diff-ins">
              + {ins.content}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
