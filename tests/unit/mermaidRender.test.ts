import { describe, expect, test } from 'vitest';
import {
  MERMAID_RENDERED_ATTR,
  MERMAID_SRC_ATTR,
  markMermaidNodesRendered,
  resetStaleMermaidNodes,
} from '../../src/client/lib/mermaidRender.ts';

/** mermaid.run() 相当：ソースを SVG に置き換えて data-processed を立てる。 */
function fakeRun(container: HTMLElement): void {
  for (const el of container.querySelectorAll<HTMLElement>('.mermaid')) {
    if (el.getAttribute('data-processed')) continue;
    el.setAttribute('data-processed', 'true');
    el.innerHTML = `<svg data-src="${el.textContent}"></svg>`;
  }
}

function makeContainer(sources: string[]): HTMLElement {
  const container = document.createElement('div');
  for (const src of sources) {
    const el = document.createElement('div');
    el.className = 'mermaid';
    el.setAttribute(MERMAID_SRC_ATTR, src);
    el.textContent = src;
    container.appendChild(el);
  }
  return container;
}

describe('resetStaleMermaidNodes', () => {
  test('未描画（data-processed なし）の図は触らない', () => {
    const container = makeContainer(['graph TD; A-->B;']);
    expect(resetStaleMermaidNodes(container, 'dark')).toBe(0);
    expect(container.querySelector('.mermaid')?.textContent).toBe(
      'graph TD; A-->B;',
    );
  });

  test('テーマが変わると描画済みマークを外しソースを書き戻す', () => {
    const container = makeContainer(['graph TD; A-->B;', 'graph LR; C-->D;']);
    fakeRun(container);
    markMermaidNodesRendered(container, 'dark');

    expect(resetStaleMermaidNodes(container, 'default')).toBe(2);
    for (const el of container.querySelectorAll('.mermaid')) {
      expect(el.hasAttribute('data-processed')).toBe(false);
      expect(el.hasAttribute(MERMAID_RENDERED_ATTR)).toBe(false);
      expect(el.querySelector('svg')).toBeNull();
      expect(el.textContent).toBe(el.getAttribute(MERMAID_SRC_ATTR));
    }

    // 描き直せば新しいテーマで描画済みになる
    fakeRun(container);
    markMermaidNodesRendered(container, 'default');
    expect(container.querySelector('.mermaid svg')).not.toBeNull();
    expect(resetStaleMermaidNodes(container, 'default')).toBe(0);
  });

  test('テーマが同じなら描画済みの図は再描画しない', () => {
    const container = makeContainer(['graph TD; A-->B;']);
    fakeRun(container);
    markMermaidNodesRendered(container, 'dark');

    expect(resetStaleMermaidNodes(container, 'dark')).toBe(0);
    expect(container.querySelector('.mermaid svg')).not.toBeNull();
  });

  test('ソースだけが差し替わった図も描き直し対象になる', () => {
    const container = makeContainer(['graph TD; A-->B;']);
    fakeRun(container);
    markMermaidNodesRendered(container, 'dark');

    // React が innerHTML と data-mermaid-src を新しいコードで更新した状態
    const el = container.querySelector<HTMLElement>('.mermaid');
    if (!el) throw new Error('.mermaid not found');
    el.setAttribute(MERMAID_SRC_ATTR, 'graph TD; A-->C;');
    el.textContent = 'graph TD; A-->C;';

    expect(resetStaleMermaidNodes(container, 'dark')).toBe(1);
    expect(el.hasAttribute('data-processed')).toBe(false);
    expect(el.textContent).toBe('graph TD; A-->C;');
  });

  test('テキストの書き戻しは HTML としてパースされない', () => {
    const container = makeContainer(['graph TD; A["<b>x</b> & y"]-->B;']);
    fakeRun(container);
    markMermaidNodesRendered(container, 'dark');

    resetStaleMermaidNodes(container, 'default');
    const el = container.querySelector<HTMLElement>('.mermaid');
    expect(el?.querySelector('b')).toBeNull();
    expect(el?.textContent).toBe('graph TD; A["<b>x</b> & y"]-->B;');
    // mermaid は innerHTML を entityDecode して読むため、エスケープ済みで良い
    expect(el?.innerHTML).toContain('&amp;');
  });
});

describe('markMermaidNodesRendered', () => {
  test('未描画の図には署名を付けない', () => {
    const container = makeContainer(['graph TD; A-->B;']);
    markMermaidNodesRendered(container, 'dark');
    expect(
      container.querySelector('.mermaid')?.hasAttribute(MERMAID_RENDERED_ATTR),
    ).toBe(false);
  });
});
