import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizePath } from '../../src/pathUtils.ts';

const TMP_DIR = join(tmpdir(), `nymph-pathutils-test-${process.pid}`);

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
});

describe('normalizePath', () => {
  it('相対パスを絶対パスに解決する', () => {
    const real = join(TMP_DIR, 'a.md');
    writeFileSync(real, '# a\n');
    expect(normalizePath(real)).toBe(real);
  });

  it('シンボリックリンク経由のパスを実体パスに解決し、直接パスと同一視できる', () => {
    const real = join(TMP_DIR, 'real.md');
    const link = join(TMP_DIR, 'link.md');
    writeFileSync(real, '# real\n');
    symlinkSync(real, link);

    expect(normalizePath(link)).toBe(normalizePath(real));
    expect(normalizePath(link)).toBe(real);
  });

  it('親ディレクトリがシンボリックリンクの場合も実体パスに解決する', () => {
    const realDir = join(TMP_DIR, 'real-dir');
    const linkDir = join(TMP_DIR, 'link-dir');
    mkdirSync(realDir);
    symlinkSync(realDir, linkDir);
    const realFile = join(realDir, 'nested.md');
    writeFileSync(realFile, '# nested\n');

    expect(normalizePath(join(linkDir, 'nested.md'))).toBe(realFile);
  });

  it('存在しないパスは resolve() の結果にフォールバックする', () => {
    const missing = join(TMP_DIR, 'missing.md');
    expect(normalizePath(missing)).toBe(missing);
  });

  it('`..` を含む冗長なパスを正規化する', () => {
    const real = join(TMP_DIR, 'sub', 'a.md');
    mkdirSync(join(TMP_DIR, 'sub'));
    writeFileSync(real, '# a\n');
    const messy = join(TMP_DIR, 'sub', '..', 'sub', 'a.md');
    expect(normalizePath(messy)).toBe(real);
  });
});
