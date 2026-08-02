import { beforeEach, describe, expect, test } from 'vitest';
import {
  applyLigatures,
  LIGATURES_STORAGE_KEY,
  loadLigatures,
  saveLigatures,
} from '../../src/client/lib/ligatures.ts';

function cssVar(): string {
  return document.documentElement.style.getPropertyValue('--ligatures');
}

describe('リガチャ設定の永続化', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--ligatures');
  });

  test('未保存なら有効（現行の見た目が既定）', () => {
    expect(loadLigatures()).toBe(true);
  });

  test('無効を保存すると無効として復元される', () => {
    saveLigatures(false);
    expect(localStorage.getItem(LIGATURES_STORAGE_KEY)).toBe('off');
    expect(loadLigatures()).toBe(false);
  });

  test('有効を保存すると有効として復元される', () => {
    saveLigatures(false);
    saveLigatures(true);
    expect(localStorage.getItem(LIGATURES_STORAGE_KEY)).toBe('on');
    expect(loadLigatures()).toBe(true);
  });

  test('壊れた値が入っていても既定値へフォールバックする', () => {
    localStorage.setItem(LIGATURES_STORAGE_KEY, 'yes');
    expect(loadLigatures()).toBe(true);
  });
});

describe('applyLigatures', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty('--ligatures');
  });

  test('有効なら font-variant-ligatures の既定値（normal）を流す', () => {
    applyLigatures(true);
    expect(cssVar()).toBe('normal');
  });

  test('無効なら none を流す', () => {
    applyLigatures(false);
    expect(cssVar()).toBe('none');
  });

  test('切り替えのたびに現在値へ上書きされる', () => {
    applyLigatures(false);
    applyLigatures(true);
    expect(cssVar()).toBe('normal');
  });
});
