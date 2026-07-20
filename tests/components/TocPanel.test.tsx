import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { TocPanel } from '../../src/client/components/TocPanel.tsx';
import type { TocItem } from '../../src/client/lib/toc.ts';

function makeItem(overrides: Partial<TocItem> = {}): TocItem {
  return {
    key: 'toc-0',
    level: 1,
    text: 'Heading',
    lineStart: 1,
    ...overrides,
  };
}

describe('TocPanel', () => {
  test('見出しがないとき空メッセージを表示', () => {
    render(<TocPanel items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('見出しがありません')).toBeInTheDocument();
  });

  test('見出しが一覧表示される', () => {
    const items = [
      makeItem({ key: 'toc-0', text: 'Title', level: 1, lineStart: 1 }),
      makeItem({ key: 'toc-1', text: 'Section A', level: 2, lineStart: 5 }),
    ];
    render(<TocPanel items={items} onSelect={vi.fn()} />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Section A')).toBeInTheDocument();
  });

  test('クリックで onSelect が lineStart 付きで呼ばれる', async () => {
    const onSelect = vi.fn();
    const items = [makeItem({ text: 'Section A', lineStart: 5 })];
    render(<TocPanel items={items} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Section A'));
    expect(onSelect).toHaveBeenCalledWith(5);
  });

  test('レベルに応じてインデントが付く（data-level）', () => {
    const items = [makeItem({ level: 3, text: 'Deep' })];
    render(<TocPanel items={items} onSelect={vi.fn()} />);
    expect(screen.getByTestId('toc-item')).toHaveAttribute('data-level', '3');
  });
});
