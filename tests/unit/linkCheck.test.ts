import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkLinkTargets,
  MAX_LINK_TARGETS,
  resolveLinkTarget,
} from '../../src/linkCheck.ts';

describe('resolveLinkTarget', () => {
  const base = '/root/docs';
  const scope = '/root';

  it('相対パスを基準ディレクトリから解決する', () => {
    expect(resolveLinkTarget('./a.md', base, scope)).toBe('/root/docs/a.md');
    expect(resolveLinkTarget('img/a.png', base, scope)).toBe(
      '/root/docs/img/a.png',
    );
  });

  it('範囲内なら親ディレクトリへ遡れる', () => {
    expect(resolveLinkTarget('../README.md', base, scope)).toBe(
      '/root/README.md',
    );
  });

  it('範囲の外へ出る行き先は判定しない', () => {
    expect(resolveLinkTarget('../../etc/passwd', base, scope)).toBeNull();
    expect(resolveLinkTarget('../other/a.md', base, '/root/docs')).toBeNull();
  });

  it('絶対パスは判定しない', () => {
    expect(resolveLinkTarget('/etc/passwd', base, scope)).toBeNull();
  });

  it('外部 URL・アンカーだけの行き先は判定しない', () => {
    expect(resolveLinkTarget('https://example.com/a', base, scope)).toBeNull();
    expect(resolveLinkTarget('mailto:a@example.com', base, scope)).toBeNull();
    expect(resolveLinkTarget('//example.com/a', base, scope)).toBeNull();
    expect(resolveLinkTarget('#sec', base, scope)).toBeNull();
    expect(resolveLinkTarget('  ', base, scope)).toBeNull();
  });

  it('アンカー・クエリを落としてから解決する', () => {
    expect(resolveLinkTarget('./a.md#sec', base, scope)).toBe(
      '/root/docs/a.md',
    );
    expect(resolveLinkTarget('./a.md?v=1', base, scope)).toBe(
      '/root/docs/a.md',
    );
  });

  it('パーセントエンコードを戻して解決する', () => {
    expect(resolveLinkTarget('./%E5%9B%B3.png', base, scope)).toBe(
      '/root/docs/図.png',
    );
  });

  it('壊れたパーセントエンコードはそのままのパスとして扱う', () => {
    expect(resolveLinkTarget('./a%zz.md', base, scope)).toBe(
      '/root/docs/a%zz.md',
    );
  });
});

describe('checkLinkTargets', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'nymph-linkcheck-'));
    mkdirSync(join(root, 'docs/img'), { recursive: true });
    writeFileSync(join(root, 'README.md'), '# readme\n');
    writeFileSync(join(root, 'docs/img/a.png'), 'x');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('実在するファイルを exists: true で返す', () => {
    const base = join(root, 'docs');
    expect(checkLinkTargets(['./img/a.png'], base, root)).toEqual([
      { target: './img/a.png', exists: true, isDir: false },
    ]);
  });

  it('ディレクトリは isDir: true で返す', () => {
    const base = join(root, 'docs');
    expect(checkLinkTargets(['./img'], base, root)).toEqual([
      { target: './img', exists: true, isDir: true },
    ]);
  });

  it('存在しないファイルを exists: false で返す', () => {
    const base = join(root, 'docs');
    expect(checkLinkTargets(['./missing.md'], base, root)).toEqual([
      { target: './missing.md', exists: false },
    ]);
  });

  it('範囲外・外部リンクは exists: null（未確認）で返す', () => {
    const base = join(root, 'docs');
    expect(
      checkLinkTargets(
        ['https://example.com', '../../../etc/passwd'],
        base,
        root,
      ),
    ).toEqual([
      { target: 'https://example.com', exists: null },
      { target: '../../../etc/passwd', exists: null },
    ]);
  });

  it('同じ行き先は 1 件に畳む', () => {
    const base = join(root, 'docs');
    expect(
      checkLinkTargets(['./missing.md', './missing.md'], base, root),
    ).toHaveLength(1);
  });

  it('件数の上限を超える分は無視する', () => {
    const base = join(root, 'docs');
    const many = Array.from(
      { length: MAX_LINK_TARGETS + 10 },
      (_, i) => `./f${i}.md`,
    );
    expect(checkLinkTargets(many, base, root)).toHaveLength(MAX_LINK_TARGETS);
  });
});
