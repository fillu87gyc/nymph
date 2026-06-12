import { describe, expect, it } from 'vitest';
import { isUnderRoot, SERVER_HOSTNAME } from '../../src/server.ts';

// レビュー対象ファイルを認証なしで公開する API のため、サーバーは
// ループバックアドレスにのみバインドし LAN に晒さないことを保証する。
// （実バインド挙動は vitest(node) では Bun.serve を起動できないため、
//  E2E の localhost 動作と手動確認で担保する。）
describe('server binding', () => {
  it('binds to the loopback address only, never 0.0.0.0', () => {
    expect(SERVER_HOSTNAME).toBe('127.0.0.1');
  });
});

// /open-file の認可判定。パストラバーサルや prefix 衝突で
// ルート外のファイルが開けないことを保証する。
describe('isUnderRoot', () => {
  it('ルート直下・サブディレクトリ内のパスに true', () => {
    expect(isUnderRoot('/root/a.md', '/root')).toBe(true);
    expect(isUnderRoot('/root/sub/deep/a.md', '/root')).toBe(true);
  });

  it('ルート外のパスに false', () => {
    expect(isUnderRoot('/etc/passwd', '/root')).toBe(false);
    expect(isUnderRoot('/other/a.md', '/root')).toBe(false);
  });

  it('.. を含む traversal を拒否する', () => {
    expect(isUnderRoot('/root/../etc/passwd', '/root')).toBe(false);
    expect(isUnderRoot('/root/sub/../../etc/passwd', '/root')).toBe(false);
  });

  it('prefix が衝突する別ディレクトリ（/rootX）に false', () => {
    expect(isUnderRoot('/rootX/a.md', '/root')).toBe(false);
  });

  it('ルートそのものと rootDir 未設定（null）に false', () => {
    expect(isUnderRoot('/root', '/root')).toBe(false);
    expect(isUnderRoot('/root/a.md', null)).toBe(false);
  });
});
