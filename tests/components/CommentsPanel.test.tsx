import { render, screen } from '@testing-library/react';
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
}: {
  comments: Comment[];
  orphanedIds?: Set<number>;
  onEdit?: (c: Comment) => void;
  onDelete?: (id: number) => void;
}) {
  return (
    <CommentsPanel
      open={true}
      comments={comments}
      orphanedIds={orphanedIds}
      onScrollToComment={vi.fn()}
      onEdit={onEdit ?? vi.fn()}
      onDelete={onDelete ?? vi.fn()}
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
    expect(onEdit).toHaveBeenCalledWith(c);
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
});
