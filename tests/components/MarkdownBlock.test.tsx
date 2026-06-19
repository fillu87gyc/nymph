import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MarkdownBlock } from '../../src/client/components/MarkdownBlock.tsx';
import type { BlockData } from '../../src/client/lib/parseBlocks.ts';

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    key: 'block-0',
    html: '<p>テスト段落</p>',
    lineStart: 1,
    lineEnd: 1,
    type: 'paragraph',
    commentContext: { displayCtx: 'テスト', context: 'テスト段落' },
    ...overrides,
  };
}

function makeProps(
  overrides: Partial<React.ComponentProps<typeof MarkdownBlock>> = {},
): React.ComponentProps<typeof MarkdownBlock> {
  return {
    block: makeBlock(),
    hasComment: false,
    highlighted: false,
    onAddComment: vi.fn(),
    onOpenDrawio: vi.fn(),
    onOpenMermaidZoom: vi.fn(),
    onRef: vi.fn(),
    ...overrides,
  };
}

// ── ボタンのレンダリング制御 ──────────────────────────────────

describe('コメントボタンのレンダリング制御', () => {
  test('paragraph ブロックにはボタンが描画されない', () => {
    const { container } = render(<MarkdownBlock {...makeProps()} />);
    expect(container.querySelector('[data-testid="comment-btn"]')).toBeNull();
  });

  test('heading ブロックにはボタンが描画されない', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block: makeBlock({ type: 'heading' }) })}
      />,
    );
    expect(container.querySelector('[data-testid="comment-btn"]')).toBeNull();
  });

  test('table ブロックにはボタンが描画される', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ block: makeBlock({ type: 'table' }) })} />,
    );
    expect(
      container.querySelector('[data-testid="comment-btn"]'),
    ).toBeInTheDocument();
  });

  test('mermaid ブロックにはボタンが描画される', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({
          block: makeBlock({
            type: 'mermaid',
            html: '',
            mermaidCode: 'graph TD; A-->B',
            mermaidId: 'mermaid-1',
          }),
        })}
      />,
    );
    expect(
      container.querySelector('[data-testid="comment-btn"]'),
    ).toBeInTheDocument();
  });
});

// ── ボタンの表示・非表示 ──────────────────────────────────────
//
// 表示/非表示は CSS（.md-block:hover / .md-block.has-comment）に委譲した。
// JS は opacity / pointer-events を一切操作しない。ホバーの視覚挙動は
// jsdom では :hover が評価できないため E2E（comments.test.ts）で検証する。

describe('コメントボタンの表示制御', () => {
  test('ボタンの表示/非表示は CSS に委譲し、JS はインラインスタイルを持たない', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ block: makeBlock({ type: 'table' }) })} />,
    );
    const btn = container.querySelector(
      '[data-testid="comment-btn"]',
    ) as HTMLElement;
    // インラインの opacity / pointer-events が付いていないこと（= CSS が制御）
    expect(btn.style.opacity).toBe('');
    expect(btn.style.pointerEvents).toBe('');
  });

  test('mouseenter しても JS はインラインスタイルを付けない', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ block: makeBlock({ type: 'table' }) })} />,
    );
    const wrapper = container.querySelector(
      '[data-testid="md-block"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    fireEvent.mouseMove(wrapper);
    const btn = container.querySelector(
      '[data-testid="comment-btn"]',
    ) as HTMLElement;
    expect(btn.style.opacity).toBe('');
    expect(btn.style.pointerEvents).toBe('');
  });

  test('hasComment=true でも JS はインラインスタイルを付けない（data-has-comment で CSS が制御）', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({
          block: makeBlock({ type: 'table' }),
          hasComment: true,
        })}
      />,
    );
    const block = container.querySelector(
      '[data-testid="md-block"]',
    ) as HTMLElement;
    const btn = container.querySelector(
      '[data-testid="comment-btn"]',
    ) as HTMLElement;
    expect(block).toHaveAttribute('data-has-comment', 'true');
    expect(btn.style.opacity).toBe('');
  });
});

// ── has-comment クラス ────────────────────────────────────────

describe('data-has-comment 属性', () => {
  test('hasComment=false のとき data-has-comment="false"', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ hasComment: false })} />,
    );
    expect(container.querySelector('[data-testid="md-block"]')).toHaveAttribute(
      'data-has-comment',
      'false',
    );
  });

  test('hasComment=true のとき data-has-comment="true"', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ hasComment: true })} />,
    );
    expect(container.querySelector('[data-testid="md-block"]')).toHaveAttribute(
      'data-has-comment',
      'true',
    );
  });
});

