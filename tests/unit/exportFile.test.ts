/**
 * 画面からのエクスポートで使う形式定義とファイル名付け。
 *
 * サーバー（Content-Disposition）とクライアント（<a download>）が同じ名前を
 * 付けることが前提なので、規則をここで固定する。
 */
import { describe, expect, it } from 'vitest';
import { exportUrl } from '../../src/client/hooks/useExport.ts';
import {
  EXPORT_CONTENT_TYPE,
  EXPORT_FORMATS,
  exportFilename,
  isExportFormat,
} from '../../src/client/lib/exportFile.ts';

describe('isExportFormat', () => {
  it('html / md / csv だけを受け付ける', () => {
    for (const f of EXPORT_FORMATS) expect(isExportFormat(f)).toBe(true);
  });

  it('未知の値を弾く（クエリパラメータの検証に使う）', () => {
    for (const v of ['pdf', 'HTML', '', null, undefined, 1, {}]) {
      expect(isExportFormat(v)).toBe(false);
    }
  });

  it('すべての形式に Content-Type がある', () => {
    for (const f of EXPORT_FORMATS) expect(EXPORT_CONTENT_TYPE[f]).toBeTruthy();
  });
});

describe('exportFilename', () => {
  it('.md を落として -review を挟む', () => {
    expect(exportFilename('sample.md', 'html')).toBe('sample-review.html');
    expect(exportFilename('sample.md', 'md')).toBe('sample-review.md');
    expect(exportFilename('sample.md', 'csv')).toBe('sample-review.csv');
  });

  it('.markdown / 大文字の拡張子も落とす', () => {
    expect(exportFilename('a.markdown', 'html')).toBe('a-review.html');
    expect(exportFilename('a.MD', 'html')).toBe('a-review.html');
  });

  it('.md 以外の拡張子は残す（別物と分かるようにする）', () => {
    expect(exportFilename('notes.txt', 'html')).toBe('notes.txt-review.html');
  });

  it('名前を含むドットを消さない', () => {
    expect(exportFilename('v1.2.spec.md', 'md')).toBe('v1.2.spec-review.md');
  });

  it('名前が空でも拡張子だけのファイル名にしない', () => {
    expect(exportFilename('', 'csv')).toBe('export-review.csv');
    expect(exportFilename('.md', 'csv')).toBe('export-review.csv');
  });
});

describe('exportUrl', () => {
  it('file と format をクエリに載せる', () => {
    expect(exportUrl('/tmp/a b.md', 'html')).toBe(
      '/export?file=%2Ftmp%2Fa+b.md&format=html',
    );
  });

  it('mermaid は HTML かつ選択時だけ付ける（既定は同梱しない）', () => {
    expect(exportUrl('/a.md', 'html', { mermaid: true })).toContain(
      'mermaid=1',
    );
    expect(exportUrl('/a.md', 'html')).not.toContain('mermaid');
    expect(exportUrl('/a.md', 'md', { mermaid: true })).not.toContain(
      'mermaid',
    );
  });
});
