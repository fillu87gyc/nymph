import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { WidgetSlot } from '../../src/client/components/WidgetSlot.tsx';
import {
  DEFAULT_SLOT_WIDTHS,
  MIN_SLOT_WIDTH,
  SLOT_WIDTH_STEP,
} from '../../src/client/lib/slotWidth.ts';
import type { SlotId, WidgetId } from '../../src/client/lib/widgets.ts';

function renderStub(id: WidgetId) {
  return <div data-testid={`stub-${id}`}>{id}</div>;
}

/** 幅まわりの props は既定値で埋め、テストごとに必要なものだけ差し替える。 */
function renderSlot(props: {
  side: SlotId;
  widgets: WidgetId[];
  width?: number;
  render?: (id: WidgetId) => React.ReactNode;
  onWidthChange?: (side: SlotId, width: number) => void;
  onWidthCommit?: (side: SlotId, width: number) => void;
}) {
  const { side, widgets, width, render: renderFn, ...rest } = props;
  return render(
    <WidgetSlot
      side={side}
      widgets={widgets}
      width={width ?? DEFAULT_SLOT_WIDTHS[side]}
      render={renderFn ?? renderStub}
      onWidthChange={rest.onWidthChange ?? (() => {})}
      onWidthCommit={rest.onWidthCommit ?? (() => {})}
    />,
  );
}

describe('WidgetSlot', () => {
  test('積んだ順にウィジェットを描画する', () => {
    renderSlot({ side: 'left', widgets: ['tabs', 'explorer'] });
    const slot = screen.getByTestId('widget-slot-left');
    const rendered = Array.from(slot.querySelectorAll('[data-widget]')).map(
      (el) => el.getAttribute('data-widget'),
    );
    expect(rendered).toEqual(['tabs', 'explorer']);
  });

  test('render が null を返したウィジェットは枠に出さない', () => {
    renderSlot({
      side: 'left',
      widgets: ['tabs', 'explorer'],
      render: (id) => (id === 'tabs' ? null : renderStub(id)),
    });
    expect(screen.queryByTestId('stub-tabs')).not.toBeInTheDocument();
    expect(screen.getByTestId('stub-explorer')).toBeInTheDocument();
  });

  test('中身が 1 つも無ければ枠ごと描画しない', () => {
    renderSlot({ side: 'right', widgets: ['outline'], render: () => null });
    expect(screen.queryByTestId('widget-slot-right')).not.toBeInTheDocument();
  });

  test('置くウィジェットが無ければ枠ごと描画しない', () => {
    renderSlot({ side: 'right', widgets: [] });
    expect(screen.queryByTestId('widget-slot-right')).not.toBeInTheDocument();
  });

  test('枠がどちら側かを data-side に出す', () => {
    renderSlot({ side: 'right', widgets: ['outline'] });
    expect(screen.getByTestId('widget-slot-right')).toHaveAttribute(
      'data-side',
      'right',
    );
  });

  test('縦幅を分け合うかを data-grows に出す（タブは内容なりの高さ）', () => {
    renderSlot({ side: 'left', widgets: ['tabs', 'explorer'] });
    const slot = screen.getByTestId('widget-slot-left');
    expect(
      slot.querySelector('[data-widget="tabs"]')?.getAttribute('data-grows'),
    ).toBe('false');
    expect(
      slot
        .querySelector('[data-widget="explorer"]')
        ?.getAttribute('data-grows'),
    ).toBe('true');
  });

  test('渡された幅をそのまま枠の幅にする', () => {
    renderSlot({ side: 'left', widgets: ['explorer'], width: 320 });
    expect(screen.getByTestId('widget-slot-left')).toHaveStyle({
      width: '320px',
    });
  });
});

describe('WidgetSlot の幅リサイズ', () => {
  test('中身のある枠にはリサイズハンドルが付く', () => {
    renderSlot({ side: 'left', widgets: ['explorer'] });
    const handle = screen.getByTestId('widget-slot-resizer-left');
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute(
      'aria-valuenow',
      String(DEFAULT_SLOT_WIDTHS.left),
    );
  });

  test('左枠は右へドラッグすると広がり、離したときに確定する', () => {
    const onWidthChange = vi.fn();
    const onWidthCommit = vi.fn();
    renderSlot({
      side: 'left',
      widgets: ['explorer'],
      width: 240,
      onWidthChange,
      onWidthCommit,
    });
    const handle = screen.getByTestId('widget-slot-resizer-left');

    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    fireEvent.pointerMove(handle, { clientX: 300 });
    expect(onWidthChange).toHaveBeenLastCalledWith('left', 300);
    // ドラッグ中は保存しない
    expect(onWidthCommit).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, { clientX: 300 });
    expect(onWidthCommit).toHaveBeenCalledWith('left', 300);
  });

  test('右枠は右へドラッグすると狭まる', () => {
    const onWidthChange = vi.fn();
    renderSlot({
      side: 'right',
      widgets: ['outline'],
      width: 220,
      onWidthChange,
    });
    const handle = screen.getByTestId('widget-slot-resizer-right');

    fireEvent.pointerDown(handle, { button: 0, clientX: 800 });
    fireEvent.pointerMove(handle, { clientX: 840 });
    expect(onWidthChange).toHaveBeenLastCalledWith('right', 180);
  });

  test('ドラッグしていないときの pointermove は無視する', () => {
    const onWidthChange = vi.fn();
    renderSlot({
      side: 'left',
      widgets: ['explorer'],
      width: 240,
      onWidthChange,
    });
    fireEvent.pointerMove(screen.getByTestId('widget-slot-resizer-left'), {
      clientX: 400,
    });
    expect(onWidthChange).not.toHaveBeenCalled();
  });

  test('下限を下回るドラッグは下限で止まる', () => {
    const onWidthChange = vi.fn();
    renderSlot({
      side: 'left',
      widgets: ['explorer'],
      width: 240,
      onWidthChange,
    });
    const handle = screen.getByTestId('widget-slot-resizer-left');
    fireEvent.pointerDown(handle, { button: 0, clientX: 240 });
    fireEvent.pointerMove(handle, { clientX: -500 });
    expect(onWidthChange).toHaveBeenLastCalledWith('left', MIN_SLOT_WIDTH);
  });

  test('左右キーは 1 打鍵ごとに幅を変えて確定する', () => {
    const onWidthCommit = vi.fn();
    renderSlot({
      side: 'left',
      widgets: ['explorer'],
      width: 240,
      onWidthCommit,
    });
    const handle = screen.getByTestId('widget-slot-resizer-left');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onWidthCommit).toHaveBeenLastCalledWith(
      'left',
      240 + SLOT_WIDTH_STEP,
    );
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onWidthCommit).toHaveBeenLastCalledWith(
      'left',
      240 - SLOT_WIDTH_STEP,
    );
  });

  test('ダブルクリックと Home キーで既定幅に戻す', () => {
    const onWidthCommit = vi.fn();
    renderSlot({
      side: 'right',
      widgets: ['outline'],
      width: 400,
      onWidthCommit,
    });
    const handle = screen.getByTestId('widget-slot-resizer-right');

    fireEvent.doubleClick(handle);
    expect(onWidthCommit).toHaveBeenLastCalledWith(
      'right',
      DEFAULT_SLOT_WIDTHS.right,
    );

    onWidthCommit.mockClear();
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onWidthCommit).toHaveBeenLastCalledWith(
      'right',
      DEFAULT_SLOT_WIDTHS.right,
    );
  });
});
