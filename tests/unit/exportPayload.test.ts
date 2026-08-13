/**
 * 画面からのエクスポート（`GET /export`）が返す中身の単体検証。
 *
 * 見ているのは「CLI と同じものが出るか」と「形式ごとの器（ファイル名・
 * Content-Type・BOM・Mermaid 同梱）が正しいか」の 2 点。組み立てそのものの
 * 詳細は htmlExport / markdownAnnotate / csvExport 側のテストが持つ。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Comment } from '../../src/client/types.ts';
import { exportToFile } from '../../src/exportCommand.ts';
import {
  buildExportPayload,
  contentDisposition,
} from '../../src/exportPayload.ts';
import { writeComments } from '../../src/reviewStore.ts';

const TMP_DIR = join(tmpdir(), `nymph-export-payload-${process.pid}`);
const FILES_DIR = join(TMP_DIR, 'files');

// reviewStore は XDG_DATA_HOME を見るので、本物の ~/.local/share を汚さない
beforeEach(() => {
  mkdirSync(FILES_DIR, { recursive: true });
  process.env.XDG_DATA_HOME = TMP_DIR;
});

afterEach(() => {
  delete process.env.XDG_DATA_HOME;
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeMd(name: string, content: string): string {
  const p = join(FILES_DIR, name);
  writeFileSync(p, content);
  return p;
}

function sampleComment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c_abc123',
    lineStart: 1,
    lineEnd: 1,
    block_type: 'heading',
    context: '# 見出し',
    text: '指摘です',
    ...over,
  };
}

describe('buildExportPayload', () => {
  it('HTML: 本文とコメントを焼き込んだ 1 枚を返す', () => {
    const md = makeMd('a.md', '# 見出し\n\n本文\n');
    writeComments(md, [sampleComment()]);

    const payload = buildExportPayload(md, 'html');

    expect(payload.filename).toBe('a-review.html');
    expect(payload.contentType).toBe('text/html; charset=utf-8');
    expect(payload.body).toContain('<!doctype html>');
    expect(payload.body).toContain('見出し');
    expect(payload.body).toContain('指摘です');
  });

  it('Markdown: コメントを引用として書き戻した本文を返す', () => {
    const md = makeMd('a.md', '# 見出し\n\n本文\n');
    writeComments(md, [sampleComment()]);

    const payload = buildExportPayload(md, 'md');

    expect(payload.filename).toBe('a-review.md');
    expect(payload.contentType).toBe('text/markdown; charset=utf-8');
    expect(payload.body).toContain('# 見出し');
    expect(payload.body).toContain('> [nymph]');
    expect(payload.body).toContain('指摘です');
  });

  it('CSV: 見出し行とコメント行を返し、既定で BOM を付ける', () => {
    const md = makeMd('a.md', '# 見出し\n\n本文\n');
    writeComments(md, [sampleComment()]);

    const payload = buildExportPayload(md, 'csv');

    expect(payload.filename).toBe('a-review.csv');
    expect(payload.contentType).toBe('text/csv; charset=utf-8');
    // 画面から落とした CSV の行き先はほぼ表計算ソフト。Excel が UTF-8 と
    // 判定できるよう、CLI の既定（BOM 無し）を反転させている。
    expect(payload.body.startsWith('﻿')).toBe(true);
    expect(payload.body).toContain('file,id,status');
    expect(payload.body).toContain('指摘です');
  });

  it('CSV: bom: false で BOM を外せる', () => {
    const md = makeMd('a.md', '# 見出し\n');
    const payload = buildExportPayload(md, 'csv', { bom: false });
    expect(payload.body.startsWith('﻿')).toBe(false);
  });

  it('コメントが 0 件でも書き出せる', () => {
    const md = makeMd('a.md', '# 見出し\n\n本文\n');
    for (const format of ['html', 'md', 'csv'] as const) {
      const payload = buildExportPayload(md, format);
      expect(payload.body.length).toBeGreaterThan(0);
    }
  });

  it('ファイル名の .md を落として -review を挟む（元ファイルと取り違えない）', () => {
    const md = makeMd('設計書.md', '# 見出し\n');
    expect(buildExportPayload(md, 'md').filename).toBe('設計書-review.md');
  });

  // CLI が書き出すファイルと同じ中身であることが、この経路の存在理由。
  // どちらかにだけ手が入って中身が分岐したらここで落ちる。
  it('HTML は CLI の --export と同じ中身になる', () => {
    const md = makeMd('a.md', '# 見出し\n\n本文\n\n- 箇条書き\n');
    writeComments(md, [sampleComment(), sampleComment({ id: 'c_2' })]);
    const generatedAt = new Date('2026-01-02T03:04:00');

    const fromScreen = buildExportPayload(md, 'html', { generatedAt }).body;
    const out = join(TMP_DIR, 'cli.html');
    exportToFile(md, out, { generatedAt });

    expect(fromScreen).toBe(readFileSync(out, 'utf-8'));
  });

  describe('Mermaid の同梱', () => {
    const MERMAID_DOC = '# 図\n\n```mermaid\ngraph TD;A-->B;\n```\n';

    it('図があり loadMermaidBundle が渡されたときだけ焼き込む', () => {
      const md = makeMd('a.md', MERMAID_DOC);
      const payload = buildExportPayload(md, 'html', {
        loadMermaidBundle: () => 'window.mermaid=MERMAID_BUNDLE_MARKER;',
      });
      expect(payload.body).toContain('MERMAID_BUNDLE_MARKER');
    });

    it('loadMermaidBundle を渡さなければ焼き込まない（既定）', () => {
      const md = makeMd('a.md', MERMAID_DOC);
      const payload = buildExportPayload(md, 'html');
      expect(payload.body).not.toContain('MERMAID_BUNDLE_MARKER');
      // ソース表示は残る（描画エンジン無しでも情報が欠けない）
      expect(payload.body).toContain('graph TD;A--&gt;B;');
    });

    it('図が 1 つも無い文書では 3MB のバンドルを読みに行かない', () => {
      const md = makeMd('a.md', '# 見出し\n\n本文\n');
      let loaded = 0;
      buildExportPayload(md, 'html', {
        loadMermaidBundle: () => {
          loaded++;
          return 'window.mermaid=1;';
        },
      });
      expect(loaded).toBe(0);
    });
  });
});

describe('contentDisposition', () => {
  it('attachment とファイル名を返す', () => {
    expect(contentDisposition('a-review.html')).toBe(
      `attachment; filename="a-review.html"; filename*=UTF-8''a-review.html`,
    );
  });

  it('日本語のファイル名は filename* に載せ、素の filename は ASCII に落とす', () => {
    const value = contentDisposition('設計書-review.md');
    expect(value).toContain(
      `filename*=UTF-8''${encodeURIComponent('設計書-review.md')}`,
    );
    expect(value).toContain('filename="___-review.md"');
  });

  it('ヘッダを壊す引用符やバックスラッシュを素の filename に残さない', () => {
    const value = contentDisposition('a"b\\c-review.csv');
    expect(value).toContain('filename="a_b_c-review.csv"');
  });
});
