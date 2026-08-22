import { describe, expect, it } from 'vitest';
import { DROPPED_PATH } from '../../src/dropped.ts';
import {
  checkRequestGuard,
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

// ループバック固定は「LAN から届かない」だけで、「ブラウザから届かない」
// ではない。認証もオリジン検査も無ければ、ユーザーが開いている任意の
// Web ページがこの API を叩ける（ポートは 6276 から 20 個しかないので
// 総当たりも容易）。POST /comments は全量置換なので、その 1 発で開いている
// レビューのコメントを消せてしまう。
//
// checkRequestGuard はその入口。3 つの規則からなる:
//  1. Host がループバック以外 → 拒否（DNS rebinding 対策）
//  2. Sec-Fetch-Site: cross-site → 拒否（GET も含む。img/form 経由を塞ぐ）
//  3. 状態変更メソッドで Origin がループバック以外 → 拒否（CSRF 対策）
describe('checkRequestGuard', () => {
  const ok = (over: Partial<Parameters<typeof checkRequestGuard>[0]> = {}) =>
    checkRequestGuard({
      method: 'GET',
      host: '127.0.0.1:6276',
      origin: null,
      secFetchSite: null,
      ...over,
    });

  it('ヘッダーの無い素のリクエスト（curl・CLI）は通す', () => {
    expect(ok({ host: null }).ok).toBe(true);
    expect(ok().ok).toBe(true);
  });

  it('localhost / 127.0.0.1 / [::1] の Host を通す', () => {
    expect(ok({ host: 'localhost:6276' }).ok).toBe(true);
    expect(ok({ host: '127.0.0.1:6276' }).ok).toBe(true);
    expect(ok({ host: '127.0.0.2:6276' }).ok).toBe(true);
    expect(ok({ host: '[::1]:6276' }).ok).toBe(true);
    expect(ok({ host: 'localhost' }).ok).toBe(true);
  });

  it('ループバック以外の Host を拒否する（DNS rebinding）', () => {
    expect(ok({ host: 'evil.example:6276' }).ok).toBe(false);
    expect(ok({ host: 'nymph.evil.example' }).ok).toBe(false);
    // localhost を含むだけのホスト名に引っかからない
    expect(ok({ host: 'localhost.evil.example' }).ok).toBe(false);
    expect(ok({ host: 'notlocalhost' }).ok).toBe(false);
  });

  it('壊れた Host は拒否する', () => {
    expect(ok({ host: 'ho st:1' }).ok).toBe(false);
  });

  it('Sec-Fetch-Site: cross-site を拒否する（GET も）', () => {
    expect(ok({ secFetchSite: 'cross-site' }).ok).toBe(false);
    expect(ok({ method: 'POST', secFetchSite: 'cross-site' }).ok).toBe(false);
  });

  it('same-origin / same-site / none は通す', () => {
    expect(ok({ secFetchSite: 'same-origin' }).ok).toBe(true);
    expect(ok({ secFetchSite: 'same-site' }).ok).toBe(true);
    expect(ok({ secFetchSite: 'none' }).ok).toBe(true);
  });

  it('POST の Origin がループバック以外なら拒否する', () => {
    expect(ok({ method: 'POST', origin: 'https://evil.example' }).ok).toBe(
      false,
    );
    expect(ok({ method: 'POST', origin: 'null' }).ok).toBe(false);
  });

  it('POST の Origin がループバックなら通す（dev の Vite・自分自身）', () => {
    expect(ok({ method: 'POST', origin: 'http://localhost:5173' }).ok).toBe(
      true,
    );
    expect(ok({ method: 'POST', origin: 'http://127.0.0.1:6276' }).ok).toBe(
      true,
    );
  });

  it('Origin 無しの POST は通す（ブラウザ以外のクライアント）', () => {
    expect(ok({ method: 'POST', origin: null }).ok).toBe(true);
  });

  // GET は Origin を送らないブラウザ機能（img/script）から叩けるため、
  // Origin 単体では判定しない（Sec-Fetch-Site 側で塞ぐ）。
  it('GET は Origin がループバック以外でも Host が正しければ通す', () => {
    expect(ok({ method: 'GET', origin: 'https://evil.example' }).ok).toBe(true);
  });

  it('拒否時は理由を返す', () => {
    const res = ok({ host: 'evil.example' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('Host');
  });
});
