import { describe, expect, test, vi } from 'vitest';
import { scrollToLine } from '../../src/client/lib/markdown.ts';
import type { Comment } from '../../src/client/types.ts';

function makeBlock(ls: number, le: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'md-block';
  el.dataset.ls = String(ls);
  el.dataset.le = String(le);
  return el;
}

function makeContainer(...blocks: HTMLElement[]): HTMLElement {
  const div = document.createElement('div');
  for (const b of blocks) div.appendChild(b);
  return div;
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    ls: 1,
    le: 3,
    block_type: 'paragraph',
    context: 'test',
    text: 'comment',
    ...overrides,
  };
}

describe('scrollToLine', () => {
  test('対応ブロックがない場合は何もしない', () => {
    scrollToLine(makeContainer(), makeComment({ ls: 99 }));
  });

  test('ブロックに scrollIntoView を呼び出す', () => {
    const block = makeBlock(1, 1);
    const scrollSpy = vi.fn();
    block.scrollIntoView = scrollSpy;
    scrollToLine(makeContainer(block), makeComment({ ls: 1, le: 1 }));
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  test('block コメントでアウトラインが設定される', () => {
    const block = makeBlock(1, 1);
    block.scrollIntoView = vi.fn();
    scrollToLine(
      makeContainer(block),
      makeComment({ ls: 1, le: 1, block_type: 'paragraph' }),
    );
    expect(block.style.outline).not.toBe('');
    expect(block.style.outlineOffset).not.toBe('');
  });
});
