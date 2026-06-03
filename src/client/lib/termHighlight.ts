import type { DictEntry } from '../types.ts';

const MARK_ATTR = 'data-dict-term';

export function clearTermHighlights(container: HTMLElement): void {
  for (const mark of Array.from(
    container.querySelectorAll(`mark[${MARK_ATTR}]`),
  )) {
    const parent = mark.parentNode;
    if (!parent) continue;
    // テキストノードに戻す
    const text = document.createTextNode(mark.textContent ?? '');
    parent.replaceChild(text, mark);
    parent.normalize();
  }
}

// 日本語・英語の両方に対応する境界チェック
function isBoundary(char: string | undefined): boolean {
  if (char === undefined) return true;
  // 空白・改行・句読点・括弧・記号などで区切られている
  return /[\s　、。，．「」『』（）()\[\]{}<>,.!?;:'"'"""。、「」『』【】（）]/.test(
    char,
  );
}

function buildPattern(
  entries: DictEntry[],
): Array<{ term: string; pattern: string }> {
  const terms: Array<{ term: string; pattern: string }> = [];
  for (const entry of entries) {
    const allTerms = [entry.term, ...entry.aliases].filter(Boolean);
    for (const t of allTerms) {
      if (t) {
        terms.push({ term: entry.term, pattern: t });
      }
    }
  }
  // 長い用語を先にマッチさせる（誤爆防止）
  terms.sort((a, b) => b.pattern.length - a.pattern.length);
  return terms;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyTermHighlights(
  container: HTMLElement,
  entries: DictEntry[],
): void {
  clearTermHighlights(container);
  if (entries.length === 0) return;

  const termPatterns = buildPattern(entries);
  if (termPatterns.length === 0) return;

  // 全パターンを1つの正規表現に結合
  const combinedPattern = termPatterns
    .map((t) => escapeRegex(t.pattern))
    .join('|');
  const regex = new RegExp(`(${combinedPattern})`, 'g');

  // mark 要素が入ると入れ子になるため、スキップするタグ
  const SKIP_TAGS = new Set([
    'MARK',
    'SCRIPT',
    'STYLE',
    'CODE',
    'PRE',
    'A',
    'BUTTON',
  ]);

  function processNode(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      // data-dict-term がすでにある mark はスキップ
      if (el.hasAttribute(MARK_ATTR)) return;
      for (const child of Array.from(node.childNodes)) {
        processNode(child);
      }
      return;
    }

    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? '';
    if (!text.trim()) return;

    // テキスト内に用語が含まれているか確認
    regex.lastIndex = 0;
    if (!regex.test(text)) return;

    regex.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: regex loop pattern
    while ((match = regex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      const matched = match[0];

      // 境界チェック
      const prevChar = text[matchStart - 1];
      const nextChar = text[matchEnd];
      if (!isBoundary(prevChar) || !isBoundary(nextChar)) continue;

      // マッチ前のテキスト
      if (matchStart > lastIndex) {
        frag.appendChild(
          document.createTextNode(text.slice(lastIndex, matchStart)),
        );
      }

      // どの entry の term / alias にマッチしたか調べる
      const entryTerm =
        termPatterns.find(
          (t) => t.pattern.toLowerCase() === matched.toLowerCase(),
        )?.term ?? matched;

      const mark = document.createElement('mark');
      mark.setAttribute(MARK_ATTR, entryTerm);
      mark.textContent = matched;
      frag.appendChild(mark);

      lastIndex = matchEnd;
    }

    if (lastIndex === 0) return; // 有効なマッチなし（境界条件で全スキップ）

    // 残りのテキスト
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(frag, node);
  }

  processNode(container);
}
