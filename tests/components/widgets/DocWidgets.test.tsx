/**
 * 本文だけから作れるウィジェット（タスク / 図 / 文書統計 / frontmatter）。
 * データ源が source だけなので、まとめて 1 ファイルで検証する。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DiagramsWidget } from '../../../src/client/components/widgets/DiagramsWidget.tsx';
import { FrontmatterWidget } from '../../../src/client/components/widgets/FrontmatterWidget.tsx';
import { StatsWidget } from '../../../src/client/components/widgets/StatsWidget.tsx';
import { TasksWidget } from '../../../src/client/components/widgets/TasksWidget.tsx';

const TASK_SRC = [
  '# やること',
  '',
  '- [ ] 設計を書く',
  '- [x] 調査する',
  '  - [ ] 事例を集める',
].join('\n');

describe('TasksWidget', () => {
  test('チェックボックスを一覧にし、完了数を出す', () => {
    render(<TasksWidget source={TASK_SRC} onSelectLine={vi.fn()} />);
    expect(screen.getAllByTestId('tasks-widget-item')).toHaveLength(3);
    expect(screen.getByTestId('tasks-widget-meta')).toHaveTextContent('1 / 3');
  });

  test('選ぶとその行へジャンプする', async () => {
    const onSelectLine = vi.fn();
    render(<TasksWidget source={TASK_SRC} onSelectLine={onSelectLine} />);
    await userEvent.click(screen.getAllByTestId('tasks-widget-item')[0]);
    expect(onSelectLine).toHaveBeenCalledWith(3);
  });

  test('未完のみに絞り込める', async () => {
    render(<TasksWidget source={TASK_SRC} onSelectLine={vi.fn()} />);
    await userEvent.click(screen.getByTestId('tasks-widget-open-only'));
    const items = screen.getAllByTestId('tasks-widget-item');
    expect(items).toHaveLength(2);
    for (const item of items)
      expect(item).toHaveAttribute('data-done', 'false');
  });

  test('タスクが無ければその旨を出す', () => {
    render(<TasksWidget source="# なし" onSelectLine={vi.fn()} />);
    expect(screen.getByTestId('tasks-widget')).toHaveTextContent(
      'チェックボックス',
    );
    expect(screen.queryByTestId('tasks-widget-open-only')).toBeNull();
  });
});

describe('DiagramsWidget', () => {
  const src = ['```mermaid', 'graph TD; A-->B', '```'].join('\n');

  test('図を種類つきで並べ、選ぶとジャンプする', async () => {
    const onSelectLine = vi.fn();
    render(<DiagramsWidget source={src} onSelectLine={onSelectLine} />);
    const item = screen.getByTestId('diagrams-widget-item');
    expect(item).toHaveTextContent('graph');
    await userEvent.click(item);
    expect(onSelectLine).toHaveBeenCalledWith(1);
  });

  test('図が無ければその旨を出す', () => {
    render(<DiagramsWidget source="# なし" onSelectLine={vi.fn()} />);
    expect(screen.getByTestId('diagrams-widget')).toHaveTextContent(
      'Mermaid の図がありません',
    );
  });
});

describe('StatsWidget', () => {
  test('主要な統計を並べる', () => {
    render(<StatsWidget source={TASK_SRC} />);
    const panel = screen.getByTestId('stats-widget');
    expect(within(panel).getByText('見出し')).toBeInTheDocument();
    expect(within(panel).getByText('推定読了')).toBeInTheDocument();
    // タスクは 1 / 3（完了 / 全体）
    const taskValue = screen
      .getAllByTestId('stats-widget-value')
      .find((el) => el.getAttribute('data-key') === 'タスク');
    expect(taskValue).toHaveTextContent('1 / 3');
  });

  test('推定読了時間を出す', () => {
    render(<StatsWidget source={'あ'.repeat(1000)} />);
    const value = screen
      .getAllByTestId('stats-widget-value')
      .find((el) => el.getAttribute('data-key') === '推定読了');
    expect(value).toHaveTextContent('約 2 分');
  });
});

describe('FrontmatterWidget', () => {
  test('先頭の YAML をキーと値で並べる', () => {
    const src = [
      '---',
      'title: 設計メモ',
      'status: draft',
      '---',
      '# 本文',
    ].join('\n');
    render(<FrontmatterWidget source={src} />);
    expect(
      screen.getAllByTestId('frontmatter-key').map((el) => el.textContent),
    ).toEqual(['title', 'status']);
    expect(
      screen.getAllByTestId('frontmatter-value').map((el) => el.textContent),
    ).toEqual(['設計メモ', 'draft']);
  });

  test('frontmatter が無ければその旨を出す', () => {
    render(<FrontmatterWidget source="# 見出し" />);
    expect(screen.getByTestId('frontmatter-widget')).toHaveTextContent(
      'frontmatter がありません',
    );
  });
});
