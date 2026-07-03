import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  parseSettings,
} from '../../src/settings.ts';

describe('parseSettings', () => {
  test('fontSize / contentWidth を指定した YAML をパースする', () => {
    const result = parseSettings('fontSize: 18\ncontentWidth: 960\n');
    expect(result).toEqual({ fontSize: 18, contentWidth: 960 });
  });

  test('空の YAML はデフォルト値になる', () => {
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  test('不正な値（数値以外・0以下）はデフォルト値にフォールバックする', () => {
    expect(parseSettings('fontSize: "large"\ncontentWidth: -10\n')).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  test('片方だけ指定した場合はもう片方がデフォルト値になる', () => {
    expect(parseSettings('fontSize: 20\n')).toEqual({
      fontSize: 20,
      contentWidth: DEFAULT_SETTINGS.contentWidth,
    });
  });
});

describe('loadSettings', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nymph-settings-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('ファイルが存在しない場合はデフォルト値を返す', () => {
    expect(loadSettings(join(dir, 'settings.yml'))).toEqual(DEFAULT_SETTINGS);
  });

  test('ファイルが存在する場合は中身をパースして返す', () => {
    const settingsPath = join(dir, 'settings.yml');
    writeFileSync(settingsPath, 'fontSize: 18\ncontentWidth: 960\n', 'utf-8');
    expect(loadSettings(settingsPath)).toEqual({
      fontSize: 18,
      contentWidth: 960,
    });
  });
});
