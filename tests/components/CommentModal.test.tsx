import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentModal } from '../../src/client/components/CommentModal.tsx';
import type { PendingComment } from '../../src/client/types.ts';

const pending: PendingComment = {
  ls: 5, le: 7, blockType: 'paragraph', context: 'Some context', selectionOffset: null,
};

describe('CommentModal', () => {
  test('open=false のとき何も表示しない', () => {
    const { container } = render(
      <CommentModal open={false} pending={pending} editingId={null}
        displayCtx="ctx" initialText="" onSubmit={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('新規モードで「追加」ボタンを表示', () => {
    render(
      <CommentModal open={true} pending={pending} editingId={null}
        displayCtx="ctx" initialText="" onSubmit={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText('追加')).toBeInTheDocument();
    expect(screen.getByText(/にコメント追加/)).toBeInTheDocument();
  });

  test('編集モードで「更新」ボタンを表示', () => {
    render(
      <CommentModal open={true} pending={pending} editingId={3}
        displayCtx="ctx" initialText="existing" onSubmit={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText('更新')).toBeInTheDocument();
    expect(screen.getByText(/のコメントを編集/)).toBeInTheDocument();
  });

  test('追加ボタンクリックで onSubmit が呼ばれる', async () => {
    const onSubmit = vi.fn();
    render(
      <CommentModal open={true} pending={pending} editingId={null}
        displayCtx="ctx" initialText="" onSubmit={onSubmit} onClose={vi.fn()} />
    );
    await userEvent.type(screen.getByRole('textbox'), 'my comment');
    await userEvent.click(screen.getByText('追加'));
    expect(onSubmit).toHaveBeenCalledWith('my comment');
  });

  test('キャンセルで onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    render(
      <CommentModal open={true} pending={pending} editingId={null}
        displayCtx="ctx" initialText="" onSubmit={vi.fn()} onClose={onClose} />
    );
    await userEvent.click(screen.getByText('キャンセル'));
    expect(onClose).toHaveBeenCalled();
  });

  test('空テキストでは onSubmit が呼ばれない', async () => {
    const onSubmit = vi.fn();
    render(
      <CommentModal open={true} pending={pending} editingId={null}
        displayCtx="ctx" initialText="" onSubmit={onSubmit} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getByText('追加'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('ライン範囲が表示される (ls != le)', () => {
    render(
      <CommentModal open={true} pending={{ ...pending, ls: 3, le: 8 }} editingId={null}
        displayCtx="this context is longer than twenty chars" initialText="" onSubmit={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(/L3–8/)).toBeInTheDocument();
  });
});
