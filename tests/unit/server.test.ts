import { describe, expect, it } from 'vitest';
import { SERVER_HOSTNAME } from '../../src/server.ts';

// レビュー対象ファイルを認証なしで公開する API のため、サーバーは
// ループバックアドレスにのみバインドし LAN に晒さないことを保証する。
// （実バインド挙動は vitest(node) では Bun.serve を起動できないため、
//  E2E の localhost 動作と手動確認で担保する。）
describe('server binding', () => {
  it('binds to the loopback address only, never 0.0.0.0', () => {
    expect(SERVER_HOSTNAME).toBe('127.0.0.1');
  });
});
