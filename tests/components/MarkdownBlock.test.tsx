import { render, screen } from '@testing-library/react';
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
    expect(container.querySelector('.comment-btn')).toBeNull();
  });

  test('heading ブロックにはボタンが描画されない', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block: makeBlock({ type: 'heading' }) })}
      />,
    );
    expect(container.querySelector('.comment-btn')).toBeNull();
  });

  test('table ブロックにはボタンが描画される', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block: makeBlock({ type: 'table' }) })}
      />,
    );
    expect(container.querySelector('.comment-btn')).toBeInTheDocument();
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
    expect(container.querySelector('.comment-btn')).toBeInTheDocument();
  });
});

// ── ボタンの表示・非表示 ──────────────────────────────────────

describe('コメントボタンの表示制御', () => {
  test('デフォルトで opacity:0 / pointerEvents:none', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ block: makeBlock({ type: 'table' }) })} />,
    );
    const btn = container.querySelector('.comment-btn') as HTMLElement;
    expect(btn.style.opacity).toBe('0');
    expect(btn.style.pointerEvents).toBe('none');
  });

  test('ホバーで opacity:1 になる', async () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ block: makeBlock({ type: 'table' }) })} />,
    );
    const wrapper = container.querySelector('.md-block') as HTMLElement;
    await userEvent.hover(wrapper);
    const btn = container.querySelector('.comment-btn') as HTMLElement;
    expect(btn.style.opacity).toBe('1');
    expect(btn.style.pointerEvents).toBe('auto');
  });

  test('ホバー解除で opacity:0 に戻る', async () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ block: makeBlock({ type: 'table' }) })} />,
    );
    const wrapper = container.querySelector('.md-block') as HTMLElement;
    await userEvent.hover(wrapper);
    await userEvent.unhover(wrapper);
    const btn = container.querySelector('.comment-btn') as HTMLElement;
    expect(btn.style.opacity).toBe('0');
  });

  test('hasComment=true ならホバーなしでも opacity:1', () => {
    const { container } = render(
      <MarkdownBlock
        {...makeProps({ block: makeBlock({ type: 'table' }), hasComment: true })}
      />,
    );
    const btn = container.querySelector('.comment-btn') as HTMLElement;
    expect(btn.style.opacity).toBe('1');
    expect(btn.style.pointerEvents).toBe('auto');
  });
});

// ── has-comment クラス ────────────────────────────────────────

describe('has-comment クラス', () => {
  test('hasComment=false のとき has-comment クラスなし', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ hasComment: false })} />,
    );
    expect(container.querySelector('.md-block')).not.toHaveClass('has-comment');
  });

  test('hasComment=true のとき has-comment クラスが付く', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ hasComment: true })} />,
    );
    expect(container.querySelector('.md-block')).toHaveClass('has-comment');
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
      container.querySelector('.comment-btn') as HTMLElement,
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
    const el = container.querySelector('.md-block') as HTMLElement;
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

  test('diffMode=false では diff-changed クラスも diff-side 要素もない', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups, diffMode: false })} />,
    );
    expect(container.querySelector('.md-block')).not.toHaveClass(
      'diff-changed',
    );
    expect(container.querySelector('.diff-side')).toBeNull();
  });

  test('diffMode=true + diffGroups あり で diff-changed クラスが付く', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups, diffMode: true })} />,
    );
    expect(container.querySelector('.md-block')).toHaveClass('diff-changed');
  });

  test('diff-side-ins / diff-side-del が描画され内容が正しい', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups, diffMode: true })} />,
    );
    expect(container.querySelector('.diff-side-ins')).toBeInTheDocument();
    expect(container.querySelector('.diff-side-del')).toBeInTheDocument();
    expect(container.querySelector('.diff-ins')?.textContent).toContain(
      '追加行',
    );
    expect(container.querySelector('.diff-del')?.textContent).toContain(
      '削除行',
    );
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
    expect(container.querySelector('.diff-side-ins')).toBeNull();
    expect(container.querySelector('.diff-side-del')).toBeInTheDocument();
  });

  test('diffGroups が空なら diff-changed なし', () => {
    const { container } = render(
      <MarkdownBlock {...makeProps({ diffGroups: [], diffMode: true })} />,
    );
    expect(container.querySelector('.md-block')).not.toHaveClass(
      'diff-changed',
    );
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
