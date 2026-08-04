import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { WidgetSlot } from '../../src/client/components/WidgetSlot.tsx';
import type { WidgetId } from '../../src/client/lib/widgets.ts';

function renderStub(id: WidgetId) {
  return <div data-testid={`stub-${id}`}>{id}</div>;
}

describe('WidgetSlot', () => {
  test('積んだ順にウィジェットを描画する', () => {
    render(
      <WidgetSlot
        side="left"
        widgets={['tabs', 'explorer']}
        render={renderStub}
      />,
    );
    const slot = screen.getByTestId('widget-slot-left');
    const rendered = Array.from(slot.querySelectorAll('[data-widget]')).map(
      (el) => el.getAttribute('data-widget'),
    );
    expect(rendered).toEqual(['tabs', 'explorer']);
  });

  test('render が null を返したウィジェットは枠に出さない', () => {
    render(
      <WidgetSlot
        side="left"
        widgets={['tabs', 'explorer']}
        render={(id) => (id === 'tabs' ? null : renderStub(id))}
      />,
    );
    expect(screen.queryByTestId('stub-tabs')).not.toBeInTheDocument();
    expect(screen.getByTestId('stub-explorer')).toBeInTheDocument();
  });

  test('中身が 1 つも無ければ枠ごと描画しない', () => {
    render(
      <WidgetSlot side="right" widgets={['outline']} render={() => null} />,
    );
    expect(screen.queryByTestId('widget-slot-right')).not.toBeInTheDocument();
  });

  test('置くウィジェットが無ければ枠ごと描画しない', () => {
    render(<WidgetSlot side="right" widgets={[]} render={renderStub} />);
    expect(screen.queryByTestId('widget-slot-right')).not.toBeInTheDocument();
  });

  test('枠がどちら側かを data-side に出す', () => {
    render(
      <WidgetSlot side="right" widgets={['outline']} render={renderStub} />,
    );
    expect(screen.getByTestId('widget-slot-right')).toHaveAttribute(
      'data-side',
      'right',
    );
  });

  test('縦幅を分け合うかを data-grows に出す（タブは内容なりの高さ）', () => {
    render(
      <WidgetSlot
        side="left"
        widgets={['tabs', 'explorer']}
        render={renderStub}
      />,
    );
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
});
