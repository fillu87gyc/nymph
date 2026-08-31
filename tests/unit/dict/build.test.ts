import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { buildDict, spawnEnv } from '../../../src/dict/build.ts';

const CWD = process.cwd();
const CONFIG_PATH = `${CWD}/tests/fixtures/dict/nymph.yml`;
const OUT_PATH = '/tmp/test-build-dict.json';
const DEBUG_DIR = '/tmp/test-build-debug';

afterEach(() => {
  if (existsSync(OUT_PATH)) rmSync(OUT_PATH);
  if (existsSync(DEBUG_DIR)) rmSync(DEBUG_DIR, { recursive: true });
});

describe('buildDict', () => {
  test('fixture nymph.yml から DictFile を生成する', async () => {
    const result = await buildDict({
      configPath: CONFIG_PATH,
      outPath: OUT_PATH,
      cwd: CWD,
    });

    expect(result.version).toBe(1);
    expect(result.updatedAt).toBeDefined();
    expect(result.entries.length).toBeGreaterThan(0);
    expect(existsSync(OUT_PATH)).toBe(true);
  });

  test('集約とリポジトリが含まれる', async () => {
    const result = await buildDict({
      configPath: CONFIG_PATH,
      outPath: OUT_PATH,
      cwd: CWD,
    });

    const terms = result.entries.map((e) => e.term);
    expect(terms).toContain('集約');
    expect(terms).toContain('リポジトリ');
  });

  test('source フィールドが設定される', async () => {
    const result = await buildDict({
      configPath: CONFIG_PATH,
      outPath: OUT_PATH,
      cwd: CWD,
    });

    for (const entry of result.entries) {
      expect(entry.source).toBe('glossary');
    }
  });

  test('--debug フラグで中間ファイルが生成される', async () => {
    await buildDict({
      configPath: CONFIG_PATH,
      outPath: OUT_PATH,
      debug: true,
      debugDir: DEBUG_DIR,
      cwd: CWD,
    });

    expect(existsSync(`${DEBUG_DIR}/tree`)).toBe(true);
    expect(existsSync(`${DEBUG_DIR}/match`)).toBe(true);
    expect(existsSync(`${DEBUG_DIR}/tree/glossary.json`)).toBe(true);
  });

  test('カスタム config で echo コマンドを使って build できる', async () => {
    // Write a minimal nymph.yml that uses echo (always available)
    const tmpConfig = '/tmp/test-nymph-echo.yml';
    writeFileSync(
      tmpConfig,
      `sources:\n  - name: test\n    fetch:\n      cmd: ["echo", "## 用語\\n\\n### テスト用語\\n\\nテスト定義。"]\n    adapter: markdown\n    rules:\n      term: "h3"\n      definition: "term > p"\n`,
      'utf-8',
    );

    const result = await buildDict({
      configPath: tmpConfig,
      outPath: OUT_PATH,
      cwd: CWD,
    });

    // echo output may not produce valid structured markdown, but build should not throw
    expect(result.version).toBe(1);
    rmSync(tmpConfig);
  });

  test('存在しないコマンドの場合はエラーをスロー', async () => {
    const tmpConfig = '/tmp/test-nymph-bad.yml';
    writeFileSync(
      tmpConfig,
      `sources:\n  - name: bad\n    fetch:\n      cmd: ["/nonexistent-binary-xyz", "arg"]\n    adapter: markdown\n    rules:\n      term: "h2"\n      definition: "term > p"\n`,
      'utf-8',
    );

    await expect(
      buildDict({
        configPath: tmpConfig,
        outPath: OUT_PATH,
        cwd: CWD,
      }),
    ).rejects.toThrow();

    rmSync(tmpConfig);
  });

  test('出力 JSON ファイルが DictEntry の全フィールドを持つ', async () => {
    await buildDict({ configPath: CONFIG_PATH, outPath: OUT_PATH, cwd: CWD });

    const raw = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
    expect(raw.version).toBe(1);
    expect(typeof raw.updatedAt).toBe('string');
    expect(Array.isArray(raw.entries)).toBe(true);

    for (const entry of raw.entries) {
      expect(typeof entry.term).toBe('string');
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(typeof entry.definition).toBe('string');
      expect(typeof entry.definitionHtml).toBe('string');
      expect(typeof entry.source).toBe('string');
      expect(typeof entry.sourceRef).toBe('string');
    }
  });

  test('セレクタ外の用語（エンティティ）は含まれない', async () => {
    const result = await buildDict({
      configPath: CONFIG_PATH,
      outPath: OUT_PATH,
      cwd: CWD,
    });

    const terms = result.entries.map((e) => e.term);
    expect(terms).not.toContain('エンティティ');
  });

  test('skipIfFresh=true かつ stale な dict.json は再ビルドする', async () => {
    const staleDict = {
      version: 1,
      updatedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
      entries: [
        {
          term: 'stale-term',
          aliases: [],
          definition: 'stale',
          definitionHtml: '<p>stale</p>',
          source: 'test',
          sourceRef: '',
        },
      ],
    };
    writeFileSync(OUT_PATH, JSON.stringify(staleDict));

    const result = await buildDict({
      configPath: CONFIG_PATH,
      outPath: OUT_PATH,
      cwd: CWD,
      skipIfFresh: true,
    });

    const terms = result.entries.map((e) => e.term);
    expect(terms).toContain('集約');
    expect(terms).not.toContain('stale-term');
  });
});

