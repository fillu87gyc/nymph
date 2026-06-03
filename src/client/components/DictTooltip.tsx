import { createPortal } from 'react-dom';
import { sanitizeHtml } from '../lib/sanitize.ts';
import type { DictEntry } from '../types.ts';
import styles from './DictTooltip.module.css';

interface DictTooltipProps {
  entry: DictEntry | null;
  anchorRect: DOMRect | null;
}

export function DictTooltip({ entry, anchorRect }: DictTooltipProps) {
  const visible = entry !== null && anchorRect !== null;

  const top = anchorRect ? anchorRect.bottom + 8 : 0;
  const left = anchorRect
    ? Math.max(8, Math.min(anchorRect.left, window.innerWidth - 296))
    : 0;

  return createPortal(
    <div
      data-testid="dict-tooltip"
      className={styles.tooltip}
      style={{
        display: visible ? 'block' : 'none',
        top,
        left,
      }}
    >
      {entry && (
        <>
          <div className={styles.term}>{entry.term}</div>
          {entry.definitionHtml ? (
            <div
              className={styles.definition}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(entry.definitionHtml),
              }}
            />
          ) : (
            <div className={styles.definition}>{entry.definition}</div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
