import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MAX_MATCHES_PER_FILE,
  MAX_TOTAL_MATCHES,
  searchContent,
  searchFiles,
} from '../../src/search.ts';

describe('searchContent', () => {
  const content = [
    '# Title',
    '',
    'The quick brown fox jumps.',
    'Nothing here.',
    'Another QUICK line.',
  ].join('\n');

  it('一致行を 1-based 行番号とオフセット付きで返す', () => {
    const matches = searchContent(content, 'quick');
    expect(matches).toHaveLength(2);
    expect(matches[0].line).toBe(3);
    expect(matches[0].text).toBe('The quick brown fox jumps.');
    expect(matches[0].text.slice(matches[0].start, matches[0].end)).toBe(
      'quick',
    );
  });

  it('大文字小文字を無視して一致する', () => {
    const matches = searchContent(content, 'quick');
    expect(matches[1].line).toBe(5);
    expect(matches[1].text.slice(matches[1].start, matches[1].end)).toBe(
      'QUICK',
    );
  });

  it('前後1行のコンテキストを付与する（先頭・末尾では欠ける）', () => {
    const matches = searchContent('first\nsecond\nthird', 'second');
    expect(matches[0].before).toEqual(['first']);
    expect(matches[0].after).toEqual(['third']);

    const head = searchContent('first\nsecond', 'first');
    expect(head[0].before).toEqual([]);
    expect(head[0].after).toEqual(['second']);

    const tail = searchContent('first\nsecond', 'second');
    expect(tail[0].before).toEqual(['first']);
    expect(tail[0].after).toEqual([]);
  });

  it('1行に複数一致しても1件として数える', () => {
    const matches = searchContent('foo foo foo', 'foo');
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(0);
  });

  it('maxMatches 上限で打ち切る', () => {
    const many = Array.from({ length: 10 }, (_, i) => `hit ${i}`).join('\n');
    expect(searchContent(many, 'hit')).toHaveLength(MAX_MATCHES_PER_FILE);
    expect(searchContent(many, 'hit', 2)).toHaveLength(2);
  });

  it('空クエリ・空白のみのクエリは一致なし', () => {
    expect(searchContent(content, '')).toEqual([]);
    expect(searchContent(content, '   ')).toEqual([]);
  });

  it('長い行はマッチ周辺にクリップされオフセットが調整される', () => {
    const long = `${'a'.repeat(200)}NEEDLE${'b'.repeat(200)}`;
    const [m] = searchContent(long, 'needle');
    expect(m.text.length).toBeLessThan(long.length);
    expect(m.text.startsWith('…')).toBe(true);
    expect(m.text.endsWith('…')).toBe(true);
    expect(m.text.slice(m.start, m.end)).toBe('NEEDLE');
  });

  it('行頭付近の一致はクリップ後も先頭から表示される', () => {
    const long = `NEEDLE${'b'.repeat(300)}`;
    const [m] = searchContent(long, 'needle');
    expect(m.text.startsWith('NEEDLE')).toBe(true);
    expect(m.text.endsWith('…')).toBe(true);
    expect(m.text.slice(m.start, m.end)).toBe('NEEDLE');
  });

  it('長いコンテキスト行もクリップされる', () => {
    const contentWithLongCtx = `${'x'.repeat(300)}\nNEEDLE line`;
    const [m] = searchContent(contentWithLongCtx, 'needle');
    expect(m.before[0].length).toBeLessThan(300);
    expect(m.before[0].endsWith('…')).toBe(true);
  });
});

describe('searchFiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nymph-search-'));
  const alphaPath = join(dir, 'alpha.md');
  const betaPath = join(dir, 'beta.md');
  writeFileSync(alphaPath, '# Alpha\n\nzephyr appears here.\n');
  writeFileSync(betaPath, '# Second\n\nnothing special.\n');

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('本文一致のファイルだけが matches 付きで返る', () => {
    const { results, truncated } = searchFiles([alphaPath, betaPath], 'zephyr');
    expect(truncated).toBe(false);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(alphaPath);
    expect(results[0].name).toBe('alpha.md');
    expect(results[0].matches[0].line).toBe(3);
  });

  it('ファイル名のみ一致は nameMatch: true・matches 空で返る', () => {
    const { results } = searchFiles([alphaPath, betaPath], 'beta');
    const beta = results.find((r) => r.path === betaPath);
    expect(beta?.nameMatch).toBe(true);
    expect(beta?.matches).toEqual([]);
  });

  it('読めないパスはスキップされる', () => {
    const { results } = searchFiles(
      [join(dir, 'missing.md'), alphaPath],
      'zephyr',
    );
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(alphaPath);
  });

  it('空クエリは空結果', () => {
    expect(searchFiles([alphaPath], '')).toEqual({
      results: [],
      truncated: false,
    });
  });

  it('合計マッチ数が上限を超えると truncated: true で打ち切る', () => {
    const paths: string[] = [];
    // 1ファイルあたり MAX_MATCHES_PER_FILE 件に丸められるため、
    // 上限超過に必要なファイル数 +1 を用意する
    const needed = Math.ceil(MAX_TOTAL_MATCHES / MAX_MATCHES_PER_FILE) + 1;
    for (let i = 0; i < needed; i++) {
      const p = join(dir, `many-${i}.md`);
      writeFileSync(p, Array.from({ length: 10 }, () => 'hit line').join('\n'));
      paths.push(p);
    }
    const { results, truncated } = searchFiles(paths, 'hit');
    const total = results.reduce((acc, r) => acc + r.matches.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_MATCHES);
    expect(truncated).toBe(true);
  });
});
