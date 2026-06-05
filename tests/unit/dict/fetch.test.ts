import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn(() => ({
      status: 0,
      stdout: '## ユビキタス言語\n### テスト\nテスト定義。\n',
      stderr: '',
      error: undefined,
    })),
  };
});

import * as childProcess from 'node:child_process';
import { buildDict } from '../../../src/dict/build.ts';

describe('buildDict fetch', () => {
  afterEach(() => vi.clearAllMocks());

  test('spawnSync が shell:false で呼ばれる', async () => {
    await buildDict({
      configPath: `${process.cwd()}/tests/fixtures/dict/naiad.yml`,
      outPath: '/tmp/test-fetch-mock.json',
      cwd: process.cwd(),
    });

    expect(childProcess.spawnSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ shell: false }),
    );
  });

  test('skipIfFresh=true かつ fresh な dict.json があればスキップする', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');

    const outPath = '/tmp/test-skip-fresh.json';
    const freshDict = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [
        {
          term: 'cached',
          aliases: [],
          definition: 'cached',
          definitionHtml: '<p>cached</p>',
          source: 'test',
          sourceRef: '',
        },
      ],
    };
    mkdirSync('/tmp', { recursive: true });
    writeFileSync(outPath, JSON.stringify(freshDict));

    const result = await buildDict({
      configPath: `${process.cwd()}/tests/fixtures/dict/naiad.yml`,
      outPath,
      cwd: process.cwd(),
      skipIfFresh: true,
    });

    // spawnSync が呼ばれていないこと（スキップされた）
    expect(childProcess.spawnSync).not.toHaveBeenCalled();
    expect(result.entries[0].term).toBe('cached');
  });
});
