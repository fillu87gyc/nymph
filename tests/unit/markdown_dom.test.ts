import { describe, expect, test, vi } from 'vitest';
import {
  applyDiffHighlight,
  restoreIndicators,
  scrollToLine,
} from '../../src/client/lib/markdown.ts';
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

describe('restoreIndicators', () => {
  test('コメント範囲に重なるブロックに has-comment が付く', () => {
    const block = makeBlock(1, 3);
    restoreIndicators(makeContainer(block), [makeComment({ ls: 2, le: 2 })]);
    expect(block.classList.contains('has-comment')).toBe(true);
  });

  test('コメント範囲外のブロックには has-comment が付かない', () => {
    const block = makeBlock(10, 12);
    restoreIndicators(makeContainer(block), [makeComment({ ls: 2, le: 2 })]);
    expect(block.classList.contains('has-comment')).toBe(false);
  });

  test('コメントなしなら既存の has-comment を除去する', () => {
    const block = makeBlock(1, 3);
    block.classList.add('has-comment');
    restoreIndicators(makeContainer(block), []);
    expect(block.classList.contains('has-comment')).toBe(false);
  });

  test('複数コメントで複数ブロックがマークされる', () => {
    const b1 = makeBlock(1, 2);
    const b2 = makeBlock(5, 6);
    const container = makeContainer(b1, b2);
    restoreIndicators(container, [
      makeComment({ id: 1, ls: 1, le: 1 }),
      makeComment({ id: 2, ls: 5, le: 5 }),
    ]);
    expect(b1.classList.contains('has-comment')).toBe(true);
    expect(b2.classList.contains('has-comment')).toBe(true);
  });

  test('コメントがブロック境界をまたぐ場合もマークされる', () => {
    const block = makeBlock(3, 6);
    restoreIndicators(makeContainer(block), [makeComment({ ls: 1, le: 4 })]);
    expect(block.classList.contains('has-comment')).toBe(true);
  });
});

describe('applyDiffHighlight', () => {
  test('diffMode=false ならハイライトしない', () => {
    const block = makeBlock(1, 5);
    applyDiffHighlight(makeContainer(block), false, {
      lines: [{ n: 2, type: 'insert', content: 'x', g: 0 }],
    });
    expect(block.classList.contains('diff-changed')).toBe(false);
  });

  test('diffData=null ならハイライトしない', () => {
    const block = makeBlock(1, 5);
    applyDiffHighlight(makeContainer(block), true, null);
    expect(block.classList.contains('diff-changed')).toBe(false);
  });

  test('insert 行を含むブロックに diff-changed が付く', () => {
    const block = makeBlock(1, 5);
    applyDiffHighlight(makeContainer(block), true, {
      lines: [
        { n: 3, type: 'insert', content: 'new line', g: 0 },
        { n: null, type: 'delete', content: 'old line', g: 0 },
      ],
    });
    expect(block.classList.contains('diff-changed')).toBe(true);
  });

  test('変更行の外側のブロックには diff-changed が付かない', () => {
    const block = makeBlock(10, 15);
    applyDiffHighlight(makeContainer(block), true, {
      lines: [{ n: 3, type: 'insert', content: 'new', g: 0 }],
    });
    expect(block.classList.contains('diff-changed')).toBe(false);
  });

  test('diff-side-ins / diff-side-del 要素が挿入される', () => {
    const block = makeBlock(1, 5);
    applyDiffHighlight(makeContainer(block), true, {
      lines: [
        { n: 2, type: 'insert', content: 'new line', g: 0 },
        { n: null, type: 'delete', content: 'old line', g: 0 },
      ],
    });
    expect(block.querySelector('.diff-side-ins')).not.toBeNull();
    expect(block.querySelector('.diff-side-del')).not.toBeNull();
  });

  test('空白のみの insert は diff-side-ins に追加されない', () => {
    const block = makeBlock(1, 5);
    applyDiffHighlight(makeContainer(block), true, {
      lines: [
        { n: 2, type: 'insert', content: '   ', g: 0 },
        { n: null, type: 'delete', content: 'old', g: 0 },
      ],
    });
    const insSide = block.querySelector('.diff-side-ins');
    expect(insSide?.children.length ?? 0).toBe(0);
  });

  test('diff OFF にすると既存の diff-changed / diff-side が除去される', () => {
    const block = makeBlock(1, 5);
    const container = makeContainer(block);
    applyDiffHighlight(container, true, {
      lines: [{ n: 2, type: 'insert', content: 'x', g: 0 }],
    });
    expect(block.classList.contains('diff-changed')).toBe(true);
    applyDiffHighlight(container, false, null);
    expect(block.classList.contains('diff-changed')).toBe(false);
    expect(block.querySelector('.diff-side')).toBeNull();
  });

  test('複数グループの diff が同一ブロックに収まる', () => {
    const block = makeBlock(1, 10);
    applyDiffHighlight(makeContainer(block), true, {
      lines: [
        { n: 2, type: 'insert', content: 'ins1', g: 0 },
        { n: null, type: 'delete', content: 'del1', g: 0 },
        { n: 5, type: 'insert', content: 'ins2', g: 1 },
        { n: null, type: 'delete', content: 'del2', g: 1 },
      ],
    });
    expect(block.querySelectorAll('.diff-ins').length).toBe(2);
    expect(block.querySelectorAll('.diff-del').length).toBe(2);
  });
});

describe('scrollToLine', () => {
  test('対応ブロックがない場合は何もしない', () => {
    scrollToLine(makeContainer(), makeComment({ ls: 99 }));
  });

  test('ブロックに scrollIntoView を呼び出す', () => {
    const block = makeBlock(1, 1);
    const scrollSpy = vi.fn();
    block.scrollIntoView = scrollSpy;
    scrollToLine(makeContainer(block), makeComment({ ls: 1, le: 1 }));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  test('block コメントでアウトラインが設定される', () => {
    const block = makeBlock(1, 1);
    block.scrollIntoView = vi.fn();
    scrollToLine(makeContainer(block), makeComment({ ls: 1, le: 1, block_type: 'paragraph' }));
    expect(block.style.outline).not.toBe('');
    expect(block.style.outlineOffset).not.toBe('');
  });
});
