import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeCommandsHash,
  isCommandHashAccepted,
  listAcceptedEntries,
  revokeAcceptedEntries,
  saveAcceptedHash,
} from '../../../src/dict/consent.ts';
import type { NymphYml } from '../../../src/dict/schema.ts';

const TMP_DIR = join(tmpdir(), `nymph-consent-test-${process.pid}`);

// 承認のスコープに使う config パス。実在しないパスは resolve() 結果に
// フォールバックするため、テストでは実ファイルを作らなくてよい。
const CONFIG_A = join(TMP_DIR, 'repo-a', '.nymph', 'config.yml');
const CONFIG_B = join(TMP_DIR, 'repo-b', '.nymph', 'config.yml');

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

function makeConfig(sources: { name: string; cmd: string[] }[]): NymphYml {
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

  // canonical にスキーマ版とセクション名を含めることで、
  // 「コマンドを持たない設定」が空文字列のハッシュに落ちないようにする。
  // 空文字列のハッシュを一度承認すると、以後に足すセクション（sync など）が
  // 同じハッシュに落ちて無言で承認済みになるため。
  it('sources が空でも空文字列のハッシュにはならない', () => {
    const empty = makeConfig([]);
    const { createHash } = require('node:crypto');
    const emptyStringHash =
      'sha256:' + createHash('sha256').update('', 'utf-8').digest('hex');
    expect(computeCommandsHash(empty)).not.toBe(emptyStringHash);
  });

  it('sources が空の設定どうしは同じハッシュ', () => {
    expect(computeCommandsHash(makeConfig([]))).toBe(
      computeCommandsHash(makeConfig([])),
    );
  });
});

describe('isCommandHashAccepted / saveAcceptedHash', () => {
  it('未承認のハッシュは false', () => {
    const config = makeConfig([{ name: 'a', cmd: ['cat', 'x.md'] }]);
    expect(isCommandHashAccepted(computeCommandsHash(config), CONFIG_A)).toBe(
      false,
    );
  });

  it('saveAcceptedHash 後は true', () => {
    const config = makeConfig([{ name: 'a', cmd: ['cat', 'x.md'] }]);
    const hash = computeCommandsHash(config);
    saveAcceptedHash(hash, CONFIG_A, ['a: cat x.md']);
    expect(isCommandHashAccepted(hash, CONFIG_A)).toBe(true);
  });

  it('別のハッシュは true にならない', () => {
    const c1 = makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]);
    const c2 = makeConfig([{ name: 'a', cmd: ['cat', 'b.md'] }]);
    saveAcceptedHash(computeCommandsHash(c1), CONFIG_A, []);
    expect(isCommandHashAccepted(computeCommandsHash(c2), CONFIG_A)).toBe(
      false,
    );
  });

  it('複数のハッシュを保存できる', () => {
    const c1 = makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]);
    const c2 = makeConfig([{ name: 'b', cmd: ['cat', 'b.md'] }]);
    const h1 = computeCommandsHash(c1);
    const h2 = computeCommandsHash(c2);
    saveAcceptedHash(h1, CONFIG_A, []);
    saveAcceptedHash(h2, CONFIG_A, []);
    expect(isCommandHashAccepted(h1, CONFIG_A)).toBe(true);
    expect(isCommandHashAccepted(h2, CONFIG_A)).toBe(true);
  });

  it('accepted_hashes.json が存在しない場合は false', () => {
    expect(existsSync(join(TMP_DIR, 'nymph', 'accepted_hashes.json'))).toBe(
      false,
    );
    expect(isCommandHashAccepted('sha256:abc', CONFIG_A)).toBe(false);
  });

  it('accepted_hashes.json が破損していても false（クラッシュしない）', () => {
    const dir = join(TMP_DIR, 'nymph');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'accepted_hashes.json'), 'NOT_VALID_JSON', 'utf-8');
    expect(isCommandHashAccepted('sha256:abc', CONFIG_A)).toBe(false);
  });

  it('同じ内容を二重に承認してもエントリは増えない', () => {
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    saveAcceptedHash(hash, CONFIG_A, []);
    saveAcceptedHash(hash, CONFIG_A, []);
    expect(listAcceptedEntries()).toHaveLength(1);
  });
});

