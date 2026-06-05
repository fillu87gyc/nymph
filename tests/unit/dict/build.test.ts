import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { buildDict } from '../../../src/dict/build.ts';

const CWD = process.cwd();
const CONFIG_PATH = `${CWD}/tests/fixtures/dict/naiad.yml`;
const OUT_PATH = '/tmp/test-build-dict.json';
const DEBUG_DIR = '/tmp/test-build-debug';

afterEach(() => {
  if (existsSync(OUT_PATH)) rmSync(OUT_PATH);
  if (existsSync(DEBUG_DIR)) rmSync(DEBUG_DIR, { recursive: true });
});

describe('buildDict', () => {
  test('fixture naiad.yml から DictFile を生成する', async () => {
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
    // Write a minimal naiad.yml that uses echo (always available)
    const tmpConfig = '/tmp/test-naiad-echo.yml';
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
    const tmpConfig = '/tmp/test-naiad-bad.yml';
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