// ── onAddComment コールバック ─────────────────────────────────

describe('onAddComment コールバック', () => {
  test('ボタンクリックで lineStart / lineEnd / displayCtx / type / context / null が渡る', async () => {
    const onAddComment = vi.fn();
    const block = makeBlock({
      lineStart: 3,
      lineEnd: 5,
      type: 'table',
      commentContext: { displayCtx: 'Name | Value', context: 'Name | Value' },
    });
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block, hasComment: true, onAddComment })}
      />,
    );
    await userEvent.click(
      container.querySelector('[data-testid="comment-btn"]') as HTMLElement,
    );
    expect(onAddComment).toHaveBeenCalledOnce();
    expect(onAddComment).toHaveBeenCalledWith(
      3,
      5,
      'Name | Value',
      'table',
      'Name | Value',
      null,
    );
  });
});

// ── data 属性 ─────────────────────────────────────────────────

describe('data 属性', () => {
  test('data-line-start / data-line-end / data-block-type が正しく設定される', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({
          block: makeBlock({ lineStart: 4, lineEnd: 8, type: 'code' }),
        })}
      />,
    );
    const el = container.querySelector(
      '[data-testid="md-block"]',
    ) as HTMLElement;
    expect(el.dataset.lineStart).toBe('4');
    expect(el.dataset.lineEnd).toBe('8');
    expect(el.dataset.blockType).toBe('code');
  });
});

// ── mermaid ──────────────────────────────────────────────────

describe('mermaid ブロック', () => {
  function makeMermaidBlock(): BlockData {
    return makeBlock({
      type: 'mermaid',
      html: '',
      mermaidCode: 'graph TD; A-->B',
      mermaidId: 'mermaid-1',
      commentContext: {
        displayCtx: 'graph TD',
        context: { code: 'graph TD; A-->B' },
      },
    });
  }

  test('draw.io ボタンが表示される', () => {
    render(<MarkdownBlock {...makeProps({ block: makeMermaidBlock() })} />);
    expect(screen.getByText('→ draw.io')).toBeInTheDocument();
  });

  test('draw.io クリックで onOpenDrawio が mermaidCode を引数に呼ばれる', async () => {
    const onOpenDrawio = vi.fn();
    render(
      <MarkdownBlock
        {...makeProps({ block: makeMermaidBlock(), onOpenDrawio })}
      />,
    );
    await userEvent.click(screen.getByText('→ draw.io'));
    expect(onOpenDrawio).toHaveBeenCalledWith('graph TD; A-->B');
  });

  test('mermaid div が id 付きで描画される', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ block: makeMermaidBlock() })} />,
    );
    expect(container.querySelector('#mermaid-1')).toBeInTheDocument();
  });

  test('mermaid-area クリックで onOpenMermaidZoom が viewBox 由来の width/height 付き SVG を引数に呼ばれる', async () => {
    const onOpenMermaidZoom = vi.fn();
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block: makeMermaidBlock(), onOpenMermaidZoom })}
      />,
    );
    // 実際は mermaid.run() が #mermaid-1 の innerHTML を SVG に置き換える。
    // jsdom では mermaid を実行しないため、その結果を模したダミー SVG を注入する。
    const mermaidDiv = container.querySelector('#mermaid-1') as HTMLElement;
    mermaidDiv.innerHTML =
      '<svg viewBox="0 0 800 200" width="100%" style="max-width: 800px;"></svg>';

    await userEvent.click(
      container.querySelector('[data-testid="mermaid-area"]') as HTMLElement,
    );
    expect(onOpenMermaidZoom).toHaveBeenCalledOnce();
    const html = onOpenMermaidZoom.mock.calls[0][0] as string;
    expect(html).toContain('width="800"');
    expect(html).toContain('height="200"');
  });

  test('mermaid-area クリック時に SVG が無ければ onOpenMermaidZoom は呼ばれない', async () => {
    const onOpenMermaidZoom = vi.fn();
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block: makeMermaidBlock(), onOpenMermaidZoom })}
      />,
    );
    await userEvent.click(
      container.querySelector('[data-testid="mermaid-area"]') as HTMLElement,
    );
    expect(onOpenMermaidZoom).not.toHaveBeenCalled();
  });
});
