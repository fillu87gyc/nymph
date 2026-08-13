import { describe, expect, it } from 'vitest';
import { rewriteImageSrc, toImageUrl } from '../../src/client/lib/imageSrc.ts';
import { DROPPED_PATH } from '../../src/dropped.ts';

const FILE = '/w/docs/guide.md';

// 本文中の相対パス画像は「画面の URL」ではなく「md ファイルの位置」を起点に
// 解決されなければならない。ブラウザに任せると必ず 404 になるため、src を
// /image へ向け直して起点をサーバーへ渡す。
describe('toImageUrl', () => {
  it('相対パスを /image の URL にする', () => {
    expect(toImageUrl('./img/a.png', FILE)).toBe(
      `/image?file=${encodeURIComponent(FILE)}&path=${encodeURIComponent('./img/a.png')}`,
    );
    expect(toImageUrl('img/a.png', FILE)).toBe(
      `/image?file=${encodeURIComponent(FILE)}&path=${encodeURIComponent('img/a.png')}`,
    );
    expect(toImageUrl('../assets/a.png', FILE)).toBe(
      `/image?file=${encodeURIComponent(FILE)}&path=${encodeURIComponent('../assets/a.png')}`,
    );
  });

  it('空白・日本語・記号を含むパスをエンコードする', () => {
    expect(toImageUrl('./図 1&2.png', FILE)).toBe(
      `/image?file=${encodeURIComponent(FILE)}&path=${encodeURIComponent('./図 1&2.png')}`,
    );
  });

  it('スキーム付き・protocol relative はそのまま（null）', () => {
    expect(toImageUrl('https://example.com/a.png', FILE)).toBeNull();
    expect(toImageUrl('http://example.com/a.png', FILE)).toBeNull();
    expect(toImageUrl('data:image/png;base64,AAA', FILE)).toBeNull();
    expect(toImageUrl('//example.com/a.png', FILE)).toBeNull();
  });

  it('ルート絶対パス・フラグメント・空文字はそのまま（null）', () => {
    expect(toImageUrl('/img/a.png', FILE)).toBeNull();
    expect(toImageUrl('#anchor', FILE)).toBeNull();
    expect(toImageUrl('   ', FILE)).toBeNull();
  });

  it('起点が無い（未選択・ドロップ由来）なら書き換えない', () => {
    expect(toImageUrl('./a.png', null)).toBeNull();
    expect(toImageUrl('./a.png', DROPPED_PATH)).toBeNull();
  });
});

describe('rewriteImageSrc', () => {
  it('marked が出した img の相対 src を書き換える', () => {
    const html = rewriteImageSrc(
      '<p><img src="./img/a.png" alt="A"></p>',
      FILE,
    );
    expect(html).toContain(
      `src="/image?file=${encodeURIComponent(FILE)}&amp;path=${encodeURIComponent('./img/a.png')}"`,
    );
    expect(html).toContain('alt="A"');
  });

  it('本文に直接書かれた img タグも同じ規則で書き換える', () => {
    const html = rewriteImageSrc(
      '<p>前 <img src="sub/b.jpg" width="100"> 後</p>',
      FILE,
    );
    expect(html).toContain(
      `src="/image?file=${encodeURIComponent(FILE)}&amp;path=${encodeURIComponent('sub/b.jpg')}"`,
    );
    expect(html).toContain('width="100"');
  });

  it('複数の画像をまとめて書き換える', () => {
    const html = rewriteImageSrc(
      '<p><img src="a.png"><img src="https://example.com/b.png"><img src="c.png"></p>',
      FILE,
    );
    expect(html.match(/src="\/image\?/g)).toHaveLength(2);
    expect(html).toContain('src="https://example.com/b.png"');
  });

  it('画像が無い HTML・起点が無い場合はそのまま返す', () => {
    const plain = '<p>text</p>';
    expect(rewriteImageSrc(plain, FILE)).toBe(plain);
    const img = '<p><img src="a.png"></p>';
    expect(rewriteImageSrc(img, null)).toBe(img);
  });
});
