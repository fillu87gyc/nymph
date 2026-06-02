import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import {
  type DiffGroup,
  MarkdownBlock,
} from '../../src/client/components/MarkdownBlock.tsx';
import type { BlockData } from '../../src/client/lib/parseBlocks.ts';

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    key: 'block-0',
    html: '<p>テスト段落</p>',
    ls: 1,
    le: 1,
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
    diffGroups: [],
    diffMode: false,
    onAddComment: vi.fn(),
    onOpenDrawio: vi.fn(),
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
  test('ボタンクリックで ls / le / displayCtx / type / context / null が渡る', async () => {
    const onAddComment = vi.fn();
    const block = makeBlock({
      ls: 3,
      le: 5,
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
  test('data-ls / data-le / data-block-type が正しく設定される', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block: makeBlock({ ls: 4, le: 8, type: 'code' }) })}
      />,
    );
    const el = container.querySelector(
      '[data-testid="md-block"]',
    ) as HTMLElement;
    expect(el.dataset.ls).toBe('4');
    expect(el.dataset.le).toBe('8');
    expect(el.dataset.blockType).toBe('code');
  });
});

// ── diff ─────────────────────────────────────────────────────

describe('diff 表示', () => {
  const diffGroups: DiffGroup[] = [
    {
      inserts: [{ n: 1, type: 'insert', content: '追加行', g: 0 }],
      deletes: [{ n: null, type: 'delete', content: '削除行', g: 0 }],
    },
  ];

  test('diffMode=false では diff-changed なし・diff-side 要素もない', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups, diffMode: false })} />,
    );
    expect(container.querySelector('[data-testid="md-block"]')).toHaveAttribute(
      'data-diff-changed',
      'false',
    );
    expect(container.querySelector('[data-testid="diff-side-del"]')).toBeNull();
    expect(container.querySelector('[data-testid="diff-side-ins"]')).toBeNull();
  });

  test('diffMode=true + diffGroups あり で data-diff-changed="true" が付く', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups, diffMode: true })} />,
    );
    expect(container.querySelector('[data-testid="md-block"]')).toHaveAttribute(
      'data-diff-changed',
      'true',
    );
  });

  test('diff-side-ins / diff-side-del が描画され内容が正しい', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups, diffMode: true })} />,
    );
    expect(
      container.querySelector('[data-testid="diff-side-ins"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="diff-side-del"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="diff-ins"]')?.textContent,
    ).toContain('追加行');
    expect(
      container.querySelector('[data-testid="diff-del"]')?.textContent,
    ).toContain('削除行');
  });

  test('空白のみの insert は diff-side-ins に含まれない', () => {
    const groups: DiffGroup[] = [
      {
        inserts: [{ n: 1, type: 'insert', content: '   ', g: 0 }],
        deletes: [{ n: null, type: 'delete', content: '削除行', g: 0 }],
      },
    ];
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups: groups, diffMode: true })} />,
    );
    expect(container.querySelector('[data-testid="diff-side-ins"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="diff-side-del"]'),
    ).toBeInTheDocument();
  });

  test('diffGroups が空なら diff-changed なし', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups: [], diffMode: true })} />,
    );
    expect(container.querySelector('[data-testid="md-block"]')).toHaveAttribute(
      'data-diff-changed',
      'false',
    );
  });

  test('1 行 → 複数行の変更では追加行すべて・削除行すべてが全体ハイライトされる', () => {
    // 削除 1 行・追加 3 行（行数が 1:N）。対応が曖昧なので文字単位 diff ではなく
    // 行全体を mark で囲んでハイライトする。
    const groups: DiffGroup[] = [
      {
        deletes: [
          { n: null, type: 'delete', content: '- ここは岐阜県です', g: 0 },
        ],
        inserts: [
          { n: 1, type: 'insert', content: '- ここは', g: 0 },
          { n: 2, type: 'insert', content: '- 水と山が綺麗な', g: 0 },
          { n: 3, type: 'insert', content: '- 静岡県です', g: 0 },
        ],
      },
    ];
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups: groups, diffMode: true })} />,
    );
    // 追加 3 行すべてに緑ハイライト、削除 1 行に赤ハイライト
    expect(
      container.querySelectorAll(
        '[data-testid="diff-side-ins"] [data-testid="diff-char-ins"]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll(
        '[data-testid="diff-side-del"] [data-testid="diff-char-del"]',
      ),
    ).toHaveLength(1);
  });

  test('1 行 → 1 行の変更では変更箇所だけ文字単位ハイライトされる', () => {
    const groups: DiffGroup[] = [
      {
        deletes: [
          { n: null, type: 'delete', content: 'Some content here.', g: 0 },
        ],
        inserts: [{ n: 1, type: 'insert', content: 'Some XYZ here.', g: 0 }],
      },
    ];
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups: groups, diffMode: true })} />,
    );
    // 共通部分はハイライトされず、変更箇所のみ mark が付く
    expect(
      container.querySelectorAll('[data-testid="diff-char-del"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-testid="diff-char-ins"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="diff-del"]')?.textContent,
    ).toContain('Some content here.');
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
});
