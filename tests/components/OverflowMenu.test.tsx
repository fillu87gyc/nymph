import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { OverflowMenu } from '../../src/client/components/OverflowMenu.tsx';

function makeProps(
  overrides: Partial<React.ComponentProps<typeof OverflowMenu>> = {},
): React.ComponentProps<typeof OverflowMenu> {
  return {
    onPickDir: vi.fn(),
    canCopyPath: true,
    onCopyPath: vi.fn(),
    bookmarkActive: false,
    canBookmark: true,
    onToggleBookmark: vi.fn(),
    checkpointSet: false,
    onCheckpoint: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  };
}

describe('OverflowMenu', () => {
  test('初期状態ではメニューが閉じている', () => {
    render(<OverflowMenu {...makeProps()} />);
    expect(screen.queryByTestId('overflow-menu')).not.toBeInTheDocument();
  });

  test('⋯ボタンクリックでメニューが開閉する', async () => {
    render(<OverflowMenu {...makeProps()} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    expect(screen.getByTestId('overflow-menu')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    expect(screen.queryByTestId('overflow-menu')).not.toBeInTheDocument();
  });

  test('外側クリックでメニューが閉じる', async () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <OverflowMenu {...makeProps()} />
      </div>,
    );
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    expect(screen.getByTestId('overflow-menu')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('outside'));
    expect(screen.queryByTestId('overflow-menu')).not.toBeInTheDocument();
  });

  test('Escape キーでメニューが閉じる', async () => {
    render(<OverflowMenu {...makeProps()} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    expect(screen.getByTestId('overflow-menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('overflow-menu')).not.toBeInTheDocument();
  });

  test('項目クリックではメニューが閉じない（連続操作のため）', async () => {
    const onCheckpoint = vi.fn();
    render(<OverflowMenu {...makeProps({ onCheckpoint })} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    await userEvent.click(document.getElementById('btn-checkpoint') as Element);

    expect(onCheckpoint).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('overflow-menu')).toBeInTheDocument();
  });

  test('既存の id / data-testid を保ったまま項目を描画する（開く・パス・チェックポイント・全削除）', async () => {
    render(<OverflowMenu {...makeProps()} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));

    expect(screen.getByTestId('open-dir-btn')).toBeInTheDocument();
    expect(document.getElementById('btn-copy-path')).toBeInTheDocument();
    expect(screen.getByTestId('copy-path-btn')).toBeInTheDocument();
    expect(document.getElementById('btn-checkpoint')).toBeInTheDocument();
    expect(document.getElementById('btn-clear-all')).toBeInTheDocument();
  });

  test('canBookmark が false のときブックマーク項目は出ない', async () => {
    render(<OverflowMenu {...makeProps({ canBookmark: false })} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    expect(screen.queryByTestId('bookmark-toggle')).not.toBeInTheDocument();
  });

  test('canBookmark が true のときブックマーク項目が状態付きで出る', async () => {
    render(
      <OverflowMenu
        {...makeProps({ canBookmark: true, bookmarkActive: true })}
      />,
    );
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    const btn = screen.getByTestId('bookmark-toggle');
    expect(btn).toHaveAttribute('data-active', 'true');
    expect(btn).toHaveTextContent('★');
  });

  test('onDictSync が渡されないとき辞書更新項目は出ない', async () => {
    render(<OverflowMenu {...makeProps({ onDictSync: undefined })} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    expect(screen.queryByTestId('dict-fetch-btn')).not.toBeInTheDocument();
  });

  test('onDictSync が渡されているとき辞書更新項目が出る', async () => {
    const onDictSync = vi.fn();
    render(<OverflowMenu {...makeProps({ onDictSync })} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    const btn = screen.getByTestId('dict-fetch-btn');
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    expect(onDictSync).toHaveBeenCalledTimes(1);
  });

  test('パスをコピーは canCopyPath が false のとき無効化される', async () => {
    render(<OverflowMenu {...makeProps({ canCopyPath: false })} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    expect(screen.getByTestId('copy-path-btn')).toBeDisabled();
  });

  test('すべて削除クリックで onClearAll が呼ばれる', async () => {
    const onClearAll = vi.fn();
    render(<OverflowMenu {...makeProps({ onClearAll })} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    await userEvent.click(document.getElementById('btn-clear-all') as Element);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
