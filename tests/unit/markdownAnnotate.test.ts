import { describe, expect, it } from 'vitest';
import type { Comment } from '../../src/client/types.ts';
import { annotateMarkdown } from '../../src/markdownAnnotate.ts';

const FILE = '/tmp/nymph-annotate/doc.md';

function annotate(
  content: string,
  comments: Comment[] = [],
  over: Partial<Parameters<typeof annotateMarkdown>[0]> = {},
) {
  return annotateMarkdown({
    file: FILE,
    content,
    comments,
    generatedAt: new Date('2026-08-09T12:34:00'),
    ...over,
  });
}

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

const DOC = '# 見出し\n\n本文です。\n\n次の段落。\n';

describe('annotateMarkdown — 挿し込む場所', () => {
  it('コメントを対象ブロックの直後に置く', () => {
    const { markdown } = annotate(DOC, [comment()]);
    expect(markdown).toContain(
      '本文です。\n\n> [nymph] 未解決 · L3\n>\n> ここを直してください\n\n次の段落。',
    );
  });

  it('本文の行は書き換えない（足すのは引用と区切りの空行だけ）', () => {
    const { markdown } = annotate(DOC, [comment()]);
    const kept = markdown
      .split('\n')
      .filter((l) => !l.startsWith('>') && !l.startsWith('<!-- nymph:'))
      .join('\n')
      // 引用を区切るために足した空行だけは増える（連続した空行を畳んで比べる）
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    expect(kept).toBe(DOC.trim());
  });

  it('引用の前後には必ず空行を置く（本文が引用に吸われないように）', () => {
    // 見出しの直後に本文が続く（空行が無い）文書
    const { markdown } = annotate('# 見出し\n本文です。\n', [
      comment({ lineStart: 1, lineEnd: 1, block_type: 'heading' }),
    ]);
    expect(markdown).toBe(
      [
        '# 見出し',
        '',
        '> [nymph] 未解決 · L1',
        '>',
        '> ここを直してください',
        '',
        '本文です。',
        '',
        '<!-- nymph: 2026-08-09 12:34 出力 · コメント 1 件（未解決 1 / 削除済 0 / 解決済 0） -->',
        '',
      ].join('\n'),
    );
  });

  it('同じブロックの複数コメントは別々の引用として並べる', () => {
    const { markdown } = annotate(DOC, [
      comment({ id: 'c_1', text: '1件目' }),
      comment({ id: 'c_2', text: '2件目' }),
    ]);
    expect(markdown).toContain('> 1件目\n\n> [nymph] 未解決 · L3\n>\n> 2件目');
  });

  it('同じコメントを複数ブロックに重複して出さない', () => {
    const { markdown } = annotate(DOC, [comment({ lineStart: 1, lineEnd: 5 })]);
    expect(markdown.split('ここを直してください').length - 1).toBe(1);
  });

  it('コードブロックの直後にも置ける（フェンスの内側に入れない）', () => {
    const src = '```ts\nconst a = 1;\n```\n\n本文。\n';
    const { markdown } = annotate(src, [
      comment({
        lineStart: 1,
        lineEnd: 3,
        block_type: 'code',
        context: { lang: 'ts', code: 'const a = 1;' },
        text: 'ここは const で良い?',
      }),
    ]);
    expect(markdown).toContain('```\n\n> [nymph] 未解決 · L1-3');
    expect(markdown.indexOf('> [nymph]')).toBeGreaterThan(
      markdown.lastIndexOf('```'),
    );
  });
});

