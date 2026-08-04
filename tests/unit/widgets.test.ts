import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_WIDGET_LAYOUT,
  loadWidgetLayout,
  normalizeWidgetLayout,
  placeWidget,
  saveWidgetLayout,
  WIDGET_IDS,
  WIDGET_LAYOUT_STORAGE_KEY,
  WIDGET_META,
  widgetPlacement,
} from '../../src/client/lib/widgets.ts';

describe('WIDGET_META', () => {
  it('すべての widget id にメタ情報がある', () => {
    for (const id of WIDGET_IDS) {
      expect(WIDGET_META[id]).toBeDefined();
      expect(WIDGET_META[id].label).not.toBe('');
    }
  });

  it('スロット外に置けない widget は既定位置ラベルを持たない', () => {
    for (const id of WIDGET_IDS) {
      const meta = WIDGET_META[id];
      if (meta.slotOnly) expect(meta.defaultLabel).toBeNull();
      else expect(meta.defaultLabel).not.toBeNull();
    }
  });

  it('エクスプローラーとアウトラインはスロット専用、タブとコメントは既定位置を持つ', () => {
    expect(WIDGET_META.explorer.slotOnly).toBe(true);
    expect(WIDGET_META.outline.slotOnly).toBe(true);
    expect(WIDGET_META.tabs.slotOnly).toBe(false);
    expect(WIDGET_META.comments.slotOnly).toBe(false);
  });
});

describe('DEFAULT_WIDGET_LAYOUT', () => {
  it('従来の見た目（左＝エクスプローラー / 右＝アウトライン）を既定にする', () => {
    expect(DEFAULT_WIDGET_LAYOUT).toEqual({
      left: ['explorer'],
      right: ['outline'],
    });
  });

  it('タブとコメントは既定ではスロットに入っていない', () => {
    expect(widgetPlacement(DEFAULT_WIDGET_LAYOUT, 'tabs')).toBeNull();
    expect(widgetPlacement(DEFAULT_WIDGET_LAYOUT, 'comments')).toBeNull();
  });
});

describe('widgetPlacement', () => {
  it('置かれているスロットを返す', () => {
    const layout = { left: ['tabs' as const, 'explorer' as const], right: [] };
    expect(widgetPlacement(layout, 'tabs')).toBe('left');
    expect(widgetPlacement(layout, 'explorer')).toBe('left');
  });

  it('どちらのスロットにも無ければ null（＝既定位置）', () => {
    expect(widgetPlacement({ left: [], right: [] }, 'comments')).toBeNull();
  });
});

describe('placeWidget', () => {
  it('別のスロットへ移すと元のスロットからは外れる', () => {
    const next = placeWidget(DEFAULT_WIDGET_LAYOUT, 'outline', 'left');
    expect(next.left).toEqual(['explorer', 'outline']);
    expect(next.right).toEqual([]);
  });

  it('スロットの末尾に追加される（積む順が配置順になる）', () => {
    const next = placeWidget(DEFAULT_WIDGET_LAYOUT, 'tabs', 'left');
    expect(next.left).toEqual(['explorer', 'tabs']);
  });

  it('同じスロットへ置き直しても重複しない', () => {
    const next = placeWidget(DEFAULT_WIDGET_LAYOUT, 'explorer', 'left');
    expect(next.left).toEqual(['explorer']);
  });

  it('既定位置（null）に戻すとどちらのスロットからも外れる', () => {
    const placed = placeWidget(DEFAULT_WIDGET_LAYOUT, 'comments', 'right');
    expect(widgetPlacement(placed, 'comments')).toBe('right');
    const back = placeWidget(placed, 'comments', null);
    expect(widgetPlacement(back, 'comments')).toBeNull();
    expect(back.right).toEqual(['outline']);
  });

  it('スロット専用 widget は既定位置に戻せない（配置を変えない）', () => {
    const next = placeWidget(DEFAULT_WIDGET_LAYOUT, 'outline', null);
    expect(next).toEqual(DEFAULT_WIDGET_LAYOUT);
  });

  it('引数の layout を破壊しない', () => {
    const layout: { left: ('tabs' | 'explorer')[]; right: never[] } = {
      left: ['explorer'],
      right: [],
    };
    placeWidget(layout, 'explorer', 'right');
    expect(layout).toEqual({ left: ['explorer'], right: [] });
  });
});

describe('normalizeWidgetLayout', () => {
  it('object でない値は既定レイアウトになる', () => {
    expect(normalizeWidgetLayout(null)).toEqual(DEFAULT_WIDGET_LAYOUT);
    expect(normalizeWidgetLayout('left')).toEqual(DEFAULT_WIDGET_LAYOUT);
    expect(normalizeWidgetLayout(undefined)).toEqual(DEFAULT_WIDGET_LAYOUT);
  });

  it('未知の widget id を捨てる', () => {
    const out = normalizeWidgetLayout({
      left: ['explorer', 'minimap'],
      right: ['outline'],
    });
    expect(out.left).toEqual(['explorer']);
  });

  it('両方のスロットに現れた widget は左を優先して重複を解消する', () => {
    const out = normalizeWidgetLayout({
      left: ['explorer', 'outline'],
      right: ['outline'],
    });
    expect(out.left).toEqual(['explorer', 'outline']);
    expect(out.right).toEqual([]);
  });

  it('同じスロット内の重複も 1 つにまとめる', () => {
    const out = normalizeWidgetLayout({ left: ['explorer', 'explorer'] });
    expect(out.left).toEqual(['explorer']);
  });

  it('欠けているスロット専用 widget を既定のスロットへ補完する', () => {
    const out = normalizeWidgetLayout({ left: ['tabs'], right: [] });
    expect(out.left).toContain('explorer');
    expect(out.right).toContain('outline');
    // 補完は末尾に足すので、保存済みの並びは崩さない
    expect(out.left).toEqual(['tabs', 'explorer']);
  });

  it('スロットが配列でなければ空扱いにする', () => {
    const out = normalizeWidgetLayout({ left: 'explorer', right: 3 });
    expect(out).toEqual(DEFAULT_WIDGET_LAYOUT);
  });

  it('タブとコメントは欠けていても補完しない（既定位置のまま）', () => {
    const out = normalizeWidgetLayout({
      left: ['explorer'],
      right: ['outline'],
    });
    expect(widgetPlacement(out, 'tabs')).toBeNull();
    expect(widgetPlacement(out, 'comments')).toBeNull();
  });
});

describe('loadWidgetLayout / saveWidgetLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('未保存なら既定レイアウトを返す', () => {
    expect(loadWidgetLayout()).toEqual(DEFAULT_WIDGET_LAYOUT);
  });

  it('保存した配置を読み戻せる', () => {
    const layout = placeWidget(DEFAULT_WIDGET_LAYOUT, 'tabs', 'left');
    saveWidgetLayout(layout);
    expect(loadWidgetLayout()).toEqual(layout);
  });

  it('壊れた JSON は既定レイアウトに落ちる', () => {
    localStorage.setItem(WIDGET_LAYOUT_STORAGE_KEY, '{oops');
    expect(loadWidgetLayout()).toEqual(DEFAULT_WIDGET_LAYOUT);
  });

  it('読み込み時にも正規化する', () => {
    localStorage.setItem(
      WIDGET_LAYOUT_STORAGE_KEY,
      JSON.stringify({ left: ['tabs', 'bogus'], right: [] }),
    );
    const out = loadWidgetLayout();
    expect(out.left).toEqual(['tabs', 'explorer']);
    expect(out.right).toEqual(['outline']);
  });
});
