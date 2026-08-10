import { describe, expect, it } from 'vitest';
import { DROPPED_PATH } from '../../src/dropped.ts';
import {
  isUnderRoot,
  resolveFileTabs,
  SERVER_HOSTNAME,
} from '../../src/server.ts';

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

// /files が返すタブ一覧と選択中タブ。ドロップされたファイルは実ファイルの
// 有無に関わらず擬似タブとして並ぶ（並ばないと、ファイルを開いた状態での
// ドロップがどこにも現れず「無視された」ように見える）。
describe('resolveFileTabs', () => {
  it('ドロップが無ければ実ファイルのタブだけを返す', () => {
    expect(
      resolveFileTabs({
        paths: ['/w/a.md', '/w/b.md'],
        activeFile: '/w/b.md',
        droppedName: null,
        droppedActive: false,
      }),
    ).toEqual({
      files: [
        { path: '/w/a.md', name: 'a.md' },
        { path: '/w/b.md', name: 'b.md' },
      ],
      activeFile: '/w/b.md',
    });
  });

  it('実ファイルを開いていてもドロップは擬似タブとして末尾に並び、選択中になる', () => {
    expect(
      resolveFileTabs({
        paths: ['/w/a.md'],
        activeFile: '/w/a.md',
        droppedName: 'dropped.md',
        droppedActive: true,
      }),
    ).toEqual({
      files: [
        { path: '/w/a.md', name: 'a.md' },
        { path: DROPPED_PATH, name: 'dropped.md' },
      ],
      activeFile: DROPPED_PATH,
    });
  });

  it('擬似タブが非選択なら実ファイルが選択中のまま残る', () => {
    expect(
      resolveFileTabs({
        paths: ['/w/a.md'],
        activeFile: '/w/a.md',
        droppedName: 'dropped.md',
        droppedActive: false,
      }).activeFile,
    ).toBe('/w/a.md');
  });

  it('実ファイルが1つも無ければドロップが選択中になる', () => {
    expect(
      resolveFileTabs({
        paths: [],
        activeFile: null,
        droppedName: 'dropped.md',
        droppedActive: false,
      }),
    ).toEqual({
      files: [{ path: DROPPED_PATH, name: 'dropped.md' }],
      activeFile: DROPPED_PATH,
    });
  });

  it('ファイルもドロップも無ければ空を返す', () => {
    expect(
      resolveFileTabs({
        paths: [],
        activeFile: null,
        droppedName: null,
        droppedActive: true,
      }),
    ).toEqual({ files: [], activeFile: null });
  });
});
