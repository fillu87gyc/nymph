import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { loadConfig } from '../../src/dict/config.ts';
import {
  computeCommandsHash,
  saveAcceptedHash,
} from '../../src/dict/consent.ts';

const NYMPH_ROOT = process.cwd();

/**
 * テスト専用の XDG_DATA_HOME。
 * 本物の ~/.config/nymph を汚染しないようワーカーごとに分離する。
 */
const TEST_XDG = join(tmpdir(), `nymph-cli-e2e-${process.pid}`);

// テスト実行前にフィクスチャのコマンドを事前承認しておく
test.beforeAll(() => {
  mkdirSync(TEST_XDG, { recursive: true });
  const origXDG = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = TEST_XDG;
  try {
    for (const cfgPath of [
      'tests/fixtures/dict/nymph.yml',
      'tests/fixtures/dict/nymph-json.yml',
    ]) {
      saveAcceptedHash(computeCommandsHash(loadConfig(cfgPath)));
    }
  } finally {
    if (origXDG !== undefined) process.env.XDG_DATA_HOME = origXDG;
    else delete process.env.XDG_DATA_HOME;
  }
});

test.afterAll(() => {
  try {
    rmSync(TEST_XDG, { recursive: true });
  } catch {
    /* ignore */
  }
});

/** CLI を実行するときに使う共通 env（テスト用 XDG_DATA_HOME を注入） */
function cliEnv() {
  return { ...process.env, XDG_DATA_HOME: TEST_XDG };
}

test.describe('nymph dict build CLI', () => {
  const outPath = '/tmp/test-dict-phase1.json';
  const debugOut = '/tmp/test-dict-debug.json';
  const debugDir = '/tmp/nymph-debug-test';

  test.beforeAll(() => {
    if (existsSync(outPath)) rmSync(outPath);
    if (existsSync(debugOut)) rmSync(debugOut);
    if (existsSync(debugDir)) rmSync(debugDir, { recursive: true });
  });

  test('fixture nymph.yml → dict.json が生成される', () => {
    execSync(
      `bun run src/cli.ts dict build --config tests/fixtures/dict/nymph.yml --out ${outPath}`,
      { cwd: NYMPH_ROOT, encoding: 'utf-8', env: cliEnv() },
    );

    expect(existsSync(outPath)).toBe(true);

    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(dict.version).toBe(1);
    expect(dict.updatedAt).toBeDefined();
    expect(dict.entries.length).toBeGreaterThan(0);
    expect(dict.entries[0].term).toBeDefined();
    expect(dict.entries[0].definition).toBeDefined();
    expect(dict.entries[0].definitionHtml).toBeDefined();
  });

  test('ケース A: 集約とリポジトリが抽出される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const terms = dict.entries.map((e: { term: string }) => e.term);
    expect(terms).toContain('集約');
    expect(terms).toContain('リポジトリ');
  });

  test('エンティティ（その他セクション）は除外される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const terms = dict.entries.map((e: { term: string }) => e.term);
    expect(terms).not.toContain('エンティティ');
  });

  test('各エントリが DictEntry の全フィールドを持つ', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    for (const entry of dict.entries as Record<string, unknown>[]) {
      expect(typeof entry.term).toBe('string');
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(typeof entry.definition).toBe('string');
      expect(typeof entry.definitionHtml).toBe('string');
      expect(typeof entry.source).toBe('string');
      expect(typeof entry.sourceRef).toBe('string');
    }
  });

  test('--debug フラグで中間ファイルが出力される', () => {
    execSync(
      `bun run src/cli.ts dict build --config tests/fixtures/dict/nymph.yml --out ${debugOut} --debug --debug-dir ${debugDir}`,
      { cwd: NYMPH_ROOT, encoding: 'utf-8', env: cliEnv() },
    );
    expect(existsSync(`${debugDir}/tree`)).toBe(true);
    expect(existsSync(`${debugDir}/tree/glossary.json`)).toBe(true);
  });
});

test.describe('nymph dict build CLI — markdown aliases', () => {
  const outPath = '/tmp/test-dict-md-aliases.json';

  test.beforeAll(() => {
    if (existsSync(outPath)) rmSync(outPath);
  });

  test('nymph-aliases.yml → dict.json が生成される', () => {
    execSync(
      `bun run src/cli.ts dict build --config tests/fixtures/dict/nymph-aliases.yml --out ${outPath}`,
      { cwd: NYMPH_ROOT, encoding: 'utf-8' },
    );
    expect(existsSync(outPath)).toBe(true);
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(dict.entries.length).toBeGreaterThan(0);
  });

  test('括弧表記（全角）— 集約（Aggregate）から aliases が抽出される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const entry = dict.entries.find((e: { term: string }) => e.term === '集約');
    expect(entry).toBeDefined();
    expect(entry.aliases).toContain('Aggregate');
    expect(entry.term).not.toContain('Aggregate');
  });

  test('ハイフン区切り — リポジトリ - Repository から aliases が抽出される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const entry = dict.entries.find(
      (e: { term: string }) => e.term === 'リポジトリ',
    );
    expect(entry).toBeDefined();
    expect(entry.aliases).toContain('Repository');
    expect(entry.term).not.toContain('Repository');
  });

  test('コロン区切り — ドメインサービス：Domain Service から aliases が抽出される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const entry = dict.entries.find(
      (e: { term: string }) => e.term === 'ドメインサービス',
    );
    expect(entry).toBeDefined();
    expect(entry.aliases).toContain('Domain Service');
    expect(entry.term).not.toContain('Domain Service');
  });

  test('エンティティ（別セクション）は除外される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const terms = dict.entries.map((e: { term: string }) => e.term);
    expect(terms).not.toContain('エンティティ');
  });
});

