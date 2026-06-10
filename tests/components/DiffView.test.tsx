import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DiffView } from '../../src/client/components/DiffView.tsx';
import type {
  Comment,
  DiffContext,
  DiffLine,
  DiffResponse,
} from '../../src/client/types.ts';

function eq(o: number, n: number, content: string): DiffLine {
  return { n, o, type: 'equal', content, g: null };
}
function del(o: number, content: string, g: number): DiffLine {
  return { n: null, o, type: 'delete', content, g };
}
function ins(n: number, content: string, g: number): DiffLine {
  return { n, o: null, type: 'insert', content, g };
}

const replaceDiff: DiffResponse = {
  hasCheckpoint: true,
  lines: [
    eq(1, 1, '# title'),
    del(2, 'Some content here.', 0),
    ins(2, 'Some XYZ here.', 0),
    eq(3, 3, 'tail'),
  ],
};

function makeProps(
  overrides: Partial<React.ComponentProps<typeof DiffView>> = {},
): React.ComponentProps<typeof DiffView> {
  return {
    diffData: replaceDiff,
    comments: [],
    highlightTarget: null,
    onAddComment: vi.fn(),
    onClickCommentAnchor: vi.fn(),
    ...overrides,
  };
}

describe('DiffView の表示', () => {
  test('チェックポイントなしでは空状態メッセージを表示', () => {
    const { container } = render(
      <DiffView
        {...makeProps({ diffData: { lines: [], hasCheckpoint: false } })}
      />,
    );
    expect(
      container.querySelector('[data-testid="diff-empty"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="diff-row"]')).toBeNull();
  });

  test('equal 行は左右両ペインに同じ内容が出る', () => {
    const { container } = render(<DiffView {...makeProps()} />);
    const rows = container.querySelectorAll('[data-testid="diff-row"]');
    expect(rows).toHaveLength(3);
    const first = rows[0];
    expect(
      first.querySelector('[data-testid="diff-cell-old"]')?.textContent,
    ).toContain('# title');
    expect(
      first.querySelector('[data-testid="diff-cell-new"]')?.textContent,
    ).toContain('# title');
  });

  test('1:1 replace は同じ行の左に delete・右に insert、文字単位ハイライト付き', () => {
    const { container } = render(<DiffView {...makeProps()} />);
    const row = container.querySelectorAll('[data-testid="diff-row"]')[1];
    const oldCell = row.querySelector('[data-testid="diff-cell-old"]');
    const newCell = row.querySelector('[data-testid="diff-cell-new"]');
    expect(oldCell?.getAttribute('data-line-type')).toBe('delete');
    expect(newCell?.getAttribute('data-line-type')).toBe('insert');
    expect(
      oldCell?.querySelector('[data-testid="diff-char-del"]')?.textContent,
    ).toBe('content');
    expect(
      newCell?.querySelector('[data-testid="diff-char-ins"]')?.textContent,
    ).toBe('XYZ');
  });

  test('追加のみの行は左ペインが empty になる', () => {
    const diff: DiffResponse = {
      hasCheckpoint: true,
      lines: [eq(1, 1, 'a'), ins(2, 'added', 0)],
    };
    const { container } = render(
      <DiffView {...makeProps({ diffData: diff })} />,
    );
    const row = container.querySelectorAll('[data-testid="diff-row"]')[1];
    expect(
      row
        .querySelector('[data-testid="diff-cell-old"]')
        ?.getAttribute('data-line-type'),
    ).toBe('empty');
    expect(
      row.querySelector('[data-testid="diff-cell-new"]')?.textContent,
    ).toContain('added');
  });

  test('行番号が新旧それぞれのファイル基準で表示される', () => {
    const diff: DiffResponse = {
      hasCheckpoint: true,
      lines: [eq(1, 1, 'a'), del(2, 'b', 0), eq(3, 2, 'c')],
    };
    const { container } = render(
      <DiffView {...makeProps({ diffData: diff })} />,
    );
    const rows = container.querySelectorAll('[data-testid="diff-row"]');
    const lastOld = rows[2].querySelector('[data-testid="diff-num-old"]');
    const lastNew = rows[2].querySelector('[data-testid="diff-num-new"]');
    expect(lastOld?.textContent).toContain('3');
    expect(lastNew?.textContent).toContain('2');
  });
});

