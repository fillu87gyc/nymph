import { beforeEach, describe, expect, test } from 'vitest';
import {
  clampSlotWidth,
  DEFAULT_SLOT_WIDTHS,
  loadSlotWidths,
  MAX_SLOT_WIDTH,
  MIN_SLOT_WIDTH,
  nextSlotWidth,
  normalizeSlotWidths,
  SLOT_WIDTH_STORAGE_KEY,
  saveSlotWidths,
} from '../../src/client/lib/slotWidth.ts';

describe('clampSlotWidth', () => {
  test('範囲内はそのまま（整数に丸める）', () => {
    expect(clampSlotWidth(300)).toBe(300);
    expect(clampSlotWidth(300.4)).toBe(300);
  });

  test('下限・上限で頭打ちになる', () => {
    expect(clampSlotWidth(0)).toBe(MIN_SLOT_WIDTH);
    expect(clampSlotWidth(9999)).toBe(MAX_SLOT_WIDTH);
  });

  test('数値でない値は下限に落とす', () => {
    expect(clampSlotWidth(Number.NaN)).toBe(MIN_SLOT_WIDTH);
  });
});

describe('nextSlotWidth', () => {
  test('左枠は右へドラッグすると広がる', () => {
    expect(nextSlotWidth({ startWidth: 240, deltaX: 60, side: 'left' })).toBe(
      300,
    );
    expect(nextSlotWidth({ startWidth: 240, deltaX: -60, side: 'left' })).toBe(
      180,
    );
  });

  test('右枠は右へドラッグすると狭まる（掴んだ境界が付いてくる）', () => {
    expect(nextSlotWidth({ startWidth: 220, deltaX: 60, side: 'right' })).toBe(
      160,
    );
    expect(nextSlotWidth({ startWidth: 220, deltaX: -60, side: 'right' })).toBe(
      280,
    );
  });

  test('行き過ぎても下限・上限を超えない', () => {
    expect(
      nextSlotWidth({ startWidth: 240, deltaX: -9999, side: 'left' }),
    ).toBe(MIN_SLOT_WIDTH);
    expect(nextSlotWidth({ startWidth: 240, deltaX: 9999, side: 'left' })).toBe(
      MAX_SLOT_WIDTH,
    );
  });
});

describe('normalizeSlotWidths', () => {
  test('オブジェクトでない値は既定幅', () => {
    expect(normalizeSlotWidths(null)).toEqual(DEFAULT_SLOT_WIDTHS);
    expect(normalizeSlotWidths('240')).toEqual(DEFAULT_SLOT_WIDTHS);
  });

  test('欠けている側だけ既定幅で補う', () => {
    expect(normalizeSlotWidths({ left: 300 })).toEqual({
      left: 300,
      right: DEFAULT_SLOT_WIDTHS.right,
    });
  });

  test('範囲外・数値でない値は捨てるか丸める', () => {
    expect(normalizeSlotWidths({ left: 9999, right: 'wide' })).toEqual({
      left: MAX_SLOT_WIDTH,
      right: DEFAULT_SLOT_WIDTHS.right,
    });
  });
});

describe('loadSlotWidths / saveSlotWidths', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('未保存時は既定幅', () => {
    expect(loadSlotWidths()).toEqual(DEFAULT_SLOT_WIDTHS);
  });

  test('保存した幅が復元される', () => {
    saveSlotWidths({ left: 320, right: 180 });
    expect(loadSlotWidths()).toEqual({ left: 320, right: 180 });
  });

  test('壊れた JSON は既定幅に落ちる', () => {
    localStorage.setItem(SLOT_WIDTH_STORAGE_KEY, '{broken');
    expect(loadSlotWidths()).toEqual(DEFAULT_SLOT_WIDTHS);
  });
});
