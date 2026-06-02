import { diffChars } from 'diff';
import { memo, type ReactNode, useCallback } from 'react';
import { esc } from '../lib/markdown.ts';
import type { BlockData } from '../lib/parseBlocks.ts';
import type { DiffLine } from '../types.ts';
import styles from './MarkdownBlock.module.css';

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
        <mark
          key={key}
          className={styles.diffCharDel}
          data-testid="diff-char-del"
        >
          {part.value}
        </mark>
      ) : null;
    }
    if (part.added) {
      return side === 'ins' ? (
        <mark
          key={key}
          className={styles.diffCharIns}
          data-testid="diff-char-ins"
        >
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
// highlights when only comment / highlight / diff state changes on the wrapper.
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
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid code from our own parser, escaped via esc()
          dangerouslySetInnerHTML={{ __html: esc(mermaidCode ?? '') }}
        />
      );
    }
    // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized by DOMPurify in parseBlocks
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
  const refCallback = useCallback(
    (el: HTMLElement | null) => onRef(block.key, el),
    [block.key, onRef],
  );

  const isDiffChanged = diffMode && diffGroups.length > 0;
  const showPlusButton = block.type === 'table' || block.type === 'mermaid';

  return (
    <div
      ref={refCallback}
      className={styles.block}
      data-testid="md-block"
      data-block="true"
      data-ls={block.ls}
      data-le={block.le}
      data-block-type={block.type}
      data-has-comment={String(hasComment)}
      data-diff-changed={String(isDiffChanged)}
      data-highlighted={String(highlighted)}
    >
      {showPlusButton && (
        <button
          className={styles.commentBtn}
          data-testid="comment-btn"
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
        <div className={styles.mermaidWrap} data-testid="mermaid-wrap">
          <div className={styles.mermaidBar}>
            <span className={styles.mermaidLabel}>
              <em>Mermaid</em> Diagram
            </span>
            <button
              className={styles.btnDrawio}
              data-testid="btn-drawio"
              onClick={() => onOpenDrawio(block.mermaidCode!)}
            >
              → draw.io
            </button>
          </div>
          <div className={styles.mermaidArea}>
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

      {isDiffChanged && (
        <div className={styles.diffAside} data-testid="diff-aside">
          {diffGroups.map((group, gi) => {
            const oneToOne =
              group.deletes.length === group.inserts.length &&
              group.deletes.length > 0;
            const validIns = group.inserts.filter((l) => l.content.trim());
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff groups have no stable id
              <div key={gi}>
                {group.deletes.length > 0 && (
                  <div
                    className={`${styles.diffSide} ${styles.diffSideDel}`}
                    data-testid="diff-side-del"
                  >
                    {group.deletes.map((d, i) => {
                      const paired = oneToOne ? group.inserts[i] : undefined;
                      const delKey = `g${gi}d${i}`;
                      return (
                        <span
                          key={delKey}
                          className={styles.diffDel}
                          data-testid="diff-del"
                        >
                          −{' '}
                          {paired ? (
                            renderCharDiff(d.content, paired.content, 'del')
                          ) : (
                            <mark
                              className={styles.diffCharDel}
                              data-testid="diff-char-del"
                            >
                              {d.content || ' '}
                            </mark>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
                {validIns.length > 0 && (
                  <div
                    className={`${styles.diffSide} ${styles.diffSideIns}`}
                    data-testid="diff-side-ins"
                  >
                    {validIns.map((ins, i) => {
                      const paired = oneToOne ? group.deletes[i] : undefined;
                      const insKey = `g${gi}i${i}`;
                      return (
                        <span
                          key={insKey}
                          className={styles.diffIns}
                          data-testid="diff-ins"
                        >
                          +{' '}
                          {paired ? (
                            renderCharDiff(paired.content, ins.content, 'ins')
                          ) : (
                            <mark
                              className={styles.diffCharIns}
                              data-testid="diff-char-ins"
                            >
                              {ins.content}
                            </mark>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
