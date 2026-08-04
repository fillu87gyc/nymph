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

  test('孤立コメントに「削除済」ステータスバッジが表示される', () => {
    const c = makeComment({ id: 5, text: 'orphaned comment' });
    render(<Wrapper comments={[c]} orphanedIds={new Set([5])} />);
    const badge = screen.getByTestId('c-status');
    expect(badge).toHaveTextContent('削除済');
    expect(badge).toHaveAttribute('data-status', 'deleted');
  });

  test('孤立していないコメントにはステータスバッジが表示されない（未解決）', () => {
    const c = makeComment({ id: 5, text: 'normal comment' });
    render(<Wrapper comments={[c]} orphanedIds={new Set()} />);
    expect(screen.queryByTestId('c-status')).not.toBeInTheDocument();
  });

  test('orphanedIds 未指定のときステータスバッジが表示されない', () => {
    render(<Wrapper comments={[makeComment()]} />);
    expect(screen.queryByTestId('c-status')).not.toBeInTheDocument();
  });

  test('解決済みコメントは孤立していても「解決済」バッジになる', () => {
    const c = makeComment({ id: 5, resolved: true });
    render(<Wrapper comments={[c]} orphanedIds={new Set([5])} />);
    const badge = screen.getByTestId('c-status');
    expect(badge).toHaveTextContent('解決済');
    expect(badge).toHaveAttribute('data-status', 'resolved');
  });

  test('アイテムに data-status が付く', () => {
    const { container } = render(
      <Wrapper
        comments={[
          makeComment({ id: 1 }),
          makeComment({ id: 2 }),
          makeComment({ id: 3, resolved: true }),
        ]}
        orphanedIds={new Set([2, 3])}
      />,
    );
    const statuses = Array.from(
      container.querySelectorAll('[data-testid="comment-item"]'),
    ).map((el) => el.getAttribute('data-status'));
    expect(statuses).toEqual(['open', 'deleted', 'resolved']);
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

  describe('フィルタ（すべて / 未解決 / 削除済 / 解決済）', () => {
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

    test('削除済を選ぶと未解決かつ元の文章が消えたものだけ表示される', async () => {
      render(
        <Wrapper
          comments={[
            makeComment({ id: 1, text: 'open one' }),
            makeComment({ id: 2, text: 'deleted one' }),
            makeComment({ id: 3, text: 'resolved and gone', resolved: true }),
          ]}
          orphanedIds={new Set([2, 3])}
        />,
      );
      await userEvent.click(screen.getByTestId('filter-deleted'));
      expect(screen.getAllByTestId('comment-item')).toHaveLength(1);
      expect(screen.getByText('deleted one')).toBeInTheDocument();
    });

    test('未解決フィルタからは削除済が外れる', async () => {
      render(
        <Wrapper
          comments={[
            makeComment({ id: 1, text: 'open one' }),
            makeComment({ id: 2, text: 'deleted one' }),
          ]}
          orphanedIds={new Set([2])}
        />,
      );
      await userEvent.click(screen.getByTestId('filter-open'));
      expect(screen.getAllByTestId('comment-item')).toHaveLength(1);
      expect(screen.getByText('open one')).toBeInTheDocument();
    });

    test('解決済フィルタには元の文章が消えた解決済みも含まれる', async () => {
      render(
        <Wrapper
          comments={[makeComment({ id: 3, text: 'gone', resolved: true })]}
          orphanedIds={new Set([3])}
        />,
      );
      await userEvent.click(screen.getByTestId('filter-resolved'));
      expect(screen.getAllByTestId('comment-item')).toHaveLength(1);
    });
  });

  describe('もとの文章スナップショットの吹き出し', () => {
    const SNAPSHOT = {
      startLine: 3,
      before: ['before 1', 'before 2'],
      target: ['消えた本文'],
      after: ['after 1'],
    };

    test('削除済バッジのクリックで吹き出しが開き、前後の行が行番号付きで出る', async () => {
      render(
        <Wrapper
          comments={[makeComment({ id: 5, snapshot: SNAPSHOT })]}
          orphanedIds={new Set([5])}
        />,
      );
      expect(screen.queryByTestId('snapshot-balloon')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('c-status'));
      const balloon = within(screen.getByTestId('snapshot-balloon'));
      expect(balloon.getByText('消えた本文')).toBeInTheDocument();
      expect(balloon.getByText('before 1')).toBeInTheDocument();
      expect(balloon.getByText('after 1')).toBeInTheDocument();
      // 行番号は startLine から before の行数を引いた位置から始まる
      expect(balloon.getByText('1')).toBeInTheDocument();
      expect(balloon.getByText('4')).toBeInTheDocument();
      // 対象行だけがハイライト対象
      expect(balloon.getAllByTestId('snapshot-line-target')).toHaveLength(1);
    });

    test('解決済コメントでも吹き出しを開ける', async () => {
      render(
        <Wrapper
          comments={[
            makeComment({ id: 6, resolved: true, snapshot: SNAPSHOT }),
          ]}
        />,
      );
      await userEvent.click(screen.getByTestId('c-status'));
      expect(screen.getByTestId('snapshot-balloon')).toBeInTheDocument();
    });

    test('もう一度バッジを押すと閉じる', async () => {
      render(
        <Wrapper
          comments={[makeComment({ id: 5, snapshot: SNAPSHOT })]}
          orphanedIds={new Set([5])}
        />,
      );
      await userEvent.click(screen.getByTestId('c-status'));
      expect(screen.getByTestId('snapshot-balloon')).toBeInTheDocument();
      await userEvent.click(screen.getByTestId('c-status'));
      expect(screen.queryByTestId('snapshot-balloon')).not.toBeInTheDocument();
    });

    test('✕ ボタンで閉じる', async () => {
      render(
        <Wrapper
          comments={[makeComment({ id: 5, snapshot: SNAPSHOT })]}
          orphanedIds={new Set([5])}
        />,
      );
      await userEvent.click(screen.getByTestId('c-status'));
      await userEvent.click(screen.getByTestId('snapshot-close'));
      expect(screen.queryByTestId('snapshot-balloon')).not.toBeInTheDocument();
    });

    test('スナップショットが無い既存コメントでは代替メッセージを出す', async () => {
      render(
        <Wrapper
          comments={[makeComment({ id: 5, context: 'Hello world' })]}
          orphanedIds={new Set([5])}
        />,
      );
      await userEvent.click(screen.getByTestId('c-status'));
      expect(screen.getByTestId('snapshot-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('snapshot-lines')).not.toBeInTheDocument();
    });

    test('バッジのクリックではコメントへのスクロールは起きない', async () => {
      const onScrollToComment = vi.fn();
      render(
        <CommentsPanel
          open={true}
          comments={[makeComment({ id: 5, snapshot: SNAPSHOT })]}
          orphanedIds={new Set([5])}
          onScrollToComment={onScrollToComment}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleResolved={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      await userEvent.click(screen.getByTestId('c-status'));
      expect(onScrollToComment).not.toHaveBeenCalled();
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
  describe('ウィジェット枠に置いたとき（variant="slot"）', () => {
    function renderSlot(open: boolean) {
      return render(
        <CommentsPanel
          open={open}
          variant="slot"
          comments={[makeComment()]}
          onScrollToComment={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onToggleResolved={vi.fn()}
          onClose={vi.fn()}
        />,
      );
    }

    test('閉じているときは何も描画しない（枠に区切り線だけ残さない）', () => {
      const { container } = renderSlot(false);
      expect(container.firstChild).toBeNull();
    });

    test('高さドラッグのハンドルを持たない（枠の縦幅に従うため）', () => {
      renderSlot(true);
      expect(document.getElementById('panel-resize-handle')).toBeNull();
    });

    test('高さのインラインスタイルを持たない', () => {
      renderSlot(true);
      expect(document.getElementById('comments-panel')?.style.height).toBe('');
    });

    test('コメントの中身はドックと同じように出る', () => {
      renderSlot(true);
      expect(screen.getByTestId('c-text')).toHaveTextContent('test comment');
    });
  });

  test('ドックではリサイズハンドルと高さを持つ', () => {
    render(<Wrapper comments={[makeComment()]} />);
    expect(document.getElementById('panel-resize-handle')).toBeInTheDocument();
    expect(document.getElementById('comments-panel')?.style.height).not.toBe(
      '',
    );
  });
});
