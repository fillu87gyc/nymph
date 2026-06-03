import { describe, expect, test, vi } from 'vitest';
import { highlightSelectionText } from '../../src/client/lib/markdown.ts';

function makeBlock(ls: number, le: number, text = 'sample text'): HTMLElement {
  const el = document.createElement('div');
  el.dataset.ls = String(ls);
  el.dataset.le = String(le);
  el.textContent = text;
  return el;
}

describe('highlightSelectionText', () => {
  test('searchText が空の場合は何もしない', () => {
    const onFallback = vi.fn();
    highlightSelectionText([], 1, 1, '', null, onFallback);
    expect(onFallback).not.toHaveBeenCalled();
  });

  test('テキストが見つからない場合は onFallback を呼ばない', () => {
    const onFallback = vi.fn();
    const block = makeBlock(1, 1, 'hello world');
    highlightSelectionText([block], 1, 1, 'not found', null, onFallback);
    expect(onFallback).not.toHaveBeenCalled();
  });

  test('テキストが見つかった場合は CSS Highlight API か onFallback を使う', () => {
    const onFallback = vi.fn();
    const block = makeBlock(1, 1, 'hello world');
    // CSS Highlight API が使えない環境では onFallback が呼ばれる
    const hasHighlightAPI = typeof CSS.highlights !== 'undefined';
    highlightSelectionText([block], 1, 1, 'hello', null, onFallback);
    if (!hasHighlightAPI) {
      expect(onFallback).toHaveBeenCalledWith(1);
    }
  });

  test('末尾の … はトリムして検索する', () => {
    const onFallback = vi.fn();
    const block = makeBlock(1, 1, 'hello world');
    const hasHighlightAPI = typeof CSS.highlights !== 'undefined';
    highlightSelectionText([block], 1, 1, 'hello…', null, onFallback);
    if (!hasHighlightAPI) {
      expect(onFallback).toHaveBeenCalledWith(1);
    }
  });
});
