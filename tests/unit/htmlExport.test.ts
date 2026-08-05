import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Comment } from '../../src/client/types.ts';
import {
  findOrphanedIds,
  inlineScriptSafe,
  renderExportHtml,
} from '../../src/htmlExport.ts';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nymph-export-'));
  file = join(dir, 'doc.md');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function render(content: string, comments: Comment[] = [], round = 0): string {
  writeFileSync(file, content);
  return renderExportHtml({
    file,
    content,
    comments,
    round,
    generatedAt: new Date('2026-08-05T12:34:00'),
  });
}

// 印の有無は section タグで確かめる（同じ文字列が埋め込み CSS にも出るため）。
const COMMENTED_BLOCK = /<section [^>]*data-commented="true"/;

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c_aaa111',
    lineStart: 1,
    lineEnd: 1,
    block_type: 'heading',
    context: '# 見出し',
    text: 'ここを直してください',
    ...over,
  };
}

describe('renderExportHtml — 生成物の骨格', () => {
  it('単体で完結した HTML を返す（外部ホストを参照しない）', () => {
    const html = render('# 見出し\n\n本文です。\n');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>doc.md — nymph レビュー</title>');
    // 生成物がネットワークを見に行かないことがこの機能の要件。
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(html).not.toContain('@import');
  });

  it('ファイル名・出力日時・コメント件数をヘッダーに出す', () => {
    const html = render('# 見出し\n', [comment()]);
    expect(html).toContain('doc.md');
    expect(html).toContain('2026-08-05 12:34 出力');
    expect(html).toContain('コメント 1 件');
  });

  it('ラウンドは 1 以上のときだけ出す', () => {
    expect(render('# a\n', [], 0)).not.toContain('ラウンド');
    expect(render('# a\n', [], 3)).toContain('ラウンド 3');
  });

  it('ブロックに元ファイルの行番号を持たせる', () => {
    const html = render('# 見出し\n\n本文です。\n');
    expect(html).toContain('data-line-start="1" data-line-end="1"');
    expect(html).toContain('data-line-start="3" data-line-end="3"');
  });
});

