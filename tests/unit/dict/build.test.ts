import { describe, expect, test, afterEach } from 'vitest';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildDict } from '../../../src/dict/build.ts';

const WORKTREE = '/home/user/nymph/.claude/worktrees/agent-af9c867267960bdda';
const CONFIG_PATH = `${WORKTREE}/tests/fixtures/dict/nymph.yml`;
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
      cwd: WORKTREE,
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
      cwd: WORKTREE,
    });

    const terms = result.entries.map((e) => e.term);
    expect(terms).toContain('集約');
    expect(terms).toContain('リポジトリ');
  });

  test('source フィールドが設定される', async () => {
    const result = await buildDict({
      configPath: CONFIG_PATH,
      outPath: OUT_PATH,
      cwd: WORKTREE,
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
      cwd: WORKTREE,
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
      cwd: WORKTREE,
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
        cwd: WORKTREE,
      }),
    ).rejects.toThrow();

    rmSync(tmpConfig);
  });
});
