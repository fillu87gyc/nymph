import { diffChars } from 'diff';
import { memo, type ReactNode, useCallback } from 'react';
import { esc } from '../lib/markdown.ts';
import type { BlockData } from '../lib/parseBlocks.ts';
import type { Comment, DiffLine } from '../types.ts';
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
  context: Comment['context'],
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
          // mermaid.run() がこの要素の innerHTML を SVG へ置き換えるため、React の
          // 管理下に置くと再レンダリングで描画が競合する。esc() でエスケープ済みの
          // コードを一度だけ流し込み、以降は React に触らせない（children 化は
          // mermaid の DOM 書き換えと衝突するため不可）。参照: React docs
          // "dangerouslySetInnerHTML" / mermaid `mermaid.run`。
          // biome-ignore lint/security/noDangerouslySetInnerHtml: esc() でエスケープ済み、mermaid が直接描画する
          dangerouslySetInnerHTML={{ __html: esc(mermaidCode ?? '') }}
        />
      );
    }
    // html は parseBlocks 内で DOMPurify により sanitize 済み。React で sanitize 済み
    // HTML を挿入する標準手段は dangerouslySetInnerHTML（参照: DOMPurify README の
    // "sanitize" 出力をそのまま挿入する用法）。
    // biome-ignore lint/security/noDangerouslySetInnerHtml: parseBlocks で DOMPurify sanitize 済み
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
              onClick={() => {
                if (block.mermaidCode) onOpenDrawio(block.mermaidCode);
              }}
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
              // diffGroups は diff 計算のたびに丸ごと再生成され、要素固有の安定 id を
              // 持たない。並び順は内容で一意に決まるため index キーで問題ない（参照:
              // React docs "Rendering Lists" — 安定 id が無い場合の index 容認）。
              // biome-ignore lint/suspicious/noArrayIndexKey: diffGroups は毎回再生成され安定 id を持たない
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