describe('annotateMarkdown — 引用の中身', () => {
  it('ヘッダーに状態・行範囲・ラウンド・日時を出す', () => {
    const { markdown } = annotate(DOC, [
      comment({
        lineStart: 3,
        lineEnd: 5,
        round: 2,
        createdAt: '2026-08-09T10:20:00',
      }),
    ]);
    expect(markdown).toContain(
      '> [nymph] 未解決 · L3-5 · ラウンド 2 · 2026-08-09 10:20',
    );
  });

  it('ラウンド 0 と日時なしは出さない', () => {
    const { markdown } = annotate(DOC, [comment({ round: 0 })]);
    expect(markdown).toContain('> [nymph] 未解決 · L3\n');
    expect(markdown).not.toContain('ラウンド');
  });

  it('解決済み・対象が消えたものは状態が変わる', () => {
    const { markdown } = annotate(DOC, [
      comment({ id: 'c_r', resolved: true, text: '直しました' }),
      comment({ id: 'c_d', lineStart: 99, lineEnd: 99, text: '消えた対象' }),
    ]);
    expect(markdown).toContain('> [nymph] 解決済 · L3');
    expect(markdown).toContain('> [nymph] 削除済 · L99');
  });

  it('段落・見出しへの指摘には「対象」を添えない（直前が本文そのもの）', () => {
    const { markdown } = annotate(DOC, [comment()]);
    expect(markdown).not.toContain('対象:');
  });

  it('選択・コードへの指摘には「対象」を添える', () => {
    const { markdown } = annotate(DOC, [
      comment({
        block_type: 'selection',
        context: '本文で',
        selection_offset: 0,
      }),
    ]);
    expect(markdown).toContain('> 対象: 本文で');
  });

  it('複数行のコメント本文は行ごとに引用する', () => {
    const { markdown } = annotate(DOC, [comment({ text: '1行目\n\n3行目' })]);
    expect(markdown).toContain('> 1行目\n>\n> 3行目');
  });

  it('コメント本文の Markdown はそのまま残す（読み手が書いた形を壊さない）', () => {
    const { markdown } = annotate(DOC, [
      comment({ text: '- 箇条書き\n- **強調**' }),
    ]);
    expect(markdown).toContain('> - 箇条書き\n> - **強調**');
  });
});

describe('annotateMarkdown — 本文に紐づかないコメント', () => {
  it('対象が消えた指摘は末尾セクションへ回す', () => {
    const { markdown } = annotate(DOC, [
      comment({ id: 'c_gone', lineStart: 99, lineEnd: 99, text: '消えた対象' }),
    ]);
    expect(markdown).toContain('## 本文に紐づかないコメント（1）');
    expect(markdown.indexOf('消えた対象')).toBeGreaterThan(
      markdown.indexOf('## 本文に紐づかないコメント'),
    );
  });

  it('差分への指摘も末尾セクションへ回す', () => {
    const { markdown } = annotate(DOC, [
      comment({
        id: 'c_diff',
        block_type: 'diff',
        lineStart: 3,
        lineEnd: 3,
        text: '差分への指摘',
        context: {
          side: 'new',
          oldLine: null,
          newLine: 3,
          line: '本文です。',
          hunk: ['本文です。'],
        },
      }),
    ]);
    const idx = markdown.indexOf('## 本文に紐づかないコメント');
    expect(idx).toBeGreaterThan(-1);
    expect(markdown.indexOf('差分への指摘')).toBeGreaterThan(idx);
    // 差分コメントは対象行を持たないので「対象」を添える
    expect(markdown).toContain('> 対象: 本文です。');
  });

  it('紐づかないコメントが無ければセクションを出さない', () => {
    const { markdown } = annotate(DOC, [comment()]);
    expect(markdown).not.toContain('本文に紐づかないコメント');
  });
});

describe('annotateMarkdown — 末尾の素性', () => {
  it('出力日時と件数を HTML コメントで残す', () => {
    const { markdown } = annotate(DOC, [comment()], { round: 3 });
    expect(markdown).toContain(
      '<!-- nymph: 2026-08-09 12:34 出力 · コメント 1 件（未解決 1 / 削除済 0 / 解決済 0） · ラウンド 3 -->',
    );
  });

  it('末尾は改行 1 つで終える', () => {
    const { markdown } = annotate(DOC, [comment()]);
    expect(markdown.endsWith(' -->\n')).toBe(true);
  });

  it('コメントが 1 件も無くても本文は壊さない', () => {
    const { markdown, written } = annotate(DOC, []);
    expect(written).toBe(0);
    expect(markdown.startsWith(DOC.trim())).toBe(true);
  });
});

describe('annotateMarkdown — includeResolved', () => {
  const comments = [
    comment({ id: 'c_open', text: '未解決の指摘' }),
    comment({ id: 'c_done', resolved: true, text: '解決済みの指摘' }),
  ];

  it('既定では解決済みも書き戻す', () => {
    const result = annotate(DOC, comments);
    expect(result.markdown).toContain('解決済みの指摘');
    expect(result.written).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.counts).toEqual({ open: 1, deleted: 0, resolved: 1 });
  });

  it('false なら解決済みを落として件数に残す', () => {
    const result = annotate(DOC, comments, { includeResolved: false });
    expect(result.markdown).not.toContain('解決済みの指摘');
    expect(result.markdown).toContain('未解決の指摘');
    expect(result.written).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.markdown).toContain('解決済 1 件は除外');
  });
});
