/**
 * 配置画面（WidgetArrangeScreen）に出す「枠の中身」の情報。
 *
 * 配置画面は長らく名前のチップを並べるだけで、置いてみるまで何が出るのか
 * ——そもそも今その枠に出ているのか——が分からなかった。ここではその 2 つを
 * 純関数で作る。
 *
 * - 表示状態（`widgetVisibility`）: 枠に置いてあっても、条件を満たさず今は
 *   出ていないウィジェットがある（ルート未指定のエクスプローラーなど）。
 *   出ていない理由と出し方を添えて配置画面の注記にする。実際に描くかどうかを
 *   決める `App.renderWidget` も同じ判定を使うので、注記と画面がずれない。
 * - 縮小プレビュー（`buildWidgetPreviews`）: 各ウィジェットが実際に並べる
 *   中身の先頭数件。ウィジェット本体をもう一度描いて縮小する手もあるが、
 *   testid が二重になり Mermaid の描画や検索リクエストも二重に走るため、
 *   本体と同じ純関数（`docScan` など）から中身だけを取り出して並べる。
 *
 * 走査のコストは本文の長さに比例するので、`buildWidgetPreviews` は配置画面を
 * 開いているあいだだけ呼ぶ（`widgetVisibility` は本文を見ないので毎描画で安い）。
 */

import {
  computeDocStats,
  extractDiagrams,
  extractLinks,
  extractTasks,
  parseFrontmatter,
} from './docScan.ts';
import { WIDGET_IDS, type WidgetId } from './widgets.ts';

/** プレビューに並べる件数の上限（チップが縦に伸びすぎないように）。 */
export const PREVIEW_ITEM_LIMIT = 3;

// ------------------------------------------------------------ 表示状態

/** 「今この瞬間に画面へ出るか」を決める、配置とは別軸の画面の状態。 */
export interface WidgetVisibilityInput {
  /** 開いているファイル数。 */
  fileCount: number;
  /** エクスプローラーのルートディレクトリが指定されているか。 */
  hasRoot: boolean;
  /** アウトラインのトグルが開いているか。 */
  outlineOpen: boolean;
  /** コメントパネルが開いているか。 */
  commentsOpen: boolean;
}

export interface WidgetVisibility {
  /** 枠に置いたとき、今この瞬間に画面へ出るか。 */
  visible: boolean;
  /** 出ていない理由と、出すための操作。`visible` なら null。 */
  reason: string | null;
}

/**
 * ウィジェットごとの表示状態。
 *
 * タブは横行だと 2 ファイル以上でのみ出るが、枠に置いた縦置きは 1 ファイル
 * でも出す（`FileTabs` 側の分岐と合わせる）。第2弾のウィジェットは既定位置も
 * トグルも持たない（枠に置く＝出す）ので常に出る——中身が空のときは各
 * ウィジェットが自分で「ありません」を出すので、ここで隠すと「置いたのに
 * 何も現れない」になってしまう。
 */
export function widgetVisibility(
  input: WidgetVisibilityInput,
): Record<WidgetId, WidgetVisibility> {
  const reasons: Partial<Record<WidgetId, string>> = {};
  if (input.fileCount === 0) reasons.tabs = 'ファイルをまだ開いていません';
  if (!input.hasRoot)
    reasons.explorer = 'ルートが未指定です（「フォルダを開く」で指定）';
  if (!input.outlineOpen)
    reasons.outline = 'ツールバーの「アウトライン」で開きます';
  if (!input.commentsOpen)
    reasons.comments = 'ツールバーの「コメント」で開きます';

  const out = {} as Record<WidgetId, WidgetVisibility>;
  for (const id of WIDGET_IDS) {
    const reason = reasons[id] ?? null;
    out[id] = { visible: reason === null, reason };
  }
  return out;
}

// ---------------------------------------------------------- プレビュー

/**
 * プレビューの材料。本文から導けるもの（タスク・リンク・図・統計・
 * frontmatter）はここで走査するので、App が既に持っている値だけを渡す。
 */
