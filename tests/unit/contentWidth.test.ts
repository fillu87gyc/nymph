import { beforeEach, describe, expect, test } from 'vitest';
import {
  contentMaxWidth,
  loadMarginCollapse,
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
