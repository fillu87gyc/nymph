import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { FileTabs } from '../../src/client/components/FileTabs.tsx';
import type { FileEntry } from '../../src/client/types.ts';

function file(path: string): FileEntry {
  return { path, name: path.split('/').pop() ?? path };
}

describe('FileTabs', () => {
  test('ファイルが0件のときは何も描画しない（mo方式の自動非表示）', () => {
    const { container } = render(
      <FileTabs
        files={[]}
        activeFile={null}
        onSwitch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('ファイルが1件のときも描画しない（複数ファイルの行き来が要らないため）', () => {
    const { container } = render(
      <FileTabs
        files={[file('a.md')]}
        activeFile="a.md"
        onSwitch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test('ファイルが2件以上になると自動的にタブ行が表示される', () => {
    render(
      <FileTabs
        files={[file('a.md'), file('b.md')]}
        activeFile="a.md"
        onSwitch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(document.getElementById('file-tabs')).toBeInTheDocument();
    expect(screen.getByText('a.md')).toBeInTheDocument();
    expect(screen.getByText('b.md')).toBeInTheDocument();
  });

  test('タブをクリックすると onSwitch が呼ばれる', async () => {
    const onSwitch = vi.fn();
    render(
      <FileTabs
        files={[file('a.md'), file('b.md')]}
        activeFile="a.md"
        onSwitch={onSwitch}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('b.md'));
    expect(onSwitch).toHaveBeenCalledWith('b.md');
  });

  describe('縦置き（ウィジェット枠に置いたとき）', () => {
    test('1件でも表示する（自分で枠に置いたウィジェットなので隠さない）', () => {
      render(
        <FileTabs
          files={[file('a.md')]}
          activeFile="a.md"
          orientation="vertical"
          onSwitch={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByTestId('tabs-widget')).toBeInTheDocument();
      expect(screen.getByText('a.md')).toBeInTheDocument();
    });

    test('0件なら描画しない', () => {
      const { container } = render(
        <FileTabs
          files={[]}
          activeFile={null}
          orientation="vertical"
          onSwitch={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    test('縦置きでも切替と閉じるが効く', async () => {
      const onSwitch = vi.fn();
      const onClose = vi.fn();
      render(
        <FileTabs
          files={[file('a.md'), file('b.md')]}
          activeFile="a.md"
          orientation="vertical"
          onSwitch={onSwitch}
          onClose={onClose}
        />,
      );
      await userEvent.click(screen.getByText('b.md'));
      expect(onSwitch).toHaveBeenCalledWith('b.md');

      const bTab = screen.getByText('b.md').closest('button');
      const closeIcon = bTab?.querySelector('[data-testid="tab-close"]');
      expect(closeIcon).not.toBeNull();
      if (closeIcon) await userEvent.click(closeIcon);
      expect(onClose).toHaveBeenCalledWith('b.md');
    });

    test('data-orientation で横行と縦置きを見分けられる', () => {
      const { rerender } = render(
        <FileTabs
          files={[file('a.md'), file('b.md')]}
          activeFile="a.md"
          onSwitch={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(document.getElementById('file-tabs')).toHaveAttribute(
        'data-orientation',
        'horizontal',
      );
      rerender(
        <FileTabs
          files={[file('a.md'), file('b.md')]}
          activeFile="a.md"
          orientation="vertical"
          onSwitch={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(document.getElementById('file-tabs')).toHaveAttribute(
        'data-orientation',
        'vertical',
      );
    });
  });
});
