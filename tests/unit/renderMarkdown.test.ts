import { describe, expect, test, vi } from 'vitest';
import {
  renderMarkdown,
  scrollToLine,
} from '../../src/client/lib/markdown.ts';
import type { Comment } from '../../src/client/types.ts';

function makeSetup() {
  const container = document.createElement('div');
  const welcome = document.createElement('div');
  welcome.id = 'welcome';
  container.appendChild(welcome);
  return { container, welcome };
}

describe('renderMarkdown', () => {
  test('空ソースのとき welcome を表示し container は空になる', async () => {
    const { container, welcome } = makeSetup();
    welcome.classList.add('hidden');
    await renderMarkdown(container, welcome, '', vi.fn(), vi.fn());
    expect(welcome.classList.contains('hidden')).toBe(false);
    expect(container.querySelectorAll('.md-block').length).toBe(0);
  });

  test('段落が .md-block + <p> として描画される', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, 'Hello world', vi.fn(), vi.fn());
    const block = container.querySelector('.md-block');
    expect(block).not.toBeNull();
    expect(block?.querySelector('p')).not.toBeNull();
  });

  test('見出しが .md-block + <h1> として描画される', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, '# Title', vi.fn(), vi.fn());
    expect(container.querySelector('h1')).not.toBeNull();
  });

  test('コードブロックが .md-block + <pre><code> として描画される', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, '```ts\nconst x = 1;\n```', vi.fn(), vi.fn());
    expect(container.querySelector('pre code')).not.toBeNull();
  });

  test('各ブロックに .comment-btn が付く', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, '# H1\n\nParagraph', vi.fn(), vi.fn());
    const btns = container.querySelectorAll('.comment-btn');
    expect(btns.length).toBeGreaterThanOrEqual(2);
  });

  test('コメントボタンをクリックすると onAddComment が呼ばれる', async () => {
    const { container, welcome } = makeSetup();
    const onAddComment = vi.fn();
    await renderMarkdown(container, welcome, '# Title', onAddComment, vi.fn());
    const btn = container.querySelector('.comment-btn') as HTMLElement;
    btn.click();
    expect(onAddComment).toHaveBeenCalledOnce();
    const [ls, le, , blockType] = onAddComment.mock.calls[0];
    expect(ls).toBeTypeOf('number');
    expect(le).toBeTypeOf('number');
    expect(blockType).toBe('heading');
  });

  test('コードブロックのコメントボタンに code context が渡される', async () => {
    const { container, welcome } = makeSetup();
    const onAddComment = vi.fn();
    await renderMarkdown(container, welcome, '```ts\nconst x = 1;\n```', onAddComment, vi.fn());
    const btn = container.querySelector('.comment-btn') as HTMLElement;
    btn.click();
    const [, , , blockType, context] = onAddComment.mock.calls[0];
    expect(blockType).toBe('code');
    expect(context).toHaveProperty('code');
  });

  test('リストが .md-block + <ul> として描画される', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, '- item1\n- item2', vi.fn(), vi.fn());
    expect(container.querySelector('ul')).not.toBeNull();
  });

  test('テーブルが .md-block + <table> として描画される', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(
      container,
      welcome,
      '| A | B |\n|---|---|\n| 1 | 2 |',
      vi.fn(),
      vi.fn(),
    );
    expect(container.querySelector('table')).not.toBeNull();
  });

  test('テーブルのコメントボタンに table context が渡される', async () => {
    const { container, welcome } = makeSetup();
    const onAddComment = vi.fn();
    await renderMarkdown(
      container,
      welcome,
      '| A | B |\n|---|---|\n| 1 | 2 |',
      onAddComment,
      vi.fn(),
    );
    const btn = container.querySelector('.comment-btn') as HTMLElement;
    btn.click();
    const [, , , blockType, context] = onAddComment.mock.calls[0];
    expect(blockType).toBe('table');
    expect(context).toHaveProperty('headers');
  });

  test('水平線が .md-block + <hr> として描画される', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, '---', vi.fn(), vi.fn());
    expect(container.querySelector('hr')).not.toBeNull();
  });

  test('blockquote が .md-block + <blockquote> として描画される', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, '> quoted text', vi.fn(), vi.fn());
    expect(container.querySelector('blockquote')).not.toBeNull();
  });

  test('mermaid コードブロックに draw.io ボタンが付く', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(
      container,
      welcome,
      '```mermaid\ngraph TD; A-->B\n```',
      vi.fn(),
      vi.fn(),
    );
    const btn = container.querySelector('.btn-drawio') as HTMLElement | null;
    expect(btn).not.toBeNull();
  });

  test('draw.io ボタンをクリックすると onOpenDrawio が呼ばれる', async () => {
    const { container, welcome } = makeSetup();
    const onOpenDrawio = vi.fn();
    await renderMarkdown(
      container,
      welcome,
      '```mermaid\ngraph TD; A-->B\n```',
      vi.fn(),
      onOpenDrawio,
    );
    const btn = container.querySelector('.btn-drawio') as HTMLElement;
    btn.click();
    expect(onOpenDrawio).toHaveBeenCalledOnce();
  });

  test('data-ls / data-le 属性が正しく付く', async () => {
    const { container, welcome } = makeSetup();
    await renderMarkdown(container, welcome, '# H1\n\nParagraph', vi.fn(), vi.fn());
    const blocks = container.querySelectorAll('.md-block');
    for (const b of blocks) {
      expect((b as HTMLElement).dataset.ls).toBeDefined();
      expect((b as HTMLElement).dataset.le).toBeDefined();
    }
  });
});

describe('scrollToLine (selection コメント)', () => {
  function makeComment(overrides: Partial<Comment> = {}): Comment {
    return {
      id: 1,
      ls: 1,
      le: 1,
      block_type: 'paragraph',
      context: 'test',
      text: 'comment',
      ...overrides,
    };
  }

  test('selection コメントで context テキストをハイライトする', () => {
    const container = document.createElement('div');
    const block = document.createElement('div');
    block.className = 'md-block';
    block.dataset.ls = '1';
    block.dataset.le = '1';
    block.scrollIntoView = vi.fn();
    block.textContent = 'Hello world test content';
    container.appendChild(block);

    scrollToLine(
      container,
      makeComment({
        ls: 1,
        le: 1,
        block_type: 'selection',
        context: 'Hello world',
      }),
    );
    // ハイライトが付くか、アウトラインにフォールバックするか
    const hasHighlight =
      block.querySelector('.text-highlight') !== null ||
      block.style.outline !== '';
    expect(hasHighlight).toBe(true);
  });

  test('selection_offset を指定した場合も動作する', () => {
    const container = document.createElement('div');
    const block = document.createElement('div');
    block.className = 'md-block';
    block.dataset.ls = '1';
    block.dataset.le = '1';
    block.scrollIntoView = vi.fn();
    block.textContent = 'prefix Hello world suffix';
    container.appendChild(block);

    expect(() =>
      scrollToLine(
        container,
        makeComment({
          ls: 1,
          le: 1,
          block_type: 'selection',
          context: 'Hello world',
          selection_offset: 7,
        }),
      ),
    ).not.toThrow();
  });
});