test.describe('nymph dict build CLI — json adapter', () => {
  const outPath = '/tmp/test-dict-json-adapter.json';

  test.beforeAll(() => {
    if (existsSync(outPath)) rmSync(outPath);
  });

  test('nymph-json.yml → dict.json が生成される', () => {
    execSync(
      `bun run src/cli.ts dict build --config tests/fixtures/dict/nymph-json.yml --out ${outPath}`,
      { cwd: NYMPH_ROOT, encoding: 'utf-8', env: cliEnv() },
    );

    expect(existsSync(outPath)).toBe(true);
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(dict.version).toBe(1);
    expect(dict.updatedAt).toBeDefined();
    expect(dict.entries.length).toBeGreaterThan(0);
  });

  test('json fixture から集約・リポジトリが抽出される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const terms = dict.entries.map((e: { term: string }) => e.term);
    expect(terms).toContain('集約');
    expect(terms).toContain('リポジトリ');
  });

  test('aliases フィールドが dict.json に含まれる', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const shuuyaku = dict.entries.find(
      (e: { term: string }) => e.term === '集約',
    );
    expect(shuuyaku).toBeDefined();
    expect(shuuyaku.aliases).toContain('Aggregate');
  });

  test('括弧表記エイリアスが term 本体から除去される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    const ds = dict.entries.find(
      (e: { term: string }) => e.term === 'ドメインサービス',
    );
    expect(ds).toBeDefined();
    expect(ds.aliases).toContain('Domain Service');
  });

  test('source フィールドが json-glossary で設定される', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    for (const entry of dict.entries as Record<string, unknown>[]) {
      expect(entry.source).toBe('json-glossary');
    }
  });

  test('各エントリが DictEntry の全フィールドを持つ', () => {
    const dict = JSON.parse(readFileSync(outPath, 'utf-8'));
    for (const entry of dict.entries as Record<string, unknown>[]) {
      expect(typeof entry.term).toBe('string');
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(typeof entry.definition).toBe('string');
      expect(typeof entry.definitionHtml).toBe('string');
      expect(typeof entry.source).toBe('string');
      expect(typeof entry.sourceRef).toBe('string');
    }
  });
});

test.describe('nymph dict allow / build — 承認フロー', () => {
  const outPath = '/tmp/test-dict-consent.json';
  const cfgPath = 'tests/fixtures/dict/nymph.yml';

  // このブロックは独立した一時 XDG を使う
  const CONSENT_XDG = join(tmpdir(), `nymph-consent-flow-${process.pid}`);

  test.beforeAll(() => {
    mkdirSync(CONSENT_XDG, { recursive: true });
    if (existsSync(outPath)) rmSync(outPath);
  });

  test.afterAll(() => {
    try {
      rmSync(CONSENT_XDG, { recursive: true });
    } catch {
      /* ignore */
    }
    if (existsSync(outPath)) rmSync(outPath);
  });

  test('未承認の場合 nymph dict build は exit code 1 で失敗する', () => {
    const result = spawnSync(
      'bun',
      [
        'run',
        'src/cli.ts',
        'dict',
        'build',
        '--config',
        cfgPath,
        '--out',
        outPath,
      ],
      {
        cwd: NYMPH_ROOT,
        encoding: 'utf-8',
        env: { ...process.env, XDG_DATA_HOME: CONSENT_XDG },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('nymph dict allow');
  });

  test('nymph dict allow に y を渡すと承認される', () => {
    const result = spawnSync(
      'bun',
      ['run', 'src/cli.ts', 'dict', 'allow', '--config', cfgPath],
      {
        cwd: NYMPH_ROOT,
        encoding: 'utf-8',
        env: { ...process.env, XDG_DATA_HOME: CONSENT_XDG },
        input: 'y\n',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('承認しました');
  });

  test('承認後は nymph dict build が成功する', () => {
    const result = spawnSync(
      'bun',
      [
        'run',
        'src/cli.ts',
        'dict',
        'build',
        '--config',
        cfgPath,
        '--out',
        outPath,
      ],
      {
        cwd: NYMPH_ROOT,
        encoding: 'utf-8',
        env: { ...process.env, XDG_DATA_HOME: CONSENT_XDG },
      },
    );
    expect(result.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
  });

  test('nymph dict allow に N を渡すとキャンセルされビルドもできない', () => {
    const REJECT_XDG = join(tmpdir(), `nymph-reject-${process.pid}`);
    mkdirSync(REJECT_XDG, { recursive: true });
    try {
      const allowResult = spawnSync(
        'bun',
        ['run', 'src/cli.ts', 'dict', 'allow', '--config', cfgPath],
        {
          cwd: NYMPH_ROOT,
          encoding: 'utf-8',
          env: { ...process.env, XDG_DATA_HOME: REJECT_XDG },
          input: 'N\n',
        },
      );
      // キャンセル時は exit 0（エラーではない）
      expect(allowResult.status).toBe(0);
      expect(allowResult.stdout).toContain('キャンセル');

      // その後 build しても未承認のまま
      const buildResult = spawnSync(
        'bun',
        [
          'run',
          'src/cli.ts',
          'dict',
          'build',
          '--config',
          cfgPath,
          '--out',
          '/tmp/test-reject.json',
        ],
        {
          cwd: NYMPH_ROOT,
          encoding: 'utf-8',
          env: { ...process.env, XDG_DATA_HOME: REJECT_XDG },
        },
      );
      expect(buildResult.status).toBe(1);
    } finally {
      try {
        rmSync(REJECT_XDG, { recursive: true });
      } catch {
        /* ignore */
      }
    }
  });
});
