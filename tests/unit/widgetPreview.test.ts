import { describe, expect, test } from 'vitest';
import {
  buildWidgetPreviews,
  PREVIEW_ITEM_LIMIT,
  type WidgetPreviewInput,
  type WidgetVisibilityInput,
  widgetVisibility,
} from '../../src/client/lib/widgetPreview.ts';
import { WIDGET_IDS } from '../../src/client/lib/widgets.ts';

function visibilityInput(
  overrides: Partial<WidgetVisibilityInput> = {},
): WidgetVisibilityInput {
  return {
    fileCount: 1,
    hasRoot: true,
    outlineOpen: true,
    commentsOpen: true,
    ...overrides,
  };
}

function previewInput(
  overrides: Partial<WidgetPreviewInput> = {},
): WidgetPreviewInput {
  return {
    source: '',
    headings: [],
    openFiles: [],
    treeEntries: [],
    comments: [],
    recent: [],
    terms: [],
    diffHunks: [],
    checkpointSet: false,
    ...overrides,
  };
}

describe('widgetVisibility', () => {
  test('条件を満たしていれば全部 visible で理由を持たない', () => {
    const vis = widgetVisibility(visibilityInput());
    for (const id of WIDGET_IDS) {
      expect(vis[id]).toEqual({ visible: true, reason: null });
    }
  });

  test('条件を持つ 4 つは、満たさないと理由付きで非表示になる', () => {
    const vis = widgetVisibility(
      visibilityInput({
        fileCount: 0,
        hasRoot: false,
        outlineOpen: false,
        commentsOpen: false,
      }),
    );
    for (const id of ['tabs', 'explorer', 'outline', 'comments'] as const) {
      expect(vis[id].visible).toBe(false);
      expect(vis[id].reason).toBeTruthy();
    }
    // ルート未指定のエクスプローラーは「どうすれば出るか」まで添える
    expect(vis.explorer.reason).toContain('フォルダを開く');
    expect(vis.outline.reason).toContain('アウトライン');
  });

  test('第2弾のウィジェットは条件を持たず、常に出る（枠に置く＝出す）', () => {
    const vis = widgetVisibility(
      visibilityInput({
        fileCount: 0,
        hasRoot: false,
        outlineOpen: false,
        commentsOpen: false,
      }),
    );
    for (const id of ['search', 'minimap', 'tasks', 'stats'] as const) {
      expect(vis[id]).toEqual({ visible: true, reason: null });
    }
  });
});

describe('buildWidgetPreviews', () => {
  test('どのウィジェットにもプレビューがある（増えても穴を開けない）', () => {
    const previews = buildWidgetPreviews(previewInput());
    for (const id of WIDGET_IDS) {
      expect(previews[id]).toBeDefined();
      // 中身が空なら必ず代わりの一言を持つ（無言の空欄を出さない）
      if (previews[id].items.length === 0) {
        expect(previews[id].note).not.toBe('');
      }
    }
  });

  test('先頭 3 件までを並べ、総数は全部数える', () => {
    const headings = ['はじめに', '使い方', '設定', 'FAQ', 'ライセンス'];
    const previews = buildWidgetPreviews(previewInput({ headings }));
    expect(previews.outline.items).toEqual(headings.slice(0, 3));
    expect(previews.outline.items).toHaveLength(PREVIEW_ITEM_LIMIT);
    expect(previews.outline.total).toBe(5);
  });

  test('本文からタスク・リンク・図を実際に拾う', () => {
    const source = [
      '# 見出し',
      '',
      '- [ ] レビューする',
      '- [x] 直す',
      '',
      '[nymph](https://example.com) と ![図](./a.png)',
      '',
      '```mermaid',
      'graph TD;',
      'A-->B;',
      '```',
      '',
      '```',
      '- [ ] コードの中は数えない',
      '```',
    ].join('\n');
    const previews = buildWidgetPreviews(previewInput({ source }));

    expect(previews.tasks.total).toBe(2);
    expect(previews.tasks.items).toEqual(['レビューする', '直す']);
    expect(previews.links.total).toBe(2);
    expect(previews.links.items).toEqual(['nymph', '図']);
    expect(previews.diagrams.total).toBe(1);
    expect(previews.diagrams.items).toEqual(['graph']);
  });

  test('中身が無いときは各ウィジェットの「ありません」と揃った一言を出す', () => {
    const previews = buildWidgetPreviews(previewInput({ source: '本文だけ' }));
    expect(previews.tasks.items).toEqual([]);
    expect(previews.tasks.note).toContain('ありません');
    expect(previews.links.note).toContain('ありません');
    expect(previews.frontmatter.note).toContain('ありません');
  });

  test('frontmatter はキーと値を並べる', () => {
    const source = ['---', 'title: nymph', 'status: draft', '---', '本文'].join(
      '\n',
    );
    const previews = buildWidgetPreviews(previewInput({ source }));
    expect(previews.frontmatter.items).toEqual([
      'title: nymph',
      'status: draft',
    ]);
    expect(previews.frontmatter.total).toBe(2);
  });

  test('文書統計は件数ではなく代表的な数字を出す', () => {
    const previews = buildWidgetPreviews(
      previewInput({ source: '# 見出し\n\n本文です。\n' }),
    );
    expect(previews.stats.items).toHaveLength(3);
    expect(previews.stats.items.some((t) => t.includes('見出し 1'))).toBe(true);
    // 「ほか N 件」を出さないよう、総数は並べた数と揃える
    expect(previews.stats.total).toBe(previews.stats.items.length);
  });

  test('差分サマリはチェックポイントの有無で言うことが変わる', () => {
    const off = buildWidgetPreviews(previewInput({ checkpointSet: false }));
    expect(off.diffsummary.note).toContain('チェックポイント');
    expect(off.diffsummary.items).toEqual([]);

    const on = buildWidgetPreviews(
      previewInput({ checkpointSet: true, diffHunks: ['+ 追記した行'] }),
    );
    expect(on.diffsummary.items).toEqual(['+ 追記した行']);
  });

  test('検索とミニマップは一覧ではないので代わりの一言を出す', () => {
    const previews = buildWidgetPreviews(
      previewInput({ source: '1\n2\n3\n4\n5' }),
    );
    expect(previews.search.items).toEqual([]);
    expect(previews.search.note).toContain('検索');
    expect(previews.minimap.note).toContain('5');
  });

  test('複数行のコメントは 1 行に畳んで出す', () => {
    const previews = buildWidgetPreviews(
      previewInput({ comments: ['ここが\n気になる'] }),
    );
    expect(previews.comments.items).toEqual(['ここが 気になる']);
  });
});
