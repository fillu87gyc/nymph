import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  useEscapeDismiss,
  useOutsideDismiss,
} from '../../src/client/hooks/useDismiss.ts';

function mountBox(): HTMLDivElement {
  const box = document.createElement('div');
  const inner = document.createElement('span');
  box.appendChild(inner);
  document.body.appendChild(box);
  return box;
}

function mouseDown(target: Node) {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

function keyDown(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useOutsideDismiss', () => {
  test('外側の mousedown で onDismiss を呼ぶ', () => {
    const box = mountBox();
    const ref = createRef<HTMLElement>();
    Object.assign(ref, { current: box });
    const onDismiss = vi.fn();

    renderHook(() => useOutsideDismiss(ref, onDismiss));
    mouseDown(document.body);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('ref の内側（子孫を含む）の mousedown では呼ばない', () => {
    const box = mountBox();
    const ref = createRef<HTMLElement>();
    Object.assign(ref, { current: box });
    const onDismiss = vi.fn();

    renderHook(() => useOutsideDismiss(ref, onDismiss));
    mouseDown(box);
    mouseDown(box.firstChild as Node);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('enabled=false の間は購読しない', () => {
    const ref = createRef<HTMLElement>();
    const onDismiss = vi.fn();

    renderHook(() => useOutsideDismiss(ref, onDismiss, { enabled: false }));
    mouseDown(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('ignore が true を返した mousedown は無視する', () => {
    const ref = createRef<HTMLElement>();
    const onDismiss = vi.fn();

    renderHook(() => useOutsideDismiss(ref, onDismiss, { ignore: () => true }));
    mouseDown(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('インラインのコールバックを渡しても購読し直さず、最新の関数が呼ばれる', () => {
    const ref = createRef<HTMLElement>();
    const first = vi.fn();
    const second = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');

    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useOutsideDismiss(ref, () => cb()),
      { initialProps: { cb: first } },
    );
    const subscriptions = addSpy.mock.calls.filter(
      ([type]) => type === 'mousedown',
    ).length;

    rerender({ cb: second });
    mouseDown(document.body);

    expect(
      addSpy.mock.calls.filter(([type]) => type === 'mousedown').length,
    ).toBe(subscriptions);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });

  test('アンマウントで購読を解除する', () => {
    const ref = createRef<HTMLElement>();
    const onDismiss = vi.fn();

    const { unmount } = renderHook(() => useOutsideDismiss(ref, onDismiss));
    unmount();
    mouseDown(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('useEscapeDismiss', () => {
  test('Escape で onDismiss を呼ぶ', () => {
    const onDismiss = vi.fn();
    renderHook(() => useEscapeDismiss(onDismiss));

    keyDown('Escape');

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('Escape 以外のキーでは呼ばない', () => {
    const onDismiss = vi.fn();
    renderHook(() => useEscapeDismiss(onDismiss));

    keyDown('Enter');

    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('enabled=false の間は購読しない', () => {
    const onDismiss = vi.fn();
    renderHook(() => useEscapeDismiss(onDismiss, false));

    keyDown('Escape');

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
