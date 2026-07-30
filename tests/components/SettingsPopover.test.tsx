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
    marginCollapse: { left: false, right: false },
    onToggleMargin: vi.fn(),
    manualWidth: null,
    onResetWidth: vi.fn(),
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
});
