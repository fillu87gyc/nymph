import { describe, expect, it } from 'vitest';
import {
  isLoopbackHost,
  isUnderRoot,
  SERVER_HOSTNAME,
} from '../../src/server.ts';

// レビュー対象ファイルを認証なしで公開する API のため、サーバーは
// デフォルトでループバックにのみバインドし、LAN への公開は `--host` で
// 明示的に opt-in する。（実バインド挙動は vitest(node) では Bun.serve を
// 起動できないため、E2E の localhost 動作と手動確認で担保する。）
describe('server binding', () => {
  it('defaults to the loopback address, never 0.0.0.0', () => {
    expect(SERVER_HOSTNAME).toBe('127.0.0.1');
  });
});

describe('isLoopbackHost', () => {
  it('ループバック相当のホスト名に true', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
  });

  it('LAN 公開になるアドレスに false', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.5')).toBe(false);
    expect(isLoopbackHost('10.0.0.1')).toBe(false);
    expect(isLoopbackHost('::')).toBe(false);
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
