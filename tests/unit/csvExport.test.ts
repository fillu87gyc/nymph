import { describe, expect, it } from 'vitest';
import type { Comment } from '../../src/client/types.ts';
import {
  buildCommentRows,
  CSV_COLUMNS,
  csvField,
  renderCommentsCsv,
  toCsv,
} from '../../src/csvExport.ts';

const FILE = '/tmp/nymph-csv/doc.md';
const DOC = '# 見出し\n\n本文です。\n';

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: 'c_aaa111',
    lineStart: 3,
    lineEnd: 3,
    block_type: 'paragraph',
    context: '本文です。',
    text: 'ここを直してください',
    ...over,
  };
}

function rows(comments: Comment[]): string[][] {
  return buildCommentRows({ file: FILE, content: DOC, comments });
}

describe('csvField', () => {
  it('普通の値はそのまま', () => {
    expect(csvField('本文')).toBe('本文');
  });

  it('カンマ・引用符・改行を含む値は引用する', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('1行目\n2行目')).toBe('"1行目\n2行目"');
    expect(csvField('言"葉"')).toBe('"言""葉"""');
  });

  it('数式として解釈されうる値は無害化する', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('@name')).toBe("'@name");
  });

  it('箇条書きの - は潰さない（数式にはならないため）', () => {
    expect(csvField('- 箇条書き')).toBe('- 箇条書き');
  });
});

describe('toCsv', () => {
  it('行末は CRLF で、末尾も改行で終える', () => {
    expect(toCsv([['a', 'b'], ['c']])).toBe('a,b\r\nc\r\n');
  });
});

describe('buildCommentRows', () => {
  it('1 コメント = 1 行にする', () => {
    expect(
      rows([comment({ round: 2, createdAt: '2026-08-09T10:20:00.000Z' })]),
    ).toEqual([
      [
        'doc.md',
        'c_aaa111',
        'open',
        '3',
        '3',
        'paragraph',
        '2',
        '2026-08-09T10:20:00.000Z',
        '本文です。',
        'ここを直してください',
      ],
    ]);
  });

  it('状態は他の出力と同じ規則で決める', () => {
    const statuses = rows([
      comment({ id: 'c_1' }),
      comment({ id: 'c_2', resolved: true }),
      comment({ id: 'c_3', lineStart: 99, lineEnd: 99 }),
    ]).map((r) => r[2]);
    expect(statuses).toEqual(['open', 'resolved', 'deleted']);
  });

  it('round / createdAt が無いコメントは空欄にする', () => {
    const [row] = rows([comment()]);
    expect(row[6]).toBe('');
    expect(row[7]).toBe('');
  });

  it('表・コード・差分の対象は 1 行に潰す', () => {
    const [table] = rows([
      comment({
        block_type: 'table',
        context: { headers: ['A', 'B'], rows: [] },
      }),
    ]);
    expect(table[8]).toBe('A | B');

    const [code] = rows([
      comment({
        block_type: 'code',
        context: { lang: 'ts', code: 'const a = 1;\nconst b = 2;' },
      }),
    ]);
    expect(code[8]).toBe('const a = 1;');
  });

  it('整数 ID の既存コメントも文字列として出す', () => {
    const [row] = rows([comment({ id: 7 })]);
    expect(row[1]).toBe('7');
  });
});

describe('renderCommentsCsv', () => {
  it('見出し行を先頭に付ける', () => {
    const csv = renderCommentsCsv({ file: FILE, content: DOC, comments: [] });
    expect(csv).toBe(`${CSV_COLUMNS.join(',')}\r\n`);
  });

  it('本文にカンマや改行があっても行が壊れない', () => {
    const csv = renderCommentsCsv({
      file: FILE,
      content: DOC,
      comments: [comment({ text: '前半, 後半\n2行目' })],
    });
    // 見出し + データ 1 行（引用の中の改行は行数に数えない）
    expect(csv.split('\r\n').filter((l) => l.startsWith('doc.md')).length).toBe(
      1,
    );
    expect(csv).toContain('"前半, 後半\n2行目"');
  });

  it('bom: true で BOM を先頭に付ける', () => {
    const csv = renderCommentsCsv({
      file: FILE,
      content: DOC,
      comments: [],
      bom: true,
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith('file,id,status')).toBe(true);
  });

  it('既定では BOM を付けない（そのままパイプできるように）', () => {
    const csv = renderCommentsCsv({ file: FILE, content: DOC, comments: [] });
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });
});
