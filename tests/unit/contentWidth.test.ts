import { beforeEach, describe, expect, test } from 'vitest';
import {
  contentDragFactor,
  contentMaxWidth,
  loadContentWidth,
  loadMarginCollapse,
  MIN_CONTENT_WIDTH,
  nextContentWidth,
  resizeHandleSides,
  resolveContentMax,
  resolveContentWidthPx,
  saveContentWidth,
  saveMarginCollapse,
} from '../../src/client/lib/contentWidth.ts';

describe('contentMaxWidth', () => {
  test('左右とも展開時はデフォルト幅', () => {
    expect(contentMaxWidth({ left: false, right: false })).toBe('960px');
  });

  test('左のみ折りたたみ時は拡張幅', () => {
    expect(contentMaxWidth({ left: true, right: false })).toBe('1280px');
  });

  test('右のみ折りたたみ時は拡張幅', () => {
    expect(contentMaxWidth({ left: false, right: true })).toBe('1280px');
  });

  test('左右とも折りたたみ時は最大幅', () => {
    expect(contentMaxWidth({ left: true, right: true })).toBe('1600px');
  });
});

describe('loadMarginCollapse / saveMarginCollapse', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('未保存時は両方 false', () => {
    expect(loadMarginCollapse()).toEqual({ left: false, right: false });
  });

  test('保存した状態が復元される', () => {
    saveMarginCollapse({ left: true, right: false });
    expect(loadMarginCollapse()).toEqual({ left: true, right: false });
  });
});

describe('loadContentWidth / saveContentWidth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('未保存時は null（プリセットに従う）', () => {
    expect(loadContentWidth()).toBeNull();
  });

  test('保存した幅が復元される', () => {
    saveContentWidth(1234);
    expect(loadContentWidth()).toBe(1234);
  });

  test('小数は丸めて保存される', () => {
    saveContentWidth(1234.6);
    expect(loadContentWidth()).toBe(1235);
  });

  test('null を保存すると手動幅が破棄される', () => {
    saveContentWidth(1234);
    saveContentWidth(null);
    expect(loadContentWidth()).toBeNull();
  });

  test('壊れた値・下限未満の値は無視して null を返す', () => {
    localStorage.setItem('nymph-content-width', 'not-a-number');
    expect(loadContentWidth()).toBeNull();
    localStorage.setItem('nymph-content-width', String(MIN_CONTENT_WIDTH - 1));
    expect(loadContentWidth()).toBeNull();
  });
});

describe('resolveContentWidthPx / resolveContentMax', () => {
  const expanded = { left: false, right: false };

  test('手動幅がなければプリセット幅', () => {
    expect(resolveContentWidthPx(expanded, null)).toBe(960);
    expect(resolveContentMax(expanded, null)).toBe('960px');
    expect(resolveContentMax({ left: true, right: true }, null)).toBe('1600px');
  });

  test('手動幅があればプリセットより優先される', () => {
    expect(resolveContentWidthPx(expanded, 1111)).toBe(1111);
    expect(resolveContentMax({ left: true, right: true }, 700)).toBe('700px');
  });
});

describe('resizeHandleSides', () => {
  test('左右とも展開時は両側にハンドルが出る', () => {
    expect(resizeHandleSides({ left: false, right: false })).toEqual({
      left: true,
      right: true,
    });
  });

  test('折りたたんだ側は本文が端に貼り付くのでハンドルを出さない', () => {
    expect(resizeHandleSides({ left: true, right: false })).toEqual({
      left: false,
      right: true,
    });
    expect(resizeHandleSides({ left: false, right: true })).toEqual({
      left: true,
      right: false,
    });
  });

  test('左右とも折りたたみ時は本文が左に寄るので右だけ出す', () => {
    expect(resizeHandleSides({ left: true, right: true })).toEqual({
      left: false,
      right: true,
    });
  });
});

describe('contentDragFactor', () => {
  test('中央寄せ（両ガター 1fr）のときは対称に動くので倍率 2', () => {
    expect(contentDragFactor({ left: false, right: false })).toBe(2);
  });

  test('片側でも折りたたまれていれば本文が端に固定されるので倍率 1', () => {
    expect(contentDragFactor({ left: true, right: false })).toBe(1);
    expect(contentDragFactor({ left: false, right: true })).toBe(1);
    expect(contentDragFactor({ left: true, right: true })).toBe(1);
  });
});

describe('nextContentWidth', () => {
  const base = { startWidth: 960, factor: 2 as const, maxWidth: 1920 };

  test('右ハンドルを右へ動かすと倍率分だけ広がる', () => {
    expect(nextContentWidth({ ...base, side: 'right', deltaX: 100 })).toBe(
      1160,
    );
  });

  test('右ハンドルを左へ動かすと狭まる', () => {
    expect(nextContentWidth({ ...base, side: 'right', deltaX: -100 })).toBe(
      760,
    );
  });

  test('左ハンドルは向きが反転する', () => {
    expect(nextContentWidth({ ...base, side: 'left', deltaX: -100 })).toBe(
      1160,
    );
    expect(nextContentWidth({ ...base, side: 'left', deltaX: 100 })).toBe(760);
  });

  test('倍率 1（端に固定）ではカーソルと 1:1 で動く', () => {
    expect(
      nextContentWidth({ ...base, factor: 1, side: 'right', deltaX: 100 }),
    ).toBe(1060);
  });

  test('コンテナ幅を超えない', () => {
    expect(nextContentWidth({ ...base, side: 'right', deltaX: 5000 })).toBe(
      1920,
    );
  });

  test('下限（MIN_CONTENT_WIDTH）を下回らない', () => {
    expect(nextContentWidth({ ...base, side: 'right', deltaX: -5000 })).toBe(
      MIN_CONTENT_WIDTH,
    );
  });

  test('コンテナが下限より狭くても下限は保たれる', () => {
    expect(
      nextContentWidth({
        startWidth: 500,
        factor: 1,
        maxWidth: 200,
        side: 'right',
        deltaX: 0,
      }),
    ).toBe(MIN_CONTENT_WIDTH);
  });

  test('整数に丸めて返す', () => {
    expect(
      nextContentWidth({
        ...base,
        factor: 1,
        side: 'right',
        deltaX: 10.4,
      }),
    ).toBe(970);
  });
});
