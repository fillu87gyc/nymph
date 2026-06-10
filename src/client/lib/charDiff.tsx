import { diffChars } from 'diff';
import type { ReactNode } from 'react';

// 1:1 対応する削除行/追加行のペアを文字単位で比較し、片側分のハイライトを返す。
// side='del' は削除行（removed 部分を強調）、side='ins' は追加行（added 部分を強調）。
export function renderCharDiff(
  oldText: string,
  newText: string,
  side: 'del' | 'ins',
  classes: { del: string; ins: string },
): ReactNode {
  const parts = diffChars(oldText, newText);
  let offset = 0;
  return parts.map((part) => {
    const key = offset;
    offset += part.value.length;
    if (part.removed) {
      return side === 'del' ? (
        <mark key={key} className={classes.del} data-testid="diff-char-del">
          {part.value}
        </mark>
      ) : null;
    }
    if (part.added) {
      return side === 'ins' ? (
        <mark key={key} className={classes.ins} data-testid="diff-char-ins">
          {part.value}
        </mark>
      ) : null;
    }
    return <span key={key}>{part.value}</span>;
  });
}
