import { describe, expect, test } from 'vitest';
import { isStale, parseTtl } from '../../../src/dict/cache.ts';
import type { DictFile } from '../../../src/dict/schema.ts';

describe('parseTtl', () => {
  test('"24h" → 86400000', () => expect(parseTtl('24h')).toBe(86400000));
  test('"1h" → 3600000', () => expect(parseTtl('1h')).toBe(3600000));
  test('"30m" → 1800000', () => expect(parseTtl('30m')).toBe(1800000));
  test('不正形式 → デフォルト 86400000', () =>
    expect(parseTtl('invalid')).toBe(86400000));
  test('"0h" → デフォルト 86400000（ゼロ値はデフォルトにフォールバック）', () =>
    expect(parseTtl('0h')).toBe(86400000));
  test('"0m" → デフォルト 86400000', () =>
    expect(parseTtl('0m')).toBe(86400000));
});

describe('isStale', () => {
  const fresh: DictFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
  const old23h: DictFile = {
    version: 1,
    updatedAt: new Date(Date.now() - 23 * 3600 * 1000).toISOString(),
    entries: [],
  };
  const old25h: DictFile = {
    version: 1,
    updatedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    entries: [],
  };

  test('fresh → false', () =>
    expect(isStale(fresh, { ttl: '24h' })).toBe(false));
  test('23h 前 → false (TTL=24h)', () =>
    expect(isStale(old23h, { ttl: '24h' })).toBe(false));
  test('25h 前 → true (TTL=24h)', () =>
    expect(isStale(old25h, { ttl: '24h' })).toBe(true));
  test('updatedAt 空文字 → true', () =>
    expect(isStale({ ...fresh, updatedAt: '' }, {})).toBe(true));
  test('updatedAt が不正な日付文字列 → true（NaN を stale 扱い）', () =>
    expect(isStale({ ...fresh, updatedAt: 'not-a-date' }, {})).toBe(true));
  test('TTL 省略時は 24h 扱い', () => expect(isStale(old25h, {})).toBe(true));
});
