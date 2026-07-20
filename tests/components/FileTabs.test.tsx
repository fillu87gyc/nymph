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
});
