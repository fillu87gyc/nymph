import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveInputs } from '../../src/resolveInputs.ts';

const TMP_DIR = join(tmpdir(), `nymph-resolve-inputs-test-${process.pid}`);
const SUB_DIR = join(TMP_DIR, 'sub');

/**
 * Bun の Glob は vitest(node) では使えないため、TMP_DIR の中身を返す
 * 簡易実装で差し替える（実 glob の挙動は E2E で担保する）。
 */
async function* fakeScan(pattern: string): AsyncIterable<string> {
  const files = ['a.md', 'b.md', 'note.txt', 'sub/c.md'];
  const re = new RegExp(
    `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`,
  );
  for (const f of files) if (re.test(f)) yield f;
}

const withFakeScan = { scan: fakeScan, cwd: TMP_DIR };

beforeAll(() => {
  mkdirSync(SUB_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, 'a.md'), '# a\n');
  writeFileSync(join(TMP_DIR, 'b.md'), '# b\n');
  writeFileSync(join(TMP_DIR, 'note.txt'), 'not markdown\n');
  writeFileSync(join(SUB_DIR, 'c.md'), '# c\n');
});

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
});

describe('resolveInputs', () => {
  it('引数なしなら全て空', async () => {
    const result = await resolveInputs([], withFakeScan);
    expect(result).toEqual({ paths: [], dirs: [], missing: [] });
  });

  it('実在するファイルは paths に解決される', async () => {
    const result = await resolveInputs([join(TMP_DIR, 'a.md')], withFakeScan);
    expect(result.paths).toEqual([join(TMP_DIR, 'a.md')]);
    expect(result.missing).toEqual([]);
  });

  it('実在するディレクトリは dirs に入る', async () => {
    const result = await resolveInputs([SUB_DIR], withFakeScan);
    expect(result.dirs).toEqual([SUB_DIR]);
    expect(result.paths).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('存在しないファイルは missing に入力表記のまま記録される', async () => {
    const result = await resolveInputs(
      [join(TMP_DIR, 'nope.md')],
      withFakeScan,
    );
    expect(result.missing).toEqual([join(TMP_DIR, 'nope.md')]);
    expect(result.paths).toEqual([]);
    expect(result.dirs).toEqual([]);
  });

  it('存在しないディレクトリも missing に入る', async () => {
    const result = await resolveInputs(
      [join(TMP_DIR, 'no-such-dir')],
      withFakeScan,
    );
    expect(result.missing).toEqual([join(TMP_DIR, 'no-such-dir')]);
    expect(result.dirs).toEqual([]);
  });

  it('実在するファイルと存在しないファイルを混ぜても missing を取りこぼさない', async () => {
    const result = await resolveInputs(
      [join(TMP_DIR, 'a.md'), join(TMP_DIR, 'nope.md'), join(TMP_DIR, 'b.md')],
      withFakeScan,
    );
    expect(result.paths).toEqual([
      join(TMP_DIR, 'a.md'),
      join(TMP_DIR, 'b.md'),
    ]);
    expect(result.missing).toEqual([join(TMP_DIR, 'nope.md')]);
  });

  it('存在しないファイルが複数あれば全て報告する', async () => {
    const result = await resolveInputs(['no1.md', 'no2.md'], withFakeScan);
    expect(result.missing).toEqual(['no1.md', 'no2.md']);
  });

  it('シェルが展開しなかった glob は .md だけ展開される', async () => {
    const result = await resolveInputs(['*.md'], withFakeScan);
    expect(result.paths).toEqual([
      join(TMP_DIR, 'a.md'),
      join(TMP_DIR, 'b.md'),
    ]);
    expect(result.missing).toEqual([]);
  });

  it('どのファイルにも一致しない glob は missing になる', async () => {
    const result = await resolveInputs(['*.markdown'], withFakeScan);
    expect(result.paths).toEqual([]);
    expect(result.missing).toEqual(['*.markdown']);
  });

  it('同じファイルを複数回指定しても重複しない', async () => {
    const result = await resolveInputs(
      [join(TMP_DIR, 'a.md'), join(TMP_DIR, 'a.md')],
      withFakeScan,
    );
    expect(result.paths).toEqual([join(TMP_DIR, 'a.md')]);
  });

  it('実在する .md 以外のファイルも paths として扱う', async () => {
    const result = await resolveInputs(
      [join(TMP_DIR, 'note.txt')],
      withFakeScan,
    );
    expect(result.paths).toEqual([join(TMP_DIR, 'note.txt')]);
    expect(result.missing).toEqual([]);
  });

  it('ディレクトリを複数指定すると dirs に全て入る（判定は呼び出し側）', async () => {
    const result = await resolveInputs([TMP_DIR, SUB_DIR], withFakeScan);
    expect(result.dirs).toEqual([TMP_DIR, SUB_DIR]);
  });
});
