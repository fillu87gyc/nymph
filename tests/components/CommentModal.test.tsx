import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { CommentModal } from '../../src/client/components/CommentModal.tsx';
import type { PendingComment } from '../../src/client/types.ts';

const pending: PendingComment = {
  lineStart: 5,
  lineEnd: 7,
  block_type: 'paragraph',
  context: 'Some context',
  selection_offset: null,
};

describe('CommentModal', () => {
  test('open=false のとき何も表示しない', () => {
    const { container } = render(
      <CommentModal
        open={false}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('新規モードで「追加」ボタンを表示', () => {
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('追加')).toBeInTheDocument();
    expect(screen.getByText(/にコメント追加/)).toBeInTheDocument();
  });

  test('編集モードで「更新」ボタンを表示', () => {
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={3}
        displayCtx="ctx"
        initialText="existing"
        anchor={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('更新')).toBeInTheDocument();
    expect(screen.getByText(/のコメントを編集/)).toBeInTheDocument();
  });

  test('追加ボタンクリックで onSubmit が呼ばれる', async () => {
    const onSubmit = vi.fn();
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={null}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByRole('textbox'), 'my comment');
    await userEvent.click(screen.getByText('追加'));
    expect(onSubmit).toHaveBeenCalledWith('my comment');
  });

  test('キャンセルで onClose が呼ばれる', async () => {
    const onClose = vi.fn();
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={null}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByText('キャンセル'));
    expect(onClose).toHaveBeenCalled();
  });

  test('空テキストでは onSubmit が呼ばれない', async () => {
    const onSubmit = vi.fn();
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={null}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('追加'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('ライン範囲が表示される (lineStart != lineEnd)', () => {
    render(
      <CommentModal
        open={true}
        pending={{ ...pending, lineStart: 3, lineEnd: 8 }}
        editingId={null}
        displayCtx="this context is longer than twenty chars"
        initialText=""
        anchor={null}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/L3–8/)).toBeInTheDocument();
  });

  test('anchor 指定時はその直下に表示される', () => {
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={{ x: 200, y: 300 }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const box = document.getElementById('comment-modal') as HTMLElement;
    expect(box.style.left).toBe('200px');
    expect(box.style.top).toBe('310px'); // anchor.y + ANCHOR_OFFSET_Y
  });

  test('未入力時にモーダル外をクリックすると onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={{ x: 200, y: 300 }}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  test('入力済みの状態でモーダル外をクリックしても onClose は呼ばれない（入力を破棄しない）', async () => {
    const onClose = vi.fn();
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={{ x: 200, y: 300 }}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.type(screen.getByRole('textbox'), 'draft in progress');
    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('Escape キーは入力済みでも onClose を呼ぶ（明示操作は従来通り閉じる）', async () => {
    const onClose = vi.fn();
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={{ x: 200, y: 300 }}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );
    await userEvent.type(screen.getByRole('textbox'), 'draft in progress');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('ヘッダーをドラッグすると位置が移動する', () => {
    render(
      <CommentModal
        open={true}
        pending={pending}
        editingId={null}
        displayCtx="ctx"
        initialText=""
        anchor={{ x: 200, y: 300 }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const box = document.getElementById('comment-modal') as HTMLElement;
    fireEvent.mouseDown(screen.getByText(/にコメント追加/), {
      clientX: 250,
      clientY: 320,
    });
    fireEvent.mouseMove(document, { clientX: 290, clientY: 350 });
    fireEvent.mouseUp(document);
    expect(box.style.left).toBe('240px'); // 200 + (290-250)
    expect(box.style.top).toBe('340px'); // 310 + (350-320)
  });
});
