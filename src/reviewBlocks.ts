/**
 * 本文を「コメントが紐づく単位（ブロック）」へ分け、対象が消えたコメントを
 * 洗い出す。HTML エクスポート / Markdown 書き戻し / CSV エクスポートの
 * 3 経路が共有する。
 *
 * 出力ごとに独自にブロックを数えると、同じコメントが出力によって別の場所に
 * 付いたり、片方だけ「削除済」になったりする。行番号の割り当てはアプリ本体と
 * 同じ `assignLines` / `getBlockTokensDFS` を使い、状態判定は `commentStatus`
 * に委ねる——アンカーの解釈は 1 箇所に集約する。
 */

import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Marked, type Tokens } from 'marked';
import { assignLines, esc, getBlockTokensDFS } from './client/lib/markdown.ts';
import type { Comment } from './client/types.ts';
import { IMAGE_MIME } from './imageMime.ts';
import { resolveLinkTarget } from './linkCheck.ts';

/** 1 枚あたりの埋め込み上限。これを超える画像は元の src のまま残す。 */
export const MAX_EMBED_IMAGE_BYTES = 2 * 1024 * 1024;

export interface ReviewBlock {
  /** レンダリング済み HTML。mermaid ブロックでは空文字。 */
  html: string;
  lineStart: number;
  lineEnd: number;
  type: string;
  /** type が 'mermaid' のときのみ、図のソース。 */
  mermaidCode?: string;
}

/** ローカル画像を読んでデータ URI にする。埋め込めないものは null。 */
function toDataUri(href: string, baseDir: string): string | null {
  // 判定範囲は「開いているファイルのディレクトリ配下」に限る。
  // リンクの生死チェックと同じ封じ込め方針で、`../../etc/...` のような
  // 範囲外のファイルを配布物へ吸い上げてしまうことを防ぐ。
  const abs = resolveLinkTarget(href, baseDir, baseDir);
  if (abs === null) return null;
  const mime = IMAGE_MIME[extname(abs).toLowerCase()];
  if (!mime) return null;
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_EMBED_IMAGE_BYTES) return null;
    return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * ブロック分割用の marked インスタンス。
 *
 * グローバルな `marked` を `use()` で汚すと同じプロセス内の dict ビルド等に
 * 影響が出るため、呼び出しごとに独立したインスタンスを作る。
 *
 * `embedImages` を立てるのは HTML エクスポートだけ（生成物を単体で完結させる
 * ため）。Markdown / CSV は本文をそのまま出す・出さないだけなので、画像を
 * 読みに行く必要がない。
 */
export function createBlockRenderer(
  baseDir: string,
  embedImages: boolean,
): Marked {
  return new Marked({
    renderer: {
      // 生 HTML はブロック・インラインとも literal 表示（htmlExport.ts 参照）。
      html({ text }: Tokens.HTML | Tokens.Tag): string {
        return esc(text);
      },
      image(token: Tokens.Image): string {
        const alt = esc(token.text ?? '');
        const embedded = embedImages ? toDataUri(token.href, baseDir) : null;
        const src = esc(embedded ?? token.href);
        const title = token.title ? ` title="${esc(token.title)}"` : '';
        return `<img src="${src}" alt="${alt}"${title}>`;
      },
    },
  });
}

/**
 * 本文をブロック（コメントが紐づく単位）へ分解する。
 *
 * 行番号の割り当ては本体と同じ `assignLines` / `getBlockTokensDFS` を使う。
 * ここで独自に数えるとコメントのアンカーがアプリとずれるため、必ず共有する。
 */
export function buildReviewBlocks(src: string, md: Marked): ReviewBlock[] {
  const tokens = md.lexer(src);
  assignLines(src, tokens);
  const blocks: ReviewBlock[] = [];

  for (const t of getBlockTokensDFS(tokens)) {
    if (t.__nested) continue;
    const lineStart = t.lineStart || 1;
    const lineEnd = t.lineEnd || lineStart;

    if (t.type === 'code') {
      if (t.lang === 'mermaid' || t.lang === 'mmd') {
        blocks.push({
          html: '',
          lineStart,
          lineEnd,
          type: 'mermaid',
          mermaidCode: t.text,
        });
      } else {
        const lang = t.lang?.trim() || 'plaintext';
        blocks.push({
          html: `<pre><code class="language-${esc(lang)}">${esc(t.text)}</code></pre>`,
          lineStart,
          lineEnd,
          type: 'code',
        });
      }
      continue;
    }

    blocks.push({
      html: (md.parse(t.raw) as string).trim(),
      lineStart,
      lineEnd,
      type: t.type,
    });
  }

  return blocks;
}

/** HTML タグを落として本文テキストだけにする（選択コメントの照合用）。 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 「もとの文章が消えている」コメントを洗い出す。
 *
 * 判定規則はアプリ（`ContentArea.tsx`）と揃える:
 *  - ブロックコメント: `lineStart` から始まるブロックが無ければ消えた扱い
 *  - 選択コメント: 重なるブロックの表示テキストに文言が見つからなければ消えた扱い
 *  - 差分コメント: 本文ブロックに紐づかないので、ここでは判定しない
 */
export function findOrphanedIds(
  blocks: readonly ReviewBlock[],
  comments: readonly Comment[],
): Set<Comment['id']> {
  const orphaned = new Set<Comment['id']>();
  const textOf = new Map<ReviewBlock, string>();

  for (const c of comments) {
    if (c.block_type === 'diff') continue;

    if (c.block_type === 'selection' && typeof c.context === 'string') {
      const needle = c.context.endsWith('…')
        ? c.context.slice(0, -1)
        : c.context;
      const overlapping = blocks.filter(
        (b) => c.lineStart <= b.lineEnd && c.lineEnd >= b.lineStart,
      );
      const found = overlapping.some((b) => {
        let text = textOf.get(b);
        if (text === undefined) {
          text = stripTags(b.html || b.mermaidCode || '');
          textOf.set(b, text);
        }
        return text.includes(needle);
      });
      if (!found) orphaned.add(c.id);
      continue;
    }

    if (!blocks.some((b) => b.lineStart === c.lineStart)) orphaned.add(c.id);
  }

  return orphaned;
}

/**
 * コメントを最初に重なったブロックへ 1 度だけ割り当てる。
 *
 * どのブロックにも重ならないもの（対象が消えた指摘）と、そもそも本文に
 * 紐づかない差分コメントは `unanchored` へ回す。出力側はこれを末尾へまとめる。
 */
export function anchorComments<T extends Comment>(
  blocks: readonly ReviewBlock[],
  comments: readonly T[],
): { attached: Map<ReviewBlock, T[]>; unanchored: T[] } {
  const attached = new Map<ReviewBlock, T[]>();
  const placed = new Set<Comment['id']>();

  for (const block of blocks) {
    const here = comments.filter(
      (c) =>
        c.block_type !== 'diff' &&
        !placed.has(c.id) &&
        c.lineStart <= block.lineEnd &&
        c.lineEnd >= block.lineStart,
    );
    for (const c of here) placed.add(c.id);
    attached.set(block, here);
  }

  return {
    attached,
    unanchored: comments.filter((c) => !placed.has(c.id)),
  };
}
