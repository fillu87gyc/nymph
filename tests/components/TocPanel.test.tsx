import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { TocPanel } from '../../src/client/components/TocPanel.tsx';
import type { OutlineStats } from '../../src/client/lib/outline.ts';
import type { TocItem } from '../../src/client/lib/toc.ts';

function makeItem(overrides: Partial<TocItem> = {}): TocItem {
  return {
    key: 'toc-0',
    level: 1,
    text: 'Heading',
    lineStart: 1,
    ...overrides,
  };
}

describe('TocPanel', () => {
  test('見出しがないとき空メッセージを表示', () => {
    render(<TocPanel items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('見出しがありません')).toBeInTheDocument();
  });

  test('見出しが一覧表示される', () => {
    const items = [
      makeItem({ key: 'toc-0', text: 'Title', level: 1, lineStart: 1 }),
      makeItem({ key: 'toc-1', text: 'Section A', level: 2, lineStart: 5 }),
    ];
    render(<TocPanel items={items} onSelect={vi.fn()} />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Section A')).toBeInTheDocument();
  });

  test('クリックで onSelect が lineStart 付きで呼ばれる', async () => {
    const onSelect = vi.fn();
    const items = [makeItem({ text: 'Section A', lineStart: 5 })];
    render(<TocPanel items={items} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Section A'));
    expect(onSelect).toHaveBeenCalledWith(5);
  });

  test('レベルに応じてインデントが付く（data-level）', () => {
    const items = [makeItem({ level: 3, text: 'Deep' })];
    render(<TocPanel items={items} onSelect={vi.fn()} />);
    expect(screen.getByTestId('toc-item')).toHaveAttribute('data-level', '3');
  });

  test('badgeMode 省略時はバッジも見出しの未解決件数も出ない', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 3, added: 1, deleted: 1 }],
    ]);
    render(<TocPanel items={items} onSelect={vi.fn()} stats={stats} />);
    expect(screen.queryByTestId('toc-badge-comments')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toc-badge-diff')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toc-header-meta')).not.toBeInTheDocument();
  });

  test('comments モードでは未解決コメント数バッジのみ出る', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 3, added: 5, deleted: 2 }],
    ]);
    render(
      <TocPanel
        items={items}
        onSelect={vi.fn()}
        stats={stats}
        badgeMode="comments"
      />,
    );
    expect(screen.getByTestId('toc-badge-comments')).toHaveTextContent('3');
    expect(screen.queryByTestId('toc-badge-diff')).not.toBeInTheDocument();
    expect(screen.getByTestId('toc-header-meta')).toHaveTextContent(
      '見出しの未解決 3',
    );
  });

  test('コメント0件の見出しにはバッジを出さない', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 0, added: 0, deleted: 0 }],
    ]);
    render(
      <TocPanel
        items={items}
        onSelect={vi.fn()}
        stats={stats}
        badgeMode="comments"
      />,
    );
    expect(screen.queryByTestId('toc-badge-comments')).not.toBeInTheDocument();
  });

  test('diff モードではチェックポイント設定済みなら追加/削除バッジが出る', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 3, added: 6, deleted: 4 }],
    ]);
    render(
      <TocPanel
        items={items}
        onSelect={vi.fn()}
        stats={stats}
        badgeMode="diff"
        hasCheckpoint
      />,
    );
    const badge = screen.getByTestId('toc-badge-diff');
    expect(badge).toHaveTextContent('+6');
    expect(badge).toHaveTextContent('-4');
    expect(screen.queryByTestId('toc-badge-comments')).not.toBeInTheDocument();
  });

  test('片側のみ変化した場合は増減どちらかだけ表示する', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 0, added: 3, deleted: 0 }],
    ]);
    render(
      <TocPanel
        items={items}
        onSelect={vi.fn()}
        stats={stats}
        badgeMode="diff"
        hasCheckpoint
      />,
    );
    const badge = screen.getByTestId('toc-badge-diff');
    expect(badge).toHaveTextContent('+3');
    expect(badge.textContent).not.toContain('-');
  });

  test('diff モードでもチェックポイント未設定なら comments 表示へフォールバックする', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 2, added: 6, deleted: 4 }],
    ]);
    render(
      <TocPanel
        items={items}
        onSelect={vi.fn()}
        stats={stats}
        badgeMode="diff"
        hasCheckpoint={false}
      />,
    );
    expect(screen.getByTestId('toc-badge-comments')).toHaveTextContent('2');
    expect(screen.queryByTestId('toc-badge-diff')).not.toBeInTheDocument();
    // 設定が効いていないように見えないよう、フォールバック中は理由を出す
    expect(screen.getByTestId('toc-badge-fallback')).toHaveTextContent(
      'チェックポイント未設定',
    );
  });

  test('フォールバックしていないときは注記を出さない', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 2, added: 6, deleted: 4 }],
    ]);
    render(
      <TocPanel
        items={items}
        onSelect={vi.fn()}
        stats={stats}
        badgeMode="diff"
        hasCheckpoint
      />,
    );
    expect(screen.queryByTestId('toc-badge-fallback')).not.toBeInTheDocument();
  });

  test('both モードでは両方のバッジが同時に出る', () => {
    const items = [makeItem()];
    const stats = new Map<string, OutlineStats>([
      ['toc-0', { openComments: 1, added: 3, deleted: 0 }],
    ]);
    render(
      <TocPanel
        items={items}
        onSelect={vi.fn()}
        stats={stats}
        badgeMode="both"
        hasCheckpoint
      />,
    );
    expect(screen.getByTestId('toc-badge-comments')).toBeInTheDocument();
    expect(screen.getByTestId('toc-badge-diff')).toBeInTheDocument();
  });
});
