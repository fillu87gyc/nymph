import { memo, useCallback, useRef } from 'react';
import { esc } from '../lib/markdown.ts';
import type { BlockData } from '../lib/parseBlocks.ts';
import type { Comment } from '../types.ts';
import styles from './MarkdownBlock.module.css';

type AddCommentCb = (
  lineStart: number,
  lineEnd: number,
  displayCtx: string,
  blockType: string,
  context: Comment['context'],
  selectionOffset: number | null,
) => void;

interface MarkdownBlockProps {
  block: BlockData;
  hasComment: boolean;
  highlighted: boolean;
  onAddComment: AddCommentCb;
  onOpenDrawio: (code: string) => void;
  onOpenMermaidZoom: (html: string) => void;
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
  onAddComment,
  onOpenDrawio,
  onOpenMermaidZoom,
  onRef,
}: MarkdownBlockProps) {
  const refCallback = useCallback(
    (el: HTMLElement | null) => onRef(block.key, el),
    [block.key, onRef],
  );
  const mermaidAreaRef = useRef<HTMLDivElement | null>(null);

  const handleMermaidZoom = useCallback(() => {
    const svg = mermaidAreaRef.current?.querySelector('.mermaid svg');
    if (!svg) return;
    // mermaid は width="100%" を付与し、表示中の（狭い）コンテナ幅に合わせて縮小
    // 表示している。モーダルではコンテナ幅に関わらず viewBox 由来の実寸で
    // 表示したいので、クローンに明示的な width/height（px）を入れ直す。
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const viewBox = clone.getAttribute('viewBox');
    const dims = viewBox?.split(/\s+/).map(Number);
    if (dims && dims.length === 4 && dims[2] > 0 && dims[3] > 0) {
      clone.setAttribute('width', String(dims[2]));
      clone.setAttribute('height', String(dims[3]));
      clone.style.maxWidth = 'none';
    }
    onOpenMermaidZoom(clone.outerHTML);
  }, [onOpenMermaidZoom]);

  const showPlusButton = block.type === 'table' || block.type === 'mermaid';

  return (
    <div
      ref={refCallback}
      className={styles.block}
      data-testid="md-block"
      data-block="true"
      data-line-start={block.lineStart}
      data-line-end={block.lineEnd}
      data-block-type={block.type}
      data-has-comment={String(hasComment)}
      data-highlighted={String(highlighted)}
    >
      {showPlusButton && (
        <button
          className={styles.commentBtn}
          data-testid="comment-btn"
          aria-label="コメント"
          onClick={() =>
            onAddComment(
              block.lineStart,
              block.lineEnd,
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
          <div
            ref={mermaidAreaRef}
            className={styles.mermaidArea}
            data-testid="mermaid-area"
            title="クリックで拡大表示"
            onClick={handleMermaidZoom}
          >
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
    </div>
  );
}
