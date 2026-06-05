import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeCommandsHash,
  isCommandHashAccepted,
  saveAcceptedHash,
} from '../../../src/dict/consent.ts';
import type { NaiadYml } from '../../../src/dict/schema.ts';

const TMP_DIR = join(tmpdir(), `naiad-consent-test-${process.pid}`);

// テスト専用の XDG_DATA_HOME に切り替えて本物の ~/.local/share を汚染しない
beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  process.env.XDG_DATA_HOME = TMP_DIR;
});

afterEach(() => {
  delete process.env.XDG_CONFIG_HOME;
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
});

function makeConfig(sources: { name: string; cmd: string[] }[]): NaiadYml {
  return {
    sources: sources.map((s) => ({
      name: s.name,
      fetch: { cmd: s.cmd },
      adapter: 'markdown',
      rules: { term: 'h3', definition: 'term > p' },
    })),
  };
}

describe('computeCommandsHash', () => {
  it('同じ設定なら同じハッシュを返す', () => {
    const config = makeConfig([{ name: 'a', cmd: ['cat', 'file.md'] }]);
    expect(computeCommandsHash(config)).toBe(computeCommandsHash(config));
  });

  it('ソースの順序が異なっても同じハッシュ', () => {
    const c1 = makeConfig([
      { name: 'alpha', cmd: ['cat', 'a.md'] },
      { name: 'beta', cmd: ['cat', 'b.md'] },
    ]);
    const c2 = makeConfig([
      { name: 'beta', cmd: ['cat', 'b.md'] },
      { name: 'alpha', cmd: ['cat', 'a.md'] },
    ]);
    expect(computeCommandsHash(c1)).toBe(computeCommandsHash(c2));
  });

  it('コマンドが変わればハッシュが変わる', () => {
    const c1 = makeConfig([{ name: 'a', cmd: ['cat', 'file.md'] }]);
    const c2 = makeConfig([{ name: 'a', cmd: ['cat', 'other.md'] }]);
    expect(computeCommandsHash(c1)).not.toBe(computeCommandsHash(c2));
  });

  it('ソース名が変わればハッシュが変わる', () => {
    const c1 = makeConfig([{ name: 'source-a', cmd: ['cat', 'x.md'] }]);
    const c2 = makeConfig([{ name: 'source-b', cmd: ['cat', 'x.md'] }]);
    expect(computeCommandsHash(c1)).not.toBe(computeCommandsHash(c2));
  });

  it('ソースが追加されたらハッシュが変わる', () => {
    const c1 = makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]);
    const c2 = makeConfig([
      { name: 'a', cmd: ['cat', 'a.md'] },
      { name: 'b', cmd: ['cat', 'b.md'] },
    ]);
    expect(computeCommandsHash(c1)).not.toBe(computeCommandsHash(c2));
  });

  it('sha256: プレフィックスが付く', () => {
    const config = makeConfig([{ name: 'a', cmd: ['cat', 'file.md'] }]);
    expect(computeCommandsHash(config)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('isCommandHashAccepted / saveAcceptedHash', () => {
  it('未承認のハッシュは false', () => {
    const config = makeConfig([{ name: 'a', cmd: ['cat', 'x.md'] }]);
    expect(isCommandHashAccepted(computeCommandsHash(config))).toBe(false);
  });

  it('saveAcceptedHash 後は true', () => {
    const config = makeConfig([{ name: 'a', cmd: ['cat', 'x.md'] }]);
    const hash = computeCommandsHash(config);
    saveAcceptedHash(hash);
    expect(isCommandHashAccepted(hash)).toBe(true);
  });

  it('別のハッシュは true にならない', () => {
    const c1 = makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]);
    const c2 = makeConfig([{ name: 'a', cmd: ['cat', 'b.md'] }]);
    saveAcceptedHash(computeCommandsHash(c1));
    expect(isCommandHashAccepted(computeCommandsHash(c2))).toBe(false);
  });

  it('複数のハッシュを保存できる', () => {
    const c1 = makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]);
    const c2 = makeConfig([{ name: 'b', cmd: ['cat', 'b.md'] }]);
    const h1 = computeCommandsHash(c1);
    const h2 = computeCommandsHash(c2);
    saveAcceptedHash(h1);
    saveAcceptedHash(h2);
    expect(isCommandHashAccepted(h1)).toBe(true);
    expect(isCommandHashAccepted(h2)).toBe(true);
  });

  it('accepted_hashes.json が存在しない場合は false', () => {
    // beforeEach で空の TMP_DIR が作られているが accepted_hashes.json はない
    expect(existsSync(join(TMP_DIR, 'naiad', 'accepted_hashes.json'))).toBe(
      false,
    );
    expect(isCommandHashAccepted('sha256:abc')).toBe(false);
  });

  it('accepted_hashes.json が破損していても false（クラッシュしない）', () => {
    const dir = join(TMP_DIR, 'naiad');
    mkdirSync(dir, { recursive: true });
    const { writeFileSync } = require('node:fs');
    writeFileSync(join(dir, 'accepted_hashes.json'), 'NOT_VALID_JSON', 'utf-8');
    expect(isCommandHashAccepted('sha256:abc')).toBe(false);
  });
});
