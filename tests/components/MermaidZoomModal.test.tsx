import { fireEvent, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MermaidZoomModal } from '../../src/client/components/MermaidZoomModal.tsx';

const HTML = '<svg viewBox="0 0 10 10"></svg>';

function scaleEl(): HTMLElement {
  const el = document.getElementById('mermaid-zoom-scale');
  if (!el) throw new Error('#mermaid-zoom-scale not found');
  return el;
}

describe('MermaidZoomModal', () => {
  test('Ctrl+ホイールで拡大できる', () => {
    render(<MermaidZoomModal open html={HTML} onClose={vi.fn()} />);
    const area = document.getElementById('mermaid-zoom-area');
    if (!area) throw new Error('#mermaid-zoom-area not found');

    fireEvent.wheel(area, { ctrlKey: true, deltaY: -100 });
    expect(scaleEl().style.transform).toBe('scale(1.1)');
  });

  test('閉じた時点でスケールがリセットされ、再オープンの初回描画から原寸になる', () => {
    const { rerender } = render(
      <MermaidZoomModal open html={HTML} onClose={vi.fn()} />,
    );
    const area = document.getElementById('mermaid-zoom-area');
    if (!area) throw new Error('#mermaid-zoom-area not found');
    fireEvent.wheel(area, { ctrlKey: true, deltaY: -100 });
    expect(scaleEl().style.transform).toBe('scale(1.1)');

    // close → reopen。open 時の effect で後からリセットするのではなく、
    // close 時にリセット済みであること（= 再オープンの最初のコミットから
    // scale(1)。前回の拡大率が 1 フレームでも見えるとテストが
    // getComputedStyle を読むタイミング次第でフレークする）
    rerender(<MermaidZoomModal open={false} html={HTML} onClose={vi.fn()} />);
    rerender(<MermaidZoomModal open html={HTML} onClose={vi.fn()} />);
    expect(scaleEl().style.transform).toBe('scale(1)');
  });
});