// 承認はリポジトリ（= config ファイル）に紐づく。同じコマンドでも別の場所に
// 置かれた config は「一度も承認していない設定」として扱う。
describe('承認のスコープ', () => {
  it('別の config パスでは同じハッシュでも承認済みにならない', () => {
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    saveAcceptedHash(hash, CONFIG_A, []);
    expect(isCommandHashAccepted(hash, CONFIG_A)).toBe(true);
    expect(isCommandHashAccepted(hash, CONFIG_B)).toBe(false);
  });

  it('パス表記が違っても同じ場所なら承認済み（.. を含む相対表記）', () => {
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    saveAcceptedHash(hash, CONFIG_A, []);
    const equivalent = join(
      TMP_DIR,
      'repo-a',
      'sub',
      '..',
      '.nymph',
      'config.yml',
    );
    expect(isCommandHashAccepted(hash, equivalent)).toBe(true);
  });
});

describe('listAcceptedEntries / revokeAcceptedEntries', () => {
  it('承認したエントリを列挙できる', () => {
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    saveAcceptedHash(hash, CONFIG_A, ['a: cat a.md']);
    const entries = listAcceptedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].hash).toBe(hash);
    expect(entries[0].commands).toEqual(['a: cat a.md']);
    expect(entries[0].approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('承認が無ければ空配列', () => {
    expect(listAcceptedEntries()).toEqual([]);
  });

  it('config パスを指定して失効させられる', () => {
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    saveAcceptedHash(hash, CONFIG_A, []);
    saveAcceptedHash(hash, CONFIG_B, []);

    expect(revokeAcceptedEntries(CONFIG_A)).toBe(1);
    expect(isCommandHashAccepted(hash, CONFIG_A)).toBe(false);
    expect(isCommandHashAccepted(hash, CONFIG_B)).toBe(true);
  });

  it('引数なしの失効はすべて消す', () => {
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    saveAcceptedHash(hash, CONFIG_A, []);
    saveAcceptedHash(hash, CONFIG_B, []);

    expect(revokeAcceptedEntries()).toBe(2);
    expect(listAcceptedEntries()).toEqual([]);
  });

  it('該当が無ければ 0 を返す', () => {
    expect(revokeAcceptedEntries(CONFIG_A)).toBe(0);
  });
});

// 旧形式（ハッシュだけの裸配列）はスコープを持たないため、そのまま
// 承認済みとして扱わない。どの config に対する承認だったかが分からない以上、
// 安全側に倒して再承認を求める。
describe('旧形式（裸のハッシュ配列）からの移行', () => {
  function writeLegacy(hashes: string[]): void {
    const dir = join(TMP_DIR, 'nymph');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'accepted_hashes.json'),
      JSON.stringify(hashes, null, 2) + '\n',
      'utf-8',
    );
  }

  it('旧形式のハッシュは承認済みにならない', () => {
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    writeLegacy([hash]);
    expect(isCommandHashAccepted(hash, CONFIG_A)).toBe(false);
  });

  it('旧形式のエントリは scope なしとして列挙される', () => {
    writeLegacy(['sha256:legacy']);
    const entries = listAcceptedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].hash).toBe('sha256:legacy');
    expect(entries[0].configPath).toBeNull();
  });

  it('旧形式が残っていても新しい承認は通常どおり効く', () => {
    writeLegacy(['sha256:legacy']);
    const hash = computeCommandsHash(
      makeConfig([{ name: 'a', cmd: ['cat', 'a.md'] }]),
    );
    saveAcceptedHash(hash, CONFIG_A, []);
    expect(isCommandHashAccepted(hash, CONFIG_A)).toBe(true);
  });

  it('引数なしの失効は旧形式のエントリも消す', () => {
    writeLegacy(['sha256:legacy']);
    expect(revokeAcceptedEntries()).toBe(1);
    expect(listAcceptedEntries()).toEqual([]);
  });
});