export interface WidgetPreviewInput {
  /** 本文（Markdown ソース）。 */
  source: string;
  /** 見出しの文言（アウトラインが並べる順）。 */
  headings: string[];
  /** 開いているファイルの名前。 */
  openFiles: string[];
  /** エクスプローラーのツリーに並ぶ名前（上から順）。 */
  treeEntries: string[];
  /** コメントの本文（一覧に並ぶ順）。 */
  comments: string[];
  /** 最近開いた / ブックマークの名前。 */
  recent: string[];
  /** 辞書の用語。 */
  terms: string[];
  /** 差分サマリの変更のかたまり（代表行）。 */
  diffHunks: string[];
  /** チェックポイントが設定されているか。 */
  checkpointSet: boolean;
}

export interface WidgetPreview {
  /** 実際に並ぶ中身の先頭数件（最大 `PREVIEW_ITEM_LIMIT` 件）。 */
  items: string[];
  /** 中身の総数。`items` より多ければ「ほか N 件」を出す。 */
  total: number;
  /** 並べる中身が無いときの一言。`items` が空のときだけ使う。 */
  note: string;
}

/** ウィジェットごとの縮小プレビュー。 */
export function buildWidgetPreviews(
  input: WidgetPreviewInput,
): Record<WidgetId, WidgetPreview> {
  const out = {} as Record<WidgetId, WidgetPreview>;
  for (const id of WIDGET_IDS) out[id] = previewOf(id, input);
  return out;
}

function previewOf(id: WidgetId, input: WidgetPreviewInput): WidgetPreview {
  const { source } = input;
  switch (id) {
    case 'tabs':
      return list(input.openFiles, '開いているファイルがありません');
    case 'explorer':
      return list(input.treeEntries, 'ルートが未指定でツリーがありません');
    case 'outline':
      return list(input.headings, '見出しがありません');
    case 'comments':
      return list(input.comments, 'コメントがありません');
    case 'search':
      // 検索語を入れてはじめて中身が決まるので、先出しできる一覧が無い。
      return note('検索語を入れると一致した行が並びます');
    case 'recent':
      return list(input.recent, 'まだ履歴もブックマークもありません');
    case 'minimap':
      // 一覧ではなく図なので、代わりに「どれだけを俯瞰するか」を出す。
      return note(
        source.trim() === ''
          ? '本文がありません'
          : `${countLines(source)} 行を 1 枚に俯瞰します`,
      );
    case 'diagrams':
      return list(
        extractDiagrams(source).map((d, i) => d.kind || `図 ${i + 1}`),
        'Mermaid の図がありません',
      );
    case 'tasks':
      return list(
        extractTasks(source).map((t) => t.text),
        'チェックボックス（- [ ]）がありません',
      );
    case 'links':
      return list(
        extractLinks(source).map((l) => l.label || l.target),
        'リンクも画像もありません',
      );
    case 'terms':
      return list(input.terms, '辞書が空です');
    case 'frontmatter': {
      const fm = parseFrontmatter(source);
      if (fm === null) return note('frontmatter がありません');
      return list(
        fm.fields.map((f) => (f.value ? `${f.key}: ${f.value}` : f.key)),
        'frontmatter にキーがありません',
      );
    }
    case 'diffsummary':
      if (!input.checkpointSet)
        return note('チェックポイントを設定すると変更が並びます');
      return list(input.diffHunks, 'チェックポイントからの変更はありません');
    case 'stats': {
      // 統計は一覧ではないので、代表的な数字を 3 つだけ並べる。総数を並べた
      // 数と揃えて「ほか N 件」が出ないようにする。
      const s = computeDocStats(source);
      const items = [
        `${s.chars.toLocaleString()} 字`,
        `見出し ${s.headings}`,
        `約 ${s.readingMinutes} 分`,
      ];
      return { items, total: items.length, note: '' };
    }
  }
}

/** 一覧を持つウィジェットのプレビュー。空なら `emptyNote` を出す。 */
function list(items: string[], emptyNote: string): WidgetPreview {
  return {
    items: items.slice(0, PREVIEW_ITEM_LIMIT).map(oneLine),
    total: items.length,
    note: emptyNote,
  };
}

/** 一覧を持たないウィジェットのプレビュー（一言だけ）。 */
function note(text: string): WidgetPreview {
  return { items: [], total: 0, note: text };
}

/** チップの 1 行に収まるよう、改行と連続する空白を畳む。 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function countLines(source: string): number {
  return source.split('\n').length;
}
