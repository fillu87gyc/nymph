import { beforeEach, describe, expect, it } from 'vitest';
import {
  availableWidgets,
  DEFAULT_WIDGET_LAYOUT,
  loadWidgetLayout,
  moveWidget,
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

  it('枠から出せない widget は既定位置ラベルを持たない', () => {
    for (const id of WIDGET_IDS) {
      const meta = WIDGET_META[id];
      if (meta.required) expect(meta.defaultLabel).toBeNull();
    }
  });

  it('エクスプローラーとアウトラインは枠から出せない', () => {
    expect(WIDGET_META.explorer.required).toBe(true);
    expect(WIDGET_META.outline.required).toBe(true);
  });

  it('タブとコメントは枠から出すと既定位置に出る', () => {
    expect(WIDGET_META.tabs.required).toBe(false);
    expect(WIDGET_META.tabs.defaultLabel).not.toBeNull();
    expect(WIDGET_META.comments.required).toBe(false);
    expect(WIDGET_META.comments.defaultLabel).not.toBeNull();
  });

  it('第2弾のウィジェットは既定位置を持たず、枠から出すこともできる', () => {
    for (const id of ['search', 'minimap', 'tasks', 'stats'] as const) {
      expect(WIDGET_META[id].required).toBe(false);
      expect(WIDGET_META[id].defaultLabel).toBeNull();
    }
  });

  it('すべての widget に配置画面用の説明がある', () => {
    for (const id of WIDGET_IDS) expect(WIDGET_META[id].hint).not.toBe('');
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

  it('枠から出せない widget は枠の外へ戻せない（配置を変えない）', () => {
    const next = placeWidget(DEFAULT_WIDGET_LAYOUT, 'outline', null);
    expect(next).toEqual(DEFAULT_WIDGET_LAYOUT);
  });

  it('第2弾の widget は枠から出せる（＝画面から消える）', () => {
    const placed = placeWidget(DEFAULT_WIDGET_LAYOUT, 'tasks', 'right');
    expect(placed.right).toEqual(['outline', 'tasks']);
    const back = placeWidget(placed, 'tasks', null);
    expect(widgetPlacement(back, 'tasks')).toBeNull();
    expect(back.right).toEqual(['outline']);
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

describe('moveWidget', () => {
  it('指定した位置に差し込む（先頭）', () => {
    const layout = { left: ['explorer' as const, 'tabs' as const], right: [] };
    const next = moveWidget(layout, 'comments', 'left', 0);
    expect(next.left).toEqual(['comments', 'explorer', 'tabs']);
  });

  it('指定した位置に差し込む（途中）', () => {
    const layout = { left: ['explorer' as const, 'tabs' as const], right: [] };
    const next = moveWidget(layout, 'comments', 'left', 1);
    expect(next.left).toEqual(['explorer', 'comments', 'tabs']);
  });

  it('同じ枠の中で順番を入れ替えられる（下から上へ）', () => {
    const layout = { left: ['explorer' as const, 'tabs' as const], right: [] };
    const next = moveWidget(layout, 'tabs', 'left', 0);
    expect(next.left).toEqual(['tabs', 'explorer']);
  });

  it('同じ枠の中で順番を入れ替えられる（上から下へ）', () => {
    const layout = {
      left: ['tabs' as const, 'explorer' as const, 'comments' as const],
      right: [],
    };
    // index は「自分を抜いた後の配列」での位置なので、末尾は 2
    const next = moveWidget(layout, 'tabs', 'left', 2);
    expect(next.left).toEqual(['explorer', 'comments', 'tabs']);
  });

  it('同じ位置に落としても並びは変わらない', () => {
    const layout = { left: ['explorer' as const, 'tabs' as const], right: [] };
    expect(moveWidget(layout, 'explorer', 'left', 0).left).toEqual([
      'explorer',
      'tabs',
    ]);
  });

  it('別の枠へ移すと元の枠からは外れる', () => {
    const next = moveWidget(DEFAULT_WIDGET_LAYOUT, 'outline', 'left', 0);
    expect(next.left).toEqual(['outline', 'explorer']);
    expect(next.right).toEqual([]);
  });

  it('範囲外の index は端に丸める', () => {
    const layout = { left: ['explorer' as const], right: [] };
    expect(moveWidget(layout, 'tabs', 'left', 99).left).toEqual([
      'explorer',
      'tabs',
    ]);
    expect(moveWidget(layout, 'tabs', 'left', -3).left).toEqual([
      'tabs',
      'explorer',
    ]);
  });

  it('既定位置（null）へ移すとどちらの枠からも外れる', () => {
    const layout = { left: ['explorer' as const, 'tabs' as const], right: [] };
    const next = moveWidget(layout, 'tabs', null, 0);
    expect(widgetPlacement(next, 'tabs')).toBeNull();
    expect(next.left).toEqual(['explorer']);
  });

  it('枠から出せない widget は枠の外へ移せない（配置を変えない）', () => {
    const next = moveWidget(DEFAULT_WIDGET_LAYOUT, 'outline', null, 0);
    expect(next).toEqual(DEFAULT_WIDGET_LAYOUT);
  });

  it('引数の layout を破壊しない', () => {
    const layout: { left: ('tabs' | 'explorer')[]; right: never[] } = {
      left: ['explorer', 'tabs'],
      right: [],
    };
    moveWidget(layout, 'tabs', 'left', 0);
    expect(layout).toEqual({ left: ['explorer', 'tabs'], right: [] });
  });
});

describe('availableWidgets', () => {
  /** 枠に入れられるすべての widget（＝枠から出せるもの全部）。 */
  const ALL_AVAILABLE = WIDGET_IDS.filter((id) => !WIDGET_META[id].required);

  it('枠に入っていない widget をすべて返す', () => {
    expect(availableWidgets(DEFAULT_WIDGET_LAYOUT)).toEqual(ALL_AVAILABLE);
  });

  it('枠に置いた widget は一覧から消える', () => {
    const layout = placeWidget(DEFAULT_WIDGET_LAYOUT, 'tabs', 'left');
    expect(availableWidgets(layout)).not.toContain('tabs');
    expect(availableWidgets(layout)).toContain('comments');
  });

  it('枠から出せない widget は行き先が無いので現れない', () => {
    // normalize 前提が崩れた（両方とも枠にいない）レイアウトでも出さない
    const broken = { left: [], right: [] };
    expect(availableWidgets(broken)).toEqual(ALL_AVAILABLE);
  });

  it('WIDGET_IDS の順に並ぶ（配置順に依存しない）', () => {
    const layout = placeWidget(
      placeWidget(DEFAULT_WIDGET_LAYOUT, 'comments', 'right'),
      'comments',
      null,
    );
    expect(availableWidgets(layout)).toEqual(ALL_AVAILABLE);
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
      left: ['explorer', 'nonexistent'],
      right: ['outline'],
    });
    expect(out.left).toEqual(['explorer']);
  });

  it('枠に入れた第2弾のウィジェットはそのまま残る', () => {
    const out = normalizeWidgetLayout({
      left: ['explorer', 'minimap'],
      right: ['outline', 'tasks'],
    });
    expect(out.left).toEqual(['explorer', 'minimap']);
    expect(out.right).toEqual(['outline', 'tasks']);
  });

  it('枠に入っていない第2弾のウィジェットは補完しない（画面に出ない）', () => {
    const out = normalizeWidgetLayout({
      left: ['explorer'],
      right: ['outline'],
    });
    expect(widgetPlacement(out, 'minimap')).toBeNull();
    expect(widgetPlacement(out, 'stats')).toBeNull();
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
