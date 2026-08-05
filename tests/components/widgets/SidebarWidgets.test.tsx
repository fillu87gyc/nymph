/**
 * 外から渡されたデータを並べるウィジェット（最近 / ブックマーク・用語集・
 * 差分サマリ・ミニマップ）。フェッチは App 側の責務なので、ここでは props
 * から一覧と操作が正しく組み立つかだけを見る。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { DiffSummaryWidget } from '../../../src/client/components/widgets/DiffSummaryWidget.tsx';
import { MinimapWidget } from '../../../src/client/components/widgets/MinimapWidget.tsx';
import { RecentWidget } from '../../../src/client/components/widgets/RecentWidget.tsx';
import { TermsWidget } from '../../../src/client/components/widgets/TermsWidget.tsx';
import type {
  BookmarkEntry,
  Comment,
  DictEntry,
  DiffResponse,
  RecentEntry,
} from '../../../src/client/types.ts';

describe('RecentWidget', () => {
  const recentFiles: RecentEntry[] = [
    { path: '/docs/a.md', name: 'a.md', dir: '/docs', openedAt: '2026-08-01' },
  ];
  const bookmarks: BookmarkEntry[] = [
    {
      path: '/docs/b.md',
      name: 'b.md',
      dir: '/docs',
      type: 'file',
      addedAt: '2026-08-01',
    },
    {
      path: '/docs',
      name: 'docs',
      dir: '/',
      type: 'dir',
      addedAt: '2026-08-01',
    },
  ];

  test('履歴とブックマークをそれぞれ並べる', () => {
    render(
      <RecentWidget
        recentFiles={recentFiles}
        bookmarks={bookmarks}
        activeFile="/docs/a.md"
        onOpenFile={vi.fn()}
        onOpenDir={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('recent-widget-file')).toHaveLength(1);
    expect(screen.getAllByTestId('recent-widget-bookmark')).toHaveLength(2);
    expect(screen.getByTestId('recent-widget-file')).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  test('ファイルとディレクトリで開き方を使い分ける', async () => {
    const onOpenFile = vi.fn();
    const onOpenDir = vi.fn();
    render(
      <RecentWidget
        recentFiles={recentFiles}
        bookmarks={bookmarks}
        activeFile={null}
        onOpenFile={onOpenFile}
        onOpenDir={onOpenDir}
      />,
    );
    const marks = screen.getAllByTestId('recent-widget-bookmark');
    await userEvent.click(marks[0]);
    expect(onOpenFile).toHaveBeenCalledWith('/docs/b.md');
    await userEvent.click(marks[1]);
    expect(onOpenDir).toHaveBeenCalledWith('/docs');
  });

  test('どちらも空ならその旨を出す', () => {
    render(
      <RecentWidget
        recentFiles={[]}
        bookmarks={[]}
        activeFile={null}
        onOpenFile={vi.fn()}
        onOpenDir={vi.fn()}
      />,
    );
    expect(screen.getByTestId('recent-widget')).toHaveTextContent(
      'まだ履歴もブックマークもありません',
    );
  });
});

describe('TermsWidget', () => {
  const entries: DictEntry[] = [
    {
      term: 'nymph',
      aliases: ['ニンフ'],
      definition: 'Markdown レビューツール',
      definitionHtml: '',
      source: 'dict',
      sourceRef: '',
    },
    {
      term: 'crit',
      aliases: [],
      definition: '参考にしたツール',
      definitionHtml: '',
      source: 'dict',
      sourceRef: '',
    },
  ];
  const source = '# nymph\n\nニンフ は便利。\n';

  test('用語と出現回数を並べる', () => {
    render(
      <TermsWidget entries={entries} source={source} onSelectLine={vi.fn()} />,
    );
    const items = screen.getAllByTestId('terms-widget-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-count', '2');
    // 本文に出てこない用語は押せない
    expect(items[1]).toBeDisabled();
  });

  test('選ぶと最初の出現行へジャンプする', async () => {
    const onSelectLine = vi.fn();
    render(
      <TermsWidget
        entries={entries}
        source={source}
        onSelectLine={onSelectLine}
      />,
    );
    await userEvent.click(screen.getAllByTestId('terms-widget-item')[0]);
    expect(onSelectLine).toHaveBeenCalledWith(1);
  });

  test('絞り込める', async () => {
    render(
      <TermsWidget entries={entries} source={source} onSelectLine={vi.fn()} />,
    );
    await userEvent.type(screen.getByTestId('terms-widget-filter'), 'crit');
    expect(screen.getAllByTestId('terms-widget-item')).toHaveLength(1);
  });

  test('辞書が空ならその旨を出す', () => {
    render(<TermsWidget entries={[]} source={source} onSelectLine={vi.fn()} />);
    expect(screen.getByTestId('terms-widget')).toHaveTextContent(
      '辞書が空です',
    );
  });
});

describe('DiffSummaryWidget', () => {
  const diffData: DiffResponse = {
    hasCheckpoint: true,
    lines: [
      { n: 1, o: 1, type: 'equal', content: 'same', g: null },
      { n: null, o: 2, type: 'delete', content: 'old line', g: 0 },
      { n: 2, o: null, type: 'insert', content: 'new line', g: 0 },
      { n: 9, o: null, type: 'insert', content: 'added', g: 1 },
    ],
  };

  test('±行数とかたまりを並べる', () => {
    render(
      <DiffSummaryWidget
        diffData={diffData}
        checkpointSet
        onSelectDiffLine={vi.fn()}
      />,
    );
    expect(screen.getByTestId('diffsummary-widget-meta')).toHaveTextContent(
      '+2 -1',
    );
    expect(screen.getAllByTestId('diffsummary-widget-item')).toHaveLength(2);
  });

  test('選ぶと差分の該当行を渡す', async () => {
    const onSelectDiffLine = vi.fn();
    render(
      <DiffSummaryWidget
        diffData={diffData}
        checkpointSet
        onSelectDiffLine={onSelectDiffLine}
      />,
    );
    await userEvent.click(screen.getAllByTestId('diffsummary-widget-item')[0]);
    expect(onSelectDiffLine).toHaveBeenCalledWith('new', 2);
  });

  test('チェックポイント未設定なら設定を促す', () => {
    render(
      <DiffSummaryWidget
        diffData={null}
        checkpointSet={false}
        onSelectDiffLine={vi.fn()}
      />,
    );
    expect(screen.getByTestId('diffsummary-widget')).toHaveTextContent(
      'チェックポイントを設定すると',
    );
    expect(screen.queryByTestId('diffsummary-widget-meta')).toBeNull();
  });

  test('変更が無ければその旨を出す', () => {
    render(
      <DiffSummaryWidget
        diffData={{ hasCheckpoint: true, lines: [] }}
        checkpointSet
        onSelectDiffLine={vi.fn()}
      />,
    );
    expect(screen.getByTestId('diffsummary-widget')).toHaveTextContent(
      '変更はありません',
    );
  });
});

describe('MinimapWidget', () => {
  const source = ['# 見出し', '本文', '- 箇条書き', '本文2'].join('\n');
  const comments: Comment[] = [
    {
      id: 'c_1',
      lineStart: 3,
      lineEnd: 3,
      block_type: 'list',
      context: '',
      text: '指摘',
    },
    {
      id: 'c_2',
      lineStart: 4,
      lineEnd: 4,
      block_type: 'paragraph',
      context: '',
      text: '解決済み',
      resolved: true,
    },
    {
      id: 'c_3',
      lineStart: 0,
      lineEnd: 0,
      block_type: 'diff',
      context: { side: 'new', oldLine: null, newLine: 2, line: '', hunk: [] },
      text: '差分への指摘',
    },
  ];

  function renderMinimap(
    overrides: Partial<React.ComponentProps<typeof MinimapWidget>> = {},
  ) {
    const ref = createRef<HTMLDivElement>();
    return render(
      <MinimapWidget
        source={source}
        comments={comments}
        orphanedIds={new Set()}
        contentScrollRef={ref}
        diffMode={false}
        onSelectLine={vi.fn()}
        {...overrides}
      />,
    );
  }

  test('行ごとの棒と行数を出す', () => {
    renderMinimap();
    expect(screen.getAllByTestId('minimap-marker')).toHaveLength(2);
    expect(screen.getByTestId('minimap-widget-meta')).toHaveTextContent('4行');
    const rows = screen
      .getByTestId('minimap-canvas')
      .querySelectorAll('[data-kind]');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute('data-kind', 'heading');
  });

  test('本文の行に紐づかないコメント（差分）は点にしない', () => {
    renderMinimap();
    const markers = screen.getAllByTestId('minimap-marker');
    expect(markers.some((m) => m.dataset.resolved === 'true')).toBe(true);
    expect(markers).toHaveLength(2);
  });

  test('クリックした位置の行へジャンプする', () => {
    const onSelectLine = vi.fn();
    renderMinimap({ onSelectLine });
    const canvas = screen.getByTestId('minimap-canvas');
    // jsdom は要素の実寸を持たないので、クリック計算に使う矩形を差し替える。
    // 基準になるのは棒の箱（枠ではない）。
    vi.spyOn(
      screen.getByTestId('minimap-rows'),
      'getBoundingClientRect',
    ).mockReturnValue({ top: 0, height: 100 } as DOMRect);
    fireEvent.click(canvas, { clientY: 50 });
    expect(onSelectLine).toHaveBeenCalledWith(2);
  });

  test('棒・ビューポート・コメントの点は同じ箱の中に置く', () => {
    // 棒 1 本の高さには上限があるため、枠を基準にすると短い文書で位置が
    // ずれる。3 つとも棒の箱（minimap-rows）の子であることを固定する。
    renderMinimap();
    const rowsBox = screen.getByTestId('minimap-rows');
    for (const el of screen.getAllByTestId('minimap-marker'))
      expect(rowsBox).toContainElement(el);
    expect(rowsBox.querySelectorAll('[data-kind]').length).toBe(4);
  });

  test('本文が空ならその旨を出す', () => {
    renderMinimap({ source: '', comments: [] });
    expect(screen.getByTestId('minimap-widget')).toHaveTextContent(
      '本文がありません',
    );
  });
});