describe('renderExportHtml — Markdown の変換', () => {
  it('見出し・表・リストを HTML にする', () => {
    const html = render(
      '# 見出し\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- 項目\n',
    );
    expect(html).toContain('<h1>見出し</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('<li>項目</li>');
  });

  it('コードブロックは言語クラス付きでエスケープする', () => {
    const html = render('```ts\nconst a = "<b>";\n```\n');
    expect(html).toContain('<code class="language-ts">');
    expect(html).toContain('const a = &quot;&lt;b&gt;&quot;;');
  });

  it('mermaid は既定ではソースを見せるだけ（描画エンジンを積まない）', () => {
    const html = render('```mermaid\ngraph TD\n  A --> B\n```\n');
    expect(html).toContain('<figure class="mermaid">');
    expect(html).toContain('graph TD');
    // 図を描くための外部スクリプトを引っぱってこない
    expect(html).not.toContain('mermaid.min.js');
    expect(html).not.toContain('data-mermaid=');
  });

  it('本文中の生 HTML は実行せずそのまま見せる', () => {
    const html = render('<script>alert(1)</script>\n\n<b>太字</b>\n');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;太字&lt;/b&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('インラインの生 HTML も literal 表示にする', () => {
    const html = render('文章に <img src=x onerror=alert(1)> を混ぜる\n');
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('renderExportHtml — 画像の埋め込み', () => {
  it('ファイルと同じディレクトリ配下の画像はデータ URI にする', () => {
    mkdirSync(join(dir, 'img'));
    // 1x1 の透明 GIF
    writeFileSync(
      join(dir, 'img', 'a.gif'),
      Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      ),
    );
    const html = render('![図](./img/a.gif)\n');
    expect(html).toContain('src="data:image/gif;base64,');
    expect(html).toContain('alt="図"');
  });

  it('範囲の外に出る画像は元の src のまま残す', () => {
    const html = render('![外](../secret.png)\n');
    expect(html).toContain('src="../secret.png"');
    expect(html).not.toContain('data:image/png');
  });

  it('外部 URL の画像はそのまま残す', () => {
    const html = render('![外](https://example.com/a.png)\n');
    expect(html).toContain('src="https://example.com/a.png"');
  });

  it('embedImages: false なら埋め込まない', () => {
    mkdirSync(join(dir, 'img'));
    writeFileSync(join(dir, 'img', 'a.gif'), Buffer.from('R0lGODlh', 'base64'));
    writeFileSync(file, '![図](./img/a.gif)\n');
    const html = renderExportHtml({
      file,
      content: '![図](./img/a.gif)\n',
      comments: [],
      embedImages: false,
    });
    expect(html).toContain('src="./img/a.gif"');
  });
});

describe('renderExportHtml — コメントの埋め込み', () => {
  it('コメントを対象ブロックの直後に置き、そのブロックに印を付ける', () => {
    const html = render('# 見出し\n\n本文です。\n', [
      comment({
        lineStart: 3,
        lineEnd: 3,
        block_type: 'paragraph',
        context: '本文です。',
      }),
    ]);
    const block = html.slice(html.indexOf('data-line-start="3"'));
    expect(block).toContain('data-commented="true"');
    expect(block.slice(0, block.indexOf('</section>'))).toContain(
      'ここを直してください',
    );
  });

  it('同じコメントを複数ブロックに重複して出さない', () => {
    const html = render('# 見出し\n\n本文です。\n', [
      comment({ lineStart: 1, lineEnd: 3 }),
    ]);
    expect(html.split('ここを直してください').length - 1).toBe(1);
  });

  it('改行を含むコメント本文は改行のまま出す', () => {
    const html = render('# 見出し\n', [comment({ text: '1行目\n2行目' })]);
    expect(html).toContain('1行目<br>2行目');
  });

  it('コメント本文の HTML はエスケープする', () => {
    const html = render('# 見出し\n', [
      comment({ text: '<img src=x onerror=alert(1)>' }),
    ]);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('状態ごとのチップと件数を出す', () => {
    const html = render('# 見出し\n', [
      comment({ id: 'c_1' }),
      comment({ id: 'c_2', resolved: true }),
      comment({ id: 'c_3', lineStart: 99, lineEnd: 99 }),
    ]);
    expect(html).toContain('未解決 1');
    expect(html).toContain('解決済 1');
    expect(html).toContain('削除済 1');
  });

  it('もとの文章スナップショットを details で添える', () => {
    const html = render('# 見出し\n', [
      comment({
        snapshot: {
          startLine: 1,
          before: [],
          target: ['# 見出し'],
          after: ['', '本文'],
        },
      }),
    ]);
    expect(html).toContain('<summary>もとの文章</summary>');
    expect(html).toContain('snapTarget');
  });

  it('本文に紐づかないコメントは末尾にまとめる', () => {
    const html = render('# 見出し\n', [
      comment({ id: 'c_gone', lineStart: 42, lineEnd: 42, text: '消えた対象' }),
    ]);
    expect(html).toContain('本文に紐づかないコメント（1）');
    expect(html.indexOf('消えた対象')).toBeGreaterThan(
      html.indexOf('class="unanchored"'),
    );
  });

  it('差分への指摘は本文ブロックに付けず末尾に回す', () => {
    const html = render('# 見出し\n', [
      comment({
        id: 'c_diff',
        block_type: 'diff',
        text: '差分への指摘',
        context: {
          side: 'new',
          oldLine: null,
          newLine: 1,
          line: '# 見出し',
          hunk: ['# 見出し'],
        },
      }),
    ]);
    expect(html).toContain('本文に紐づかないコメント（1）');
    expect(html).not.toMatch(COMMENTED_BLOCK);
  });

  it('コメントが無ければ末尾セクションも印も出ない', () => {
    const html = render('# 見出し\n');
    expect(html).not.toContain('本文に紐づかないコメント');
    expect(html).not.toMatch(COMMENTED_BLOCK);
  });
});

describe('findOrphanedIds', () => {
  const blocks = [
    { html: '<h1>見出し</h1>', lineStart: 1, lineEnd: 1, type: 'heading' },
    { html: '<p>本文です。</p>', lineStart: 3, lineEnd: 3, type: 'paragraph' },
  ];

  it('開始行が一致するブロックがあれば生きている', () => {
    expect(
      findOrphanedIds(blocks, [comment({ lineStart: 3, lineEnd: 3 })]).size,
    ).toBe(0);
  });

  it('開始行が一致するブロックが無ければ消えた扱い', () => {
    const orphaned = findOrphanedIds(blocks, [
      comment({ id: 'c_x', lineStart: 2, lineEnd: 2 }),
    ]);
    expect(orphaned.has('c_x')).toBe(true);
  });

  it('選択コメントはブロックの表示テキストで照合する', () => {
    const alive = findOrphanedIds(blocks, [
      comment({
        id: 'c_sel',
        block_type: 'selection',
        lineStart: 3,
        lineEnd: 3,
        context: '本文',
      }),
    ]);
    expect(alive.size).toBe(0);

    const gone = findOrphanedIds(blocks, [
      comment({
        id: 'c_sel',
        block_type: 'selection',
        lineStart: 3,
        lineEnd: 3,
        context: '無い文言',
      }),
    ]);
    expect(gone.has('c_sel')).toBe(true);
  });

  it('末尾の … を落として照合する', () => {
    const orphaned = findOrphanedIds(blocks, [
      comment({
        id: 'c_sel',
        block_type: 'selection',
        lineStart: 3,
        lineEnd: 3,
        context: '本文で…',
      }),
    ]);
    expect(orphaned.size).toBe(0);
  });

  it('差分への指摘は判定しない', () => {
    const orphaned = findOrphanedIds(blocks, [
      comment({ id: 'c_diff', block_type: 'diff', lineStart: 99, lineEnd: 99 }),
    ]);
    expect(orphaned.size).toBe(0);
  });
});

// 実物のバンドルは 3MB あり、しかも `dist/` はビルド後にしか無い。
// ここでは「渡された中身を焼き込むか」だけを見たいので偽物を渡す。
const FAKE_BUNDLE = 'globalThis.mermaid = { __fake: true };';

function renderWithMermaid(content: string, bundle = FAKE_BUNDLE): string {
  writeFileSync(file, content);
  return renderExportHtml({
    file,
    content,
    comments: [],
    mermaidBundle: bundle,
    generatedAt: new Date('2026-08-05T12:34:00'),
  });
}

describe('renderExportHtml — Mermaid 描画エンジンの同梱', () => {
  const DIAGRAM = '```mermaid\ngraph TD\n  A --> B\n```\n';

  it('バンドルを渡すと丸ごと焼き込む', () => {
    const html = renderWithMermaid(DIAGRAM);
    expect(html).toContain(FAKE_BUNDLE);
    // 同梱しても外部ホストは参照しない（自己完結の要件は変わらない）
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
  });

  it('描画用のコンテナと待機状態を持たせる', () => {
    const html = renderWithMermaid(DIAGRAM);
    expect(html).toContain('data-mermaid="pending"');
    expect(html).toContain('<div class="mermaidView"></div>');
  });

  it('ソース表示は残す（描画に失敗しても情報が欠けないように）', () => {
    const html = renderWithMermaid(DIAGRAM);
    expect(html).toContain('graph TD');
    expect(html).toContain('<figcaption>Mermaid</figcaption>');
    // 描画できたものだけ CSS でソースを畳む
    expect(html).toContain(
      'figure.mermaid[data-mermaid="done"] pre{display:none}',
    );
  });

  it('図が 1 つも無ければ 3MB を積まない', () => {
    const html = renderWithMermaid('# 見出し\n\n図はありません。\n');
    expect(html).not.toContain(FAKE_BUNDLE);
    expect(html).not.toContain('data-mermaid=');
  });

  it('バンドルを渡さなければ同梱しない（既定）', () => {
    const html = render(DIAGRAM);
    expect(html).not.toContain('mermaidView');
  });

  it('バンドル内の </script> でスクリプトが途切れない', () => {
    const evil = 'var s = "</script><img src=x onerror=alert(1)>";';
    const html = renderWithMermaid(DIAGRAM, evil);
    expect(html).not.toContain('</script><img');
    expect(html).toContain('<\\/script>');
  });
});

describe('inlineScriptSafe', () => {
  it('閉じタグだけをエスケープし、JS としての意味は変えない', () => {
    expect(inlineScriptSafe('a = "</script>";')).toBe('a = "<\\/script>";');
    expect(inlineScriptSafe('a = "</SCRIPT >";')).toBe('a = "<\\/SCRIPT >";');
  });

  it('関係ない < や / はそのまま', () => {
    expect(inlineScriptSafe('a < b / c')).toBe('a < b / c');
    expect(inlineScriptSafe('</div>')).toBe('</div>');
  });
});
