import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { CommentsPanel } from '../../src/client/components/CommentsPanel.tsx';
import type { Comment } from '../../src/client/types.ts';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    lineStart: 3,
    lineEnd: 5,
    block_type: 'paragraph',
    context: 'Hello world',
    text: 'test comment',
    ...overrides,
  };
}

function Wrapper({
  comments,
  orphanedIds,
  onEdit,
  onDelete,
  onToggleResolved,
}: {
  comments: Comment[];
  orphanedIds?: Set<Comment['id']>;
  onEdit?: (c: Comment, x: number, y: number) => void;
  onDelete?: (id: Comment['id']) => void;
  onToggleResolved?: (id: Comment['id']) => void;
}) {
  return (
    <CommentsPanel
      open={true}
      comments={comments}
      orphanedIds={orphanedIds}
      onScrollToComment={vi.fn()}
      onEdit={onEdit ?? vi.fn()}
      onDelete={onDelete ?? vi.fn()}
      onToggleResolved={onToggleResolved ?? vi.fn()}
      onClose={vi.fn()}
    />
  );
}

describe('CommentsPanel', () => {
  test('コメントなしのとき空メッセージを表示', () => {
    render(<Wrapper comments={[]} />);
    expect(screen.getByText(/コメントはまだありません/)).toBeInTheDocument();
  });

  test('コメントが表示される', () => {
    render(<Wrapper comments={[makeComment()]} />);
    expect(screen.getByText('test comment')).toBeInTheDocument();
    expect(screen.getByText('L3–5')).toBeInTheDocument();
  });

  test('コンテキストが表示される', () => {
    render(<Wrapper comments={[makeComment({ context: 'Hello world' })]} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('削除ボタンで onDelete が呼ばれる', async () => {
    const onDelete = vi.fn();
    render(
      <Wrapper comments={[makeComment({ id: 42 })]} onDelete={onDelete} />,
    );
    await userEvent.click(screen.getByTitle('削除'));
    expect(onDelete).toHaveBeenCalledWith(42);
  });

  test('編集ボタンで onEdit が呼ばれる', async () => {
    const onEdit = vi.fn();
    const c = makeComment();
    render(<Wrapper comments={[c]} onEdit={onEdit} />);
    await userEvent.click(screen.getByTitle('編集'));
    expect(onEdit).toHaveBeenCalledWith(
      c,
      expect.any(Number),
      expect.any(Number),
    );
  });

  test('複数コメントがすべて表示される', () => {
    const comments = [
      makeComment({ id: 1, text: 'first' }),
      makeComment({ id: 2, text: 'second', lineStart: 10, lineEnd: 10 }),
    ];
    render(<Wrapper comments={comments} />);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  test('孤立コメントに「削除済み」バッジが表示される', () => {
    const c = makeComment({ id: 5, text: 'orphaned comment' });
    render(<Wrapper comments={[c]} orphanedIds={new Set([5])} />);
    expect(screen.getByText('削除済み')).toBeInTheDocument();
  });

  test('孤立していないコメントには「削除済み」バッジが表示されない', () => {
    const c = makeComment({ id: 5, text: 'normal comment' });
    render(<Wrapper comments={[c]} orphanedIds={new Set()} />);
    expect(screen.queryByText('削除済み')).not.toBeInTheDocument();
  });

  test('orphanedIds 未指定のとき「削除済み」バッジが表示されない', () => {
    render(<Wrapper comments={[makeComment()]} />);
    expect(screen.queryByText('削除済み')).not.toBeInTheDocument();
  });

  test('孤立コメントのアイテムに data-orphaned="true" が付く', () => {
    const c = makeComment({ id: 7, text: 'orphaned' });
    const { container } = render(
      <Wrapper comments={[c]} orphanedIds={new Set([7])} />,
    );
    expect(
      container.querySelector(
        '[data-testid="comment-item"][data-orphaned="true"]',
      ),
    ).not.toBeNull();
  });

  describe('resolved トグル', () => {
    test('トグルボタンで onToggleResolved が呼ばれる', async () => {
      const onToggleResolved = vi.fn();
      const c = makeComment({ id: 9 });
      render(<Wrapper comments={[c]} onToggleResolved={onToggleResolved} />);
      await userEvent.click(screen.getByTestId('c-resolve'));
      expect(onToggleResolved).toHaveBeenCalledWith(9);
    });

    test('resolved:true のアイテムに data-resolved="true" が付く', () => {
      const c = makeComment({ resolved: true });
      const { container } = render(<Wrapper comments={[c]} />);
      expect(
        container.querySelector(
          '[data-testid="comment-item"][data-resolved="true"]',
        ),
      ).not.toBeNull();
    });

    test('resolved 未定義のアイテムは data-resolved="false"', () => {
      const c = makeComment();
      const { container } = render(<Wrapper comments={[c]} />);
      expect(
        container.querySelector(
          '[data-testid="comment-item"][data-resolved="false"]',
        ),
      ).not.toBeNull();
    });
  });

  describe('round 表示', () => {
    test('round が 1 以上のとき R{round} バッジが表示される', () => {
      const c = makeComment({ round: 2 });
      render(<Wrapper comments={[c]} />);
      expect(screen.getByTestId('c-round')).toHaveTextContent('R2');
    });

    test('round が 0 のとき表示されない', () => {
      const c = makeComment({ round: 0 });
      render(<Wrapper comments={[c]} />);
      expect(screen.queryByTestId('c-round')).not.toBeInTheDocument();
    });

    test('round が未定義のとき表示されない', () => {
      render(<Wrapper comments={[makeComment()]} />);
      expect(screen.queryByTestId('c-round')).not.toBeInTheDocument();
    });
  });

  describe('フィルタ（All / Open / Resolved）', () => {
    function comments() {
      return [
        makeComment({ id: 1, text: 'open one' }),
        makeComment({ id: 2, text: 'resolved one', resolved: true }),
        makeComment({ id: 3, text: 'open two', resolved: false }),
      ];
    }

    test('デフォルトは All（全件表示）', () => {
      render(<Wrapper comments={comments()} />);
      expect(screen.getAllByTestId('comment-item')).toHaveLength(3);
      expect(screen.getByTestId('filter-all')).toHaveAttribute(
        'data-active',
        'true',
      );
    });

    test('Open を選ぶと未解決のみ表示される', async () => {
      render(<Wrapper comments={comments()} />);
      await userEvent.click(screen.getByTestId('filter-open'));
      const items = screen.getAllByTestId('comment-item');
      expect(items).toHaveLength(2);
      expect(screen.getByText('open one')).toBeInTheDocument();
      expect(screen.getByText('open two')).toBeInTheDocument();
      expect(screen.queryByText('resolved one')).not.toBeInTheDocument();
    });

    test('Resolved を選ぶと解決済みのみ表示される', async () => {
      render(<Wrapper comments={comments()} />);
      await userEvent.click(screen.getByTestId('filter-resolved'));
      const items = screen.getAllByTestId('comment-item');
      expect(items).toHaveLength(1);
      expect(screen.getByText('resolved one')).toBeInTheDocument();
    });

    test('フィルタで該当0件のときフィルタ専用の空メッセージが出る', async () => {
      render(<Wrapper comments={[makeComment({ resolved: true })]} />);
      await userEvent.click(screen.getByTestId('filter-open'));
      expect(screen.queryByTestId('comment-item')).not.toBeInTheDocument();
      expect(screen.getByTestId('no-comments')).toBeInTheDocument();
    });
  });

  test('編集・削除・スクロールは表示中のコメントに対して機能する（フィルタ後も id は元のまま）', async () => {
    const onDelete = vi.fn();
    const list = [
      makeComment({ id: 'c_aaa', text: 'keep', resolved: false }),
      makeComment({ id: 'c_bbb', text: 'done', resolved: true }),
    ];
    render(<Wrapper comments={list} onDelete={onDelete} />);
    await userEvent.click(screen.getByTestId('filter-resolved'));
    const item = within(screen.getByTestId('comment-item'));
    await userEvent.click(item.getByTitle('削除'));
    expect(onDelete).toHaveBeenCalledWith('c_bbb');
  });
});
