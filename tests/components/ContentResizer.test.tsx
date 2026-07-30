import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ContentResizer } from '../../src/client/components/ContentResizer.tsx';
import {
  CONTENT_WIDTH_STEP,
  MIN_CONTENT_WIDTH,
} from '../../src/client/lib/contentWidth.ts';

function makeProps(
  overrides: Partial<React.ComponentProps<typeof ContentResizer>> = {},
): React.ComponentProps<typeof ContentResizer> {
  return {
    side: 'right',
    width: 960,
    onResizeStart: vi.fn(),
    onResize: vi.fn(),
    onResizeEnd: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
}

describe('ContentResizer', () => {
  test('side ごとに data-testid が分かれる', () => {
    const { unmount } = render(<ContentResizer {...makeProps()} />);
    expect(screen.getByTestId('content-resizer-right')).toBeInTheDocument();
    unmount();
    render(<ContentResizer {...makeProps({ side: 'left' })} />);
    expect(screen.getByTestId('content-resizer-left')).toBeInTheDocument();
  });

  test('現在の幅を separator の値として公開する', () => {
    render(<ContentResizer {...makeProps({ width: 1234 })} />);
    const handle = screen.getByTestId('content-resizer-right');
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '1234');
    expect(handle).toHaveAttribute('aria-valuemin', String(MIN_CONTENT_WIDTH));
    expect(handle).toHaveAttribute('aria-valuetext', '1234px');
  });

  test('ポインタを押して動かすと開始位置からの移動量が通知される', () => {
    const props = makeProps();
    render(<ContentResizer {...props} />);
    const handle = screen.getByTestId('content-resizer-right');

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    expect(props.onResizeStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(handle, { clientX: 180, pointerId: 1 });
    expect(props.onResize).toHaveBeenLastCalledWith('right', 80);

    fireEvent.pointerMove(handle, { clientX: 60, pointerId: 1 });
    expect(props.onResize).toHaveBeenLastCalledWith('right', -40);

    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(props.onResizeEnd).toHaveBeenCalledTimes(1);
    expect(handle).toHaveAttribute('data-dragging', 'false');
  });

  test('ドラッグ中でなければポインタ移動を無視する', () => {
    const props = makeProps();
    render(<ContentResizer {...props} />);
    fireEvent.pointerMove(screen.getByTestId('content-resizer-right'), {
      clientX: 500,
      pointerId: 1,
    });
    expect(props.onResize).not.toHaveBeenCalled();
  });

  test('左ボタン以外の押下では開始しない', () => {
    const props = makeProps();
    render(<ContentResizer {...props} />);
    fireEvent.pointerDown(screen.getByTestId('content-resizer-right'), {
      button: 2,
      clientX: 100,
      pointerId: 1,
    });
    expect(props.onResizeStart).not.toHaveBeenCalled();
  });

  test('左右キーで 1 ステップずつ変更できる', async () => {
    const props = makeProps({ side: 'left' });
    render(<ContentResizer {...props} />);
    const handle = screen.getByTestId('content-resizer-left');
    handle.focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(props.onResizeStart).toHaveBeenCalledTimes(1);
    expect(props.onResize).toHaveBeenLastCalledWith('left', CONTENT_WIDTH_STEP);
    expect(props.onResizeEnd).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{ArrowLeft}');
    expect(props.onResize).toHaveBeenLastCalledWith(
      'left',
      -CONTENT_WIDTH_STEP,
    );
  });

  test('ダブルクリックと Home キーでリセットされる', async () => {
    const props = makeProps();
    render(<ContentResizer {...props} />);
    const handle = screen.getByTestId('content-resizer-right');

    await userEvent.dblClick(handle);
    expect(props.onReset).toHaveBeenCalledTimes(1);

    handle.focus();
    await userEvent.keyboard('{Home}');
    expect(props.onReset).toHaveBeenCalledTimes(2);
  });
});
