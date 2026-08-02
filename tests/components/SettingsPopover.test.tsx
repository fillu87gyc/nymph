import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SettingsPopover } from '../../src/client/components/SettingsPopover.tsx';

function makeProps(
  overrides: Partial<React.ComponentProps<typeof SettingsPopover>> = {},
): React.ComponentProps<typeof SettingsPopover> {
  return {
    onToggleTheme: vi.fn(),
    contentFontId: 'inter',
    onChangeContentFont: vi.fn(),
    ligaturesEnabled: true,
    onToggleLigatures: vi.fn(),
    marginCollapse: { left: false, right: false },
    onToggleMargin: vi.fn(),
    manualWidth: null,
    onResetWidth: vi.fn(),
    outlineBadgeMode: 'comments',
    onChangeOutlineBadgeMode: vi.fn(),
    checkpointSet: true,
    ...overrides,
  };
}

describe('SettingsPopover', () => {
  test('初期状態では閉じている', () => {
    render(<SettingsPopover {...makeProps()} />);
    expect(screen.queryByTestId('settings-menu')).not.toBeInTheDocument();
  });

  test('⚙ボタンで開閉する', async () => {
    render(<SettingsPopover {...makeProps()} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    expect(screen.queryByTestId('settings-menu')).not.toBeInTheDocument();
  });

  test('外側クリックで閉じる', async () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <SettingsPopover {...makeProps()} />
      </div>,
    );
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    await userEvent.click(screen.getByTestId('outside'));
    expect(screen.queryByTestId('settings-menu')).not.toBeInTheDocument();
  });

  test('Escape キーで閉じる', async () => {
    render(<SettingsPopover {...makeProps()} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('settings-menu')).not.toBeInTheDocument();
  });

  test('テーマ切替ボタンで onToggleTheme が呼ばれ、メニューは閉じない', async () => {
    const onToggleTheme = vi.fn();
    render(<SettingsPopover {...makeProps({ onToggleTheme })} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    await userEvent.click(document.getElementById('btn-theme') as Element);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();
  });

  test('本文フォント select は既存の id / testid を保ち選択で onChangeContentFont が呼ばれる', async () => {
    const onChangeContentFont = vi.fn();
    render(
      <SettingsPopover
        {...makeProps({ onChangeContentFont, contentFontId: 'inter' })}
      />,
    );
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    const select = screen.getByTestId('content-font-select');
    expect(select).toHaveAttribute('id', 'content-font-select');
    await userEvent.selectOptions(select, 'default');
    expect(onChangeContentFont).toHaveBeenCalledWith('default');
  });

  test('リガチャトグルは aria-pressed で現在値を示す', async () => {
    const { unmount } = render(
      <SettingsPopover {...makeProps({ ligaturesEnabled: true })} />,
    );
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    expect(screen.getByTestId('ligature-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    unmount();

    render(<SettingsPopover {...makeProps({ ligaturesEnabled: false })} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    expect(screen.getByTestId('ligature-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('リガチャトグルのクリックで onToggleLigatures が呼ばれ、メニューは閉じない', async () => {
    const onToggleLigatures = vi.fn();
    render(<SettingsPopover {...makeProps({ onToggleLigatures })} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    await userEvent.click(screen.getByTestId('ligature-toggle'));
    expect(onToggleLigatures).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();
  });

  test('本文幅トグルは既存の testid を保ち aria-pressed が marginCollapse を反映する', async () => {
    const onToggleMargin = vi.fn();
    render(
      <SettingsPopover
        {...makeProps({
          onToggleMargin,
          marginCollapse: { left: true, right: false },
        })}
      />,
    );
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    const left = screen.getByTestId('margin-toggle-left');
    const right = screen.getByTestId('margin-toggle-right');
    expect(left).toHaveAttribute('aria-pressed', 'true');
    expect(right).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(right);
    expect(onToggleMargin).toHaveBeenCalledWith('right');
  });

  test('手動幅がなければ幅リセットは無効', async () => {
    render(<SettingsPopover {...makeProps({ manualWidth: null })} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    const reset = screen.getByTestId('content-width-reset');
    expect(reset).toBeDisabled();
    expect(reset).toHaveTextContent('幅をリセット');
  });

  test('手動幅があれば現在値を表示してリセットできる', async () => {
    const onResetWidth = vi.fn();
    render(
      <SettingsPopover {...makeProps({ manualWidth: 1180, onResetWidth })} />,
    );
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    const reset = screen.getByTestId('content-width-reset');
    expect(reset).toBeEnabled();
    expect(reset).toHaveTextContent('幅をリセット（1180px）');

    await userEvent.click(reset);
    expect(onResetWidth).toHaveBeenCalledTimes(1);
  });

  test('アウトラインのバッジは現在値だけ aria-pressed が true', async () => {
    render(<SettingsPopover {...makeProps({ outlineBadgeMode: 'diff' })} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    expect(screen.getByTestId('outline-badge-diff')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('outline-badge-comments')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('アウトラインのバッジをクリックすると onChangeOutlineBadgeMode が呼ばれる', async () => {
    const onChangeOutlineBadgeMode = vi.fn();
    render(<SettingsPopover {...makeProps({ onChangeOutlineBadgeMode })} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    await userEvent.click(screen.getByTestId('outline-badge-both'));
    expect(onChangeOutlineBadgeMode).toHaveBeenCalledWith('both');
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument();
  });

  test('チェックポイント未設定なら「差分量」だけ選べない', async () => {
    render(<SettingsPopover {...makeProps({ checkpointSet: false })} />);
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    expect(screen.getByTestId('outline-badge-diff')).toBeDisabled();
    for (const id of ['off', 'comments', 'both']) {
      expect(screen.getByTestId(`outline-badge-${id}`)).toBeEnabled();
    }
  });

  test('チェックポイント設定済みなら「差分量」を選べる', async () => {
    const onChangeOutlineBadgeMode = vi.fn();
    render(
      <SettingsPopover
        {...makeProps({ checkpointSet: true, onChangeOutlineBadgeMode })}
      />,
    );
    await userEvent.click(screen.getByTestId('settings-menu-btn'));
    await userEvent.click(screen.getByTestId('outline-badge-diff'));
    expect(onChangeOutlineBadgeMode).toHaveBeenCalledWith('diff');
  });
});
