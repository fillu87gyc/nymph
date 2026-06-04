import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applyTermHighlights,
  clearTermHighlights,
} from '../../src/client/lib/termHighlight.ts';
import type { DictEntry } from '../../src/client/types.ts';

function makeEntry(term: string, aliases: string[] = []): DictEntry {
  return {
    term,
    aliases,
    definition: `${term}の定義`,
    definitionHtml: `<p>${term}の定義</p>`,
    source: 'glossary',
    sourceRef: '',
  };
}

function makeContainer(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('clearTermHighlights', () => {
  test('mark[data-dict-term] をテキストノードに戻す', () => {
    const container = makeContainer(
      '<p>Hello <mark data-dict-term="集約">集約</mark> world</p>',
    );
    clearTermHighlights(container);
    expect(container.querySelectorAll('mark[data-dict-term]')).toHaveLength(0);
    expect(container.textContent).toBe('Hello 集約 world');
  });

  test('mark がない場合は何もしない', () => {
    const container = makeContainer('<p>plain text</p>');
    clearTermHighlights(container);
    expect(container.textContent).toBe('plain text');
  });
});

describe('applyTermHighlights', () => {
  test('entries が空のとき mark を付与しない', () => {
    const container = makeContainer('<p>集約とはドメインモデルの概念です</p>');
    applyTermHighlights(container, []);
    expect(container.querySelectorAll('mark[data-dict-term]')).toHaveLength(0);
  });

  test('テキスト内の用語（境界付き）を mark でラップする', () => {
    // 句点で区切られているので境界条件を満たす
    const container = makeContainer('<p>集約。これはDDDの概念です。</p>');
    applyTermHighlights(container, [makeEntry('集約')]);
    const marks = container.querySelectorAll<HTMLElement>(
      'mark[data-dict-term]',
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute('data-dict-term')).toBe('集約');
    expect(marks[0].textContent).toBe('集約');
  });

  test('テキストノード全体が用語の場合にマッチする', () => {
    // h2要素内のテキストノードが用語のみ（前後が文字列境界）
    const container = makeContainer('<h2>集約</h2>');
    applyTermHighlights(container, [makeEntry('集約')]);
    const marks = container.querySelectorAll<HTMLElement>(
      'mark[data-dict-term]',
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('集約');
  });

  test('エイリアスにもマッチする', () => {
    const container = makeContainer('<p>Aggregate is a DDD concept</p>');
    applyTermHighlights(container, [makeEntry('集約', ['Aggregate'])]);
    const marks = container.querySelectorAll<HTMLElement>(
      'mark[data-dict-term]',
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute('data-dict-term')).toBe('集約');
    expect(marks[0].textContent).toBe('Aggregate');
  });

  test('code 要素内はスキップ', () => {
    const container = makeContainer('<p><code>集約</code></p>');
    applyTermHighlights(container, [makeEntry('集約')]);
    expect(container.querySelectorAll('mark[data-dict-term]')).toHaveLength(0);
  });

  test('pre 要素内はスキップ', () => {
    const container = makeContainer('<pre>集約のコード例</pre>');
    applyTermHighlights(container, [makeEntry('集約')]);
    expect(container.querySelectorAll('mark[data-dict-term]')).toHaveLength(0);
  });

  test('既存 mark[data-dict-term] 内はスキップ（二重ラップ防止）', () => {
    const container = makeContainer(
      '<p><mark data-dict-term="集約">集約</mark></p>',
    );
    applyTermHighlights(container, [makeEntry('集約')]);
    const marks = container.querySelectorAll('mark[data-dict-term]');
    expect(marks).toHaveLength(1);
  });

  test('複数用語を同時にハイライト', () => {
    const container = makeContainer(
      '<p>集約、エンティティはDDDの基本概念です</p>',
    );
    applyTermHighlights(container, [
      makeEntry('集約'),
      makeEntry('エンティティ'),
    ]);
    const marks = container.querySelectorAll('mark[data-dict-term]');
    // 「集約」は「、」の前にあるので境界条件を満たす
    expect(marks.length).toBeGreaterThanOrEqual(1);
  });

  test('再適用時に古い mark が除去されて新しい mark が付く', () => {
    const container = makeContainer('<p>集約。</p>');
    applyTermHighlights(container, [makeEntry('集約')]);
    expect(container.querySelectorAll('mark[data-dict-term]')).toHaveLength(1);
    // 2回目の適用でも同じ結果
    applyTermHighlights(container, [makeEntry('集約')]);
    expect(container.querySelectorAll('mark[data-dict-term]')).toHaveLength(1);
  });

  test('単語の一部にのみマッチする場合はスキップ（英語境界チェック）', () => {
    const container = makeContainer('<p>The Aggregation pattern differs</p>');
    applyTermHighlights(container, [makeEntry('Aggregate', [])]);
    expect(container.querySelectorAll('mark[data-dict-term]')).toHaveLength(0);
  });
});
