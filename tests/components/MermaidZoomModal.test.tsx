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
    render(<MermaidZoomModal html={HTML} onClose={vi.fn()} />);
    const area = document.getElementById('mermaid-zoom-area');
    if (!area) throw new Error('#mermaid-zoom-area not found');

    fireEvent.wheel(area, { ctrlKey: true, deltaY: -100 });
    expect(scaleEl().style.transform).toBe('scale(1.1)');
  });

  test('開き直すと初回描画から原寸に戻る', () => {
    const { unmount } = render(
      <MermaidZoomModal html={HTML} onClose={vi.fn()} />,
    );
    const area = document.getElementById('mermaid-zoom-area');
    if (!area) throw new Error('#mermaid-zoom-area not found');
    fireEvent.wheel(area, { ctrlKey: true, deltaY: -100 });
    expect(scaleEl().style.transform).toBe('scale(1.1)');

    // 呼び出し側は開いている間だけマウントする。閉じる = アンマウントなので
    // 開き直しは常に scale(1) の初回コミットから始まる（effect で後から
    // リセットしていた頃のように、前回の拡大率が 1 フレーム見えることがない）。
    unmount();
    render(<MermaidZoomModal html={HTML} onClose={vi.fn()} />);
    expect(scaleEl().style.transform).toBe('scale(1)');
  });

  test('Escape で onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(<MermaidZoomModal html={HTML} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
