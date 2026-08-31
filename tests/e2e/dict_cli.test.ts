import { execSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
      'tests/fixtures/dict/nymph-aliases.yml',
      'tests/fixtures/dict/nymph-json.yml',
    ]) {
      saveAcceptedHash(computeCommandsHash(loadConfig(cfgPath)), cfgPath);
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
      { cwd: NYMPH_ROOT, encoding: 'utf-8', env: cliEnv() },
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

// 承認は「このコマンド」だけでなく「この config ファイル」にも紐づく。
// 同じコマンドを持つ config は世の中にいくらでもあり、nymph は他人の
// リポジトリを読むためのツールなので、ハッシュだけで突き合わせると
// 「一度も開いたことのないリポジトリの config が承認済み」になってしまう。
test.describe('nymph dict allow — 承認のスコープと失効', () => {
  const SCOPE_XDG = join(tmpdir(), `nymph-consent-scope-${process.pid}`);
  const cfgPath = 'tests/fixtures/dict/nymph.yml';
  // 内容は同じで置き場所だけ違う config（＝別リポジトリに同じ設定がある状態）
  const copyDir = join(tmpdir(), `nymph-consent-copy-${process.pid}`);
  const copyCfgPath = join(copyDir, 'nymph.yml');
  const outPath = join(tmpdir(), `nymph-scope-${process.pid}.json`);

  function run(args: string[], input?: string) {
    return spawnSync('bun', ['run', 'src/cli.ts', ...args], {
      cwd: NYMPH_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, XDG_DATA_HOME: SCOPE_XDG },
      ...(input === undefined ? {} : { input }),
    });
  }

  test.beforeAll(() => {
    mkdirSync(SCOPE_XDG, { recursive: true });
    mkdirSync(copyDir, { recursive: true });
    // fetch.cmd の相対パスは cwd 基準で解決されるので、config を別の場所に
    // 置いても同じコマンドが同じように動く（＝内容は完全に同一）。
    writeFileSync(copyCfgPath, readFileSync(cfgPath, 'utf-8'));
  });

  test.afterAll(() => {
    for (const p of [SCOPE_XDG, copyDir]) {
      try {
        rmSync(p, { recursive: true });
      } catch {
        /* ignore */
      }
    }
    if (existsSync(outPath)) rmSync(outPath);
  });

  test('承認した config は build できる', () => {
    const allow = run(['dict', 'allow', '--config', cfgPath], 'y\n');
    expect(allow.status).toBe(0);
    expect(allow.stdout).toContain('承認しました');

    const build = run(['dict', 'build', '--config', cfgPath, '--out', outPath]);
    expect(build.status).toBe(0);
  });

  test('同じ内容でも別の場所にある config は未承認のまま', () => {
    const build = run([
      'dict',
      'build',
      '--config',
      copyCfgPath,
      '--out',
      outPath,
    ]);
    expect(build.status).toBe(1);
    expect(build.stderr).toContain('nymph dict allow');
  });

  test('--list に承認済みの config が出る', () => {
    const list = run(['dict', 'allow', '--list']);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('nymph.yml');
  });

  test('--revoke で失効し、build が再び失敗する', () => {
    const revoke = run(['dict', 'allow', '--revoke', '--config', cfgPath]);
    expect(revoke.status).toBe(0);
    expect(revoke.stdout).toContain('1 件失効');

    const build = run(['dict', 'build', '--config', cfgPath, '--out', outPath]);
    expect(build.status).toBe(1);

    const list = run(['dict', 'allow', '--list']);
    expect(list.stdout).toContain('承認済みのコマンドはありません');
  });
});

// 「nymph はトークンを持たない」は、spawn した子プロセスにトークンが
// 渡らないことを意味しない。config.yml はレビュー対象リポジトリが書ける
// 内容なので、外部コマンドへ渡す環境変数は allowlist で絞る。
test.describe('nymph dict build — 子プロセスの環境変数', () => {
  const ENV_XDG = join(tmpdir(), `nymph-consent-env-${process.pid}`);
  const envDir = join(tmpdir(), `nymph-env-${process.pid}`);
  const secretCfg = join(envDir, 'secret.yml');
  const pathCfg = join(envDir, 'path.yml');
  const outPath = join(tmpdir(), `nymph-env-${process.pid}.json`);

  function config(cmd: string[]): string {
    return `sources:\n  - name: env\n    fetch:\n      cmd: ${JSON.stringify(cmd)}\n    adapter: markdown\n    rules:\n      term: "h3"\n      definition: "term > p"\n`;
  }

  function run(args: string[], input?: string) {
    return spawnSync('bun', ['run', 'src/cli.ts', ...args], {
      cwd: NYMPH_ROOT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        XDG_DATA_HOME: ENV_XDG,
        GH_TOKEN: 'ghp_should_not_leak',
      },
      ...(input === undefined ? {} : { input }),
    });
  }

  test.beforeAll(() => {
    mkdirSync(ENV_XDG, { recursive: true });
    mkdirSync(envDir, { recursive: true });
    writeFileSync(secretCfg, config(['printenv', 'GH_TOKEN']));
    writeFileSync(pathCfg, config(['printenv', 'PATH']));
    for (const cfg of [secretCfg, pathCfg]) {
      expect(run(['dict', 'allow', '--config', cfg], 'y\n').status).toBe(0);
    }
  });

  test.afterAll(() => {
    for (const p of [ENV_XDG, envDir]) {
      try {
        rmSync(p, { recursive: true });
      } catch {
        /* ignore */
      }
    }
    if (existsSync(outPath)) rmSync(outPath);
  });

  test('GH_TOKEN は外部コマンドに渡らない', () => {
    // 渡っていなければ printenv は終了コード 1 で落ち、build も失敗する
    const build = run([
      'dict',
      'build',
      '--config',
      secretCfg,
      '--out',
      outPath,
    ]);
    expect(build.status).toBe(1);
    expect(build.stderr).not.toContain('ghp_should_not_leak');
  });

  test('PATH は外部コマンドに渡る（コマンドが動く）', () => {
    const build = run(['dict', 'build', '--config', pathCfg, '--out', outPath]);
    expect(build.status).toBe(0);
  });
});