// 認証は `gh auth` の管轄、と外注しても、spawn した子プロセスが
// process.env を丸ごと継承していれば資格情報は渡ってしまう
// （`GH_TOKEN` を読む、`gh auth token` を叩く、など）。
// config.yml はレビュー対象リポジトリが書ける内容なので、外部コマンドへ
// 渡す環境変数は allowlist で絞る。
describe('spawnEnv', () => {
  test('allowlist にある変数だけを通す', () => {
    const env = spawnEnv({
      PATH: '/usr/bin',
      HOME: '/home/u',
      LANG: 'ja_JP.UTF-8',
      GH_TOKEN: 'ghp_secret',
      GITHUB_TOKEN: 'ghs_secret',
      AWS_SECRET_ACCESS_KEY: 'aws_secret',
      NPM_TOKEN: 'npm_secret',
      SSH_AUTH_SOCK: '/tmp/agent.sock',
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/u');
    expect(env.LANG).toBe('ja_JP.UTF-8');
    expect(env).not.toHaveProperty('GH_TOKEN');
    expect(env).not.toHaveProperty('GITHUB_TOKEN');
    expect(env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(env).not.toHaveProperty('NPM_TOKEN');
    expect(env).not.toHaveProperty('SSH_AUTH_SOCK');
  });

  test('未定義の変数はキーごと落とす', () => {
    const env = spawnEnv({ PATH: '/usr/bin' });
    expect(env).not.toHaveProperty('HOME');
    expect(Object.keys(env)).toEqual(['PATH']);
  });
});

describe('外部コマンドへの環境変数の受け渡し', () => {
  function writeConfig(path: string, cmd: string[]): void {
    writeFileSync(
      path,
      `sources:\n  - name: env\n    fetch:\n      cmd: ${JSON.stringify(cmd)}\n    adapter: markdown\n    rules:\n      term: "h3"\n      definition: "term > p"\n`,
      'utf-8',
    );
  }

  test('allowlist 外の環境変数は子プロセスに渡らない', async () => {
    const tmpConfig = '/tmp/test-nymph-env-secret.yml';
    writeConfig(tmpConfig, ['printenv', 'NYMPH_TEST_SECRET']);
    process.env.NYMPH_TEST_SECRET = 'leaked';

    // 子プロセスに見えていなければ printenv は終了コード 1 で落ちる
    await expect(
      buildDict({ configPath: tmpConfig, outPath: OUT_PATH, cwd: CWD }),
    ).rejects.toThrow();

    delete process.env.NYMPH_TEST_SECRET;
    rmSync(tmpConfig);
  });

  test('allowlist にある PATH は子プロセスに渡る', async () => {
    const tmpConfig = '/tmp/test-nymph-env-path.yml';
    writeConfig(tmpConfig, ['printenv', 'PATH']);

    const result = await buildDict({
      configPath: tmpConfig,
      outPath: OUT_PATH,
      cwd: CWD,
    });
    expect(result.version).toBe(1);

    rmSync(tmpConfig);
  });
});