describe('DiffView のコメント連携', () => {
  test('＋ クリックで DiffContext（side/行番号/hunk スナップショット）が渡る', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    const { container } = render(<DiffView {...makeProps({ onAddComment })} />);
    const row = container.querySelectorAll('[data-testid="diff-row"]')[1];
    const btn = row.querySelector(
      '[data-testid="diff-cell-new"] [data-testid="diff-comment-btn"]',
    );
    if (!btn) throw new Error('comment button not found');
    await user.click(btn);

    expect(onAddComment).toHaveBeenCalledTimes(1);
    const [lineStart, lineEnd, displayCtx, blockType, ctx] =
      onAddComment.mock.calls[0];
    expect(lineStart).toBe(2);
    expect(lineEnd).toBe(2);
    expect(displayCtx).toBe('Some XYZ here.');
    expect(blockType).toBe('diff');
    const diffCtx = ctx as DiffContext;
    expect(diffCtx.side).toBe('new');
    expect(diffCtx.newLine).toBe(2);
    expect(diffCtx.oldLine).toBeNull();
    expect(diffCtx.line).toBe('Some XYZ here.');
    // 前後 2 行（先頭なので前 1 行 + 対象 + 後 1 行）のスナップショット
    expect(diffCtx.hunk).toEqual(['# title', 'Some XYZ here.', 'tail']);
  });

  test('削除行の ＋ は side=old / oldLine 付きで渡る', async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    const { container } = render(<DiffView {...makeProps({ onAddComment })} />);
    const row = container.querySelectorAll('[data-testid="diff-row"]')[1];
    const btn = row.querySelector(
      '[data-testid="diff-cell-old"] [data-testid="diff-comment-btn"]',
    );
    if (!btn) throw new Error('comment button not found');
    await user.click(btn);

    const [, , , , ctx] = onAddComment.mock.calls[0];
    const diffCtx = ctx as DiffContext;
    expect(diffCtx.side).toBe('old');
    expect(diffCtx.oldLine).toBe(2);
    expect(diffCtx.newLine).toBeNull();
    expect(diffCtx.line).toBe('Some content here.');
  });

  test('一致する差分コメントがある行にはアンカーが表示され、クリックで通知される', async () => {
    const user = userEvent.setup();
    const onClickCommentAnchor = vi.fn();
    const comment: Comment = {
      id: 1,
      lineStart: 2,
      lineEnd: 2,
      block_type: 'diff',
      context: {
        side: 'new',
        oldLine: null,
        newLine: 2,
        line: 'Some XYZ here.',
        hunk: ['# title', 'Some XYZ here.', 'tail'],
      },
      text: 'ここが気になる',
    };
    const { container } = render(
      <DiffView
        {...makeProps({ comments: [comment], onClickCommentAnchor })}
      />,
    );
    const anchor = container.querySelector(
      '[data-testid="diff-comment-anchor"]',
    );
    expect(anchor).not.toBeNull();
    const cell = anchor?.closest('[data-testid="diff-cell-new"]');
    expect(cell?.getAttribute('data-has-comment')).toBe('true');
    if (!anchor) throw new Error('anchor not found');
    await user.click(anchor);
    expect(onClickCommentAnchor).toHaveBeenCalledWith(
      comment,
      expect.any(Number),
      expect.any(Number),
    );
  });

  test('行内容が変わって一致しなくなったコメントはアンカーを出さない', () => {
    const comment: Comment = {
      id: 1,
      lineStart: 2,
      lineEnd: 2,
      block_type: 'diff',
      context: {
        side: 'new',
        oldLine: null,
        newLine: 2,
        line: '古い内容の行',
        hunk: ['古い内容の行'],
      },
      text: 'stale',
    };
    const { container } = render(
      <DiffView {...makeProps({ comments: [comment] })} />,
    );
    expect(
      container.querySelector('[data-testid="diff-comment-anchor"]'),
    ).toBeNull();
  });
});

describe('DiffView のハイライトジャンプ', () => {
  test('highlightTarget のセルに data-highlighted が付く', () => {
    const { container } = render(
      <DiffView
        {...makeProps({ highlightTarget: { side: 'new', line: 2, v: 1 } })}
      />,
    );
    const cell = container.querySelector('[data-diff-cell="new:2"]');
    expect(cell?.getAttribute('data-highlighted')).toBe('true');
  });
});
