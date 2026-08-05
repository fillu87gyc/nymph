import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { WidgetArrangeScreen } from '../../src/client/components/WidgetArrangeScreen.tsx';
import {
  DEFAULT_WIDGET_LAYOUT,
  moveWidget,
  WIDGET_IDS,
  WIDGET_META,
  type WidgetLayout,
} from '../../src/client/lib/widgets.ts';

function makeProps(
  overrides: Partial<React.ComponentProps<typeof WidgetArrangeScreen>> = {},
): React.ComponentProps<typeof WidgetArrangeScreen> {
  return {
    layout: DEFAULT_WIDGET_LAYOUT,
    onMove: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

/** 列に並んでいるウィジェットを上から順に返す。 */
function chipsIn(col: 'available' | 'left' | 'right'): string[] {
  return within(screen.getByTestId(`widget-arrange-list-${col}`))
    .queryAllByRole('button')
    .map((el) => el.getAttribute('data-widget') ?? '');
}

/**
 * HTML5 ドラッグ＆ドロップを再現する。jsdom は DataTransfer を実装しないので、
 * 実装が使う API（setData / effectAllowed / dropEffect）だけ持つ器を渡す。
 */
function dragTo(chipTestId: string, dropTestId: string) {
  const dataTransfer = {
    setData: vi.fn(),
    getData: vi.fn(),
    effectAllowed: '',
    dropEffect: '',
  };
  fireEvent.dragStart(screen.getByTestId(chipTestId), { dataTransfer });
  const target = screen.getByTestId(dropTestId);
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

describe('WidgetArrangeScreen', () => {
  test('利用可能・左・右の 3 列に現在の配置が並ぶ', () => {
    render(<WidgetArrangeScreen {...makeProps()} />);
    // 既定は 左＝エクスプローラー / 右＝アウトライン。
    // 残りは（既定位置を持つタブ・コメントも、枠でしか出ないものも）利用可能に並ぶ
    expect(chipsIn('left')).toEqual(['explorer']);
    expect(chipsIn('right')).toEqual(['outline']);
    expect(chipsIn('available')).toEqual(
      WIDGET_IDS.filter((id) => !WIDGET_META[id].required),
    );
  });

  test('利用可能のチップは既定位置か、何が出るのかを添える', () => {
    render(<WidgetArrangeScreen {...makeProps()} />);
    // 既定位置を持つものはその位置、持たないものは中身の説明
    expect(screen.getByTestId('widget-chip-tabs')).toHaveTextContent('横行');
    expect(screen.getByTestId('widget-chip-minimap')).toHaveTextContent(
      WIDGET_META.minimap.hint,
    );
  });

  test('空の枠にはドラッグ先の案内が出る', () => {
    render(
      <WidgetArrangeScreen
        {...makeProps({ layout: { left: ['explorer', 'outline'], right: [] } })}
      />,
    );
    expect(screen.getByTestId('widget-empty-right')).toBeInTheDocument();
  });

  describe('ドラッグ＆ドロップ', () => {
    test('利用可能から枠へドロップすると onMove が呼ばれる', () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      // 左枠の先頭（エクスプローラーの上）へ落とす
      dragTo('widget-chip-tabs', 'widget-drop-left-0');
      expect(onMove).toHaveBeenCalledWith('tabs', 'left', 0);
    });

    test('枠の末尾のすき間へ落とすと末尾に積まれる', () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      dragTo('widget-chip-tabs', 'widget-drop-left-1');
      expect(onMove).toHaveBeenCalledWith('tabs', 'left', 1);
    });

    test('すき間を外して枠に落とすと末尾に積まれる', () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      dragTo('widget-chip-tabs', 'widget-arrange-list-left');
      expect(onMove).toHaveBeenCalledWith('tabs', 'left', 1);
    });

    test('同じ枠の中で並べ替えられる', () => {
      const onMove = vi.fn();
      const layout: WidgetLayout = {
        left: ['explorer', 'tabs'],
        right: ['outline'],
      };
      render(<WidgetArrangeScreen {...makeProps({ layout, onMove })} />);
      dragTo('widget-chip-tabs', 'widget-drop-left-0');
      expect(onMove).toHaveBeenCalledWith('tabs', 'left', 0);
    });

    test('枠から利用可能へ戻せる', () => {
      const onMove = vi.fn();
      const layout: WidgetLayout = {
        left: ['explorer', 'tabs'],
        right: ['outline'],
      };
      render(<WidgetArrangeScreen {...makeProps({ layout, onMove })} />);
      dragTo('widget-chip-tabs', 'widget-arrange-list-available');
      expect(onMove).toHaveBeenCalledWith('tabs', null, 0);
    });

    test('既定位置を持たないウィジェットを戻すと画面から消えると伝える', () => {
      const onMove = vi.fn();
      const layout: WidgetLayout = {
        left: ['explorer', 'minimap'],
        right: ['outline'],
      };
      render(<WidgetArrangeScreen {...makeProps({ layout, onMove })} />);
      dragTo('widget-chip-minimap', 'widget-arrange-list-available');
      expect(onMove).toHaveBeenCalledWith('minimap', null, 0);
      expect(screen.getByTestId('widget-arrange-status')).toHaveTextContent(
        'ミニマップを利用可能に戻しました（画面から消えます）',
      );
    });

    test('枠から出せないウィジェットは利用可能へ落とせない', () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      dragTo('widget-chip-outline', 'widget-arrange-list-available');
      expect(onMove).not.toHaveBeenCalled();
      expect(
        screen.getByTestId('widget-arrange-list-available'),
      ).toHaveAttribute('data-droppable', 'false');
    });

    test('ドラッグ中は落とし先が分かるよう印が付く', () => {
      render(<WidgetArrangeScreen {...makeProps()} />);
      const dataTransfer = {
        setData: vi.fn(),
        getData: vi.fn(),
        effectAllowed: '',
        dropEffect: '',
      };
      fireEvent.dragStart(screen.getByTestId('widget-chip-tabs'), {
        dataTransfer,
      });
      expect(screen.getByTestId('widget-arrange')).toHaveAttribute(
        'data-dragging',
        'true',
      );
      fireEvent.dragOver(screen.getByTestId('widget-drop-left-0'), {
        dataTransfer,
      });
      expect(screen.getByTestId('widget-drop-left-0')).toHaveAttribute(
        'data-active',
        'true',
      );

      fireEvent.dragEnd(screen.getByTestId('widget-chip-tabs'));
      expect(screen.getByTestId('widget-arrange')).toHaveAttribute(
        'data-dragging',
        'false',
      );
      expect(screen.getByTestId('widget-drop-left-0')).toHaveAttribute(
        'data-active',
        'false',
      );
    });

    test('ドラッグしていないのに来たドロップは無視する', () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      fireEvent.drop(screen.getByTestId('widget-drop-left-0'), {
        dataTransfer: { setData: vi.fn(), getData: vi.fn() },
      });
      expect(onMove).not.toHaveBeenCalled();
    });
  });

  describe('キーボード操作', () => {
    test('← → で列を移動する', async () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      screen.getByTestId('widget-chip-tabs').focus();
      await userEvent.keyboard('{ArrowRight}');
      // 利用可能 → 左の枠（末尾＝エクスプローラーの下）
      expect(onMove).toHaveBeenCalledWith('tabs', 'left', 1);
    });

    test('左端より先には行かない', async () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      screen.getByTestId('widget-chip-tabs').focus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(onMove).not.toHaveBeenCalled();
    });

    test('枠から出せないウィジェットは利用可能を飛ばして左右を行き来する', async () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      screen.getByTestId('widget-chip-explorer').focus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(onMove).not.toHaveBeenCalled();
      await userEvent.keyboard('{ArrowRight}');
      expect(onMove).toHaveBeenCalledWith('explorer', 'right', 1);
    });

    test('↑ ↓ で枠の中の順番を入れ替える', async () => {
      const onMove = vi.fn();
      const layout: WidgetLayout = {
        left: ['explorer', 'tabs'],
        right: ['outline'],
      };
      render(<WidgetArrangeScreen {...makeProps({ layout, onMove })} />);
      screen.getByTestId('widget-chip-tabs').focus();
      await userEvent.keyboard('{ArrowUp}');
      expect(onMove).toHaveBeenCalledWith('tabs', 'left', 0);

      onMove.mockClear();
      screen.getByTestId('widget-chip-explorer').focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(onMove).toHaveBeenCalledWith('explorer', 'left', 1);
    });

    test('利用可能の中では ↑ ↓ しても動かない（並び順に意味が無い）', async () => {
      const onMove = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onMove })} />);
      screen.getByTestId('widget-chip-comments').focus();
      await userEvent.keyboard('{ArrowUp}');
      await userEvent.keyboard('{ArrowDown}');
      expect(onMove).not.toHaveBeenCalled();
    });

    test('動かしたあとも同じチップにフォーカスが残る', async () => {
      // 実際に配置が変わるよう、layout を state として持つ薄い親で包む
      function Harness() {
        const [layout, setLayout] = useState<WidgetLayout>(
          DEFAULT_WIDGET_LAYOUT,
        );
        return (
          <WidgetArrangeScreen
            {...makeProps({
              layout,
              onMove: (id, placement, index) =>
                setLayout((prev) => moveWidget(prev, id, placement, index)),
            })}
          />
        );
      }
      render(<Harness />);
      screen.getByTestId('widget-chip-tabs').focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(chipsIn('left')).toEqual(['explorer', 'tabs']);
      expect(screen.getByTestId('widget-chip-tabs')).toHaveFocus();
    });

    test('移動結果を読み上げ用に知らせる', async () => {
      render(<WidgetArrangeScreen {...makeProps()} />);
      screen.getByTestId('widget-chip-tabs').focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(screen.getByTestId('widget-arrange-status')).toHaveTextContent(
        'タブを左の枠の2番目に置きました',
      );
    });
  });

  describe('閉じる / 初期配置にリセット', () => {
    test('✕ で閉じる', async () => {
      const onClose = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onClose })} />);
      await userEvent.click(screen.getByTestId('widget-arrange-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('Escape で閉じる', async () => {
      const onClose = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onClose })} />);
      await userEvent.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('初期配置にリセットすると onReset が呼ばれる', async () => {
      const onReset = vi.fn();
      render(<WidgetArrangeScreen {...makeProps({ onReset })} />);
      await userEvent.click(screen.getByTestId('widget-arrange-reset'));
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('widget-arrange-status')).toHaveTextContent(
        '初期配置にリセットしました',
      );
    });
  });
});
