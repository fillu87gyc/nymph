import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { Toolbar } from '../../src/client/components/Toolbar.tsx';

function makeProps(
  overrides: Partial<React.ComponentProps<typeof Toolbar>> = {},
): React.ComponentProps<typeof Toolbar> {
  return {
    version: '1.2.3',
    updateTime: '更新: 12:34:56',
    commentCount: 0,
    diffMode: false,
    checkpointSet: false,
    isConnected: true,
    recentFiles: [],
    recentOpen: false,
    bookmarks: [],
    bookmarkActive: false,
    canBookmark: true,
    onToggleBookmark: vi.fn(),
    onToggleRecent: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenDir: vi.fn(),
    onPickFile: vi.fn(),
    onPickDir: vi.fn(),
    onTogglePanel: vi.fn(),
    tocOpen: false,
    onToggleToc: vi.fn(),
    onCopyReview: vi.fn(),
    canCopyPath: true,
    onCopyPath: vi.fn(),
    onClearAll: vi.fn(),
    onCheckpoint: vi.fn(),
    onPrint: vi.fn(),
    onToggleDiff: vi.fn(),
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
    onOpenWidgetArrange: vi.fn(),
    ...overrides,
  };
}

describe('Toolbar', () => {
  test('常時表示グループが最初から見えている（最近・ファイルを開く・目次・コメント・差分・レビューをコピー・設定・⋯）', () => {
    render(<Toolbar {...makeProps()} />);
    expect(screen.getByTestId('recent-menu-btn')).toBeInTheDocument();
    expect(screen.getByTestId('open-file-btn')).toBeInTheDocument();
    expect(document.getElementById('btn-toc')).toBeInTheDocument();
    expect(document.getElementById('btn-comments')).toBeInTheDocument();
    expect(document.getElementById('btn-diff')).toBeInTheDocument();
    expect(document.getElementById('btn-copy')).toBeInTheDocument();
    expect(screen.getByTestId('settings-menu-btn')).toBeInTheDocument();
    expect(screen.getByTestId('overflow-menu-btn')).toBeInTheDocument();
  });

  test('フォルダを開く・パスをコピー・ブックマーク・チェックポイント・すべて削除は初期表示では見えない（⋯の中）', () => {
    render(<Toolbar {...makeProps()} />);
    expect(screen.queryByTestId('open-dir-btn')).not.toBeInTheDocument();
    expect(document.getElementById('btn-copy-path')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bookmark-toggle')).not.toBeInTheDocument();
    expect(document.getElementById('btn-checkpoint')).not.toBeInTheDocument();
    expect(document.getElementById('btn-clear-all')).not.toBeInTheDocument();
  });

  test('テーマ切替・本文フォント・本文幅は初期表示では見えない（設定の中）', () => {
    render(<Toolbar {...makeProps()} />);
    expect(document.getElementById('btn-theme')).not.toBeInTheDocument();
    expect(screen.queryByTestId('content-font-select')).not.toBeInTheDocument();
    expect(screen.queryByTestId('margin-toggle-left')).not.toBeInTheDocument();
  });

  test('⋯を開くとチェックポイントボタンが現れクリックで onCheckpoint が呼ばれる', async () => {
    const onCheckpoint = vi.fn();
    render(<Toolbar {...makeProps({ onCheckpoint })} />);
    await userEvent.click(screen.getByTestId('overflow-menu-btn'));
    const btn = document.getElementById('btn-checkpoint') as Element;
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    expect(onCheckpoint).toHaveBeenCalledTimes(1);
  });

  test('更新時刻とコネクションはドット1個に統合され title に情報を持つ', () => {
    render(<Toolbar {...makeProps({ isConnected: true })} />);
    const dot = screen.getByTestId('connection-dot');
    expect(dot).toHaveAttribute('data-connected', 'true');
    const status = document.getElementById('connection-status');
    expect(status).toHaveAttribute('title', expect.stringContaining('接続中'));
    // テキストとしての「コネクション」「更新: HH:MM:SS」は表示されない
    expect(document.getElementById('update-time')).not.toBeInTheDocument();
  });

  test('切断時は title に切断メッセージが入る', () => {
    render(<Toolbar {...makeProps({ isConnected: false })} />);
    const status = document.getElementById('connection-status');
    expect(status).toHaveAttribute('title', '接続が切れています');
    expect(screen.getByTestId('connection-dot')).toHaveAttribute(
      'data-connected',
      'false',
    );
  });
});
