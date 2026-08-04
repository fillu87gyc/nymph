import { describe, expect, it } from 'vitest';
import {
  computeDocStats,
  extractDiagrams,
  extractLinks,
  extractTasks,
  findTermLines,
  linkCategory,
  parseFrontmatter,
  relativeTargets,
  stripInlineMarkup,
} from '../../src/client/lib/docScan.ts';

describe('extractTasks', () => {
  it('チェックボックスを行番号つきで集める', () => {
    const src = ['# T', '', '- [ ] やること', '- [x] 済んだこと'].join('\n');
    expect(extractTasks(src)).toEqual([
      { line: 3, done: false, text: 'やること', depth: 0 },
      { line: 4, done: true, text: '済んだこと', depth: 0 },
    ]);
  });

  it('大文字の [X] も完了として扱う', () => {
    expect(extractTasks('- [X] done')[0].done).toBe(true);
  });

  it('入れ子の深さをインデント 2 スペース単位で数える', () => {
    const src = '- [ ] 親\n  - [ ] 子\n    - [ ] 孫';
    expect(extractTasks(src).map((t) => t.depth)).toEqual([0, 1, 2]);
  });

  it('* と + の箇条書きも拾う', () => {
    expect(extractTasks('* [ ] a\n+ [ ] b')).toHaveLength(2);
  });

  it('コードブロックの中は拾わない', () => {
    const src = ['```md', '- [ ] コード例', '```', '- [ ] 本物'].join('\n');
    const tasks = extractTasks(src);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe('本物');
  });

  it('チェックボックスでない箇条書きは拾わない', () => {
    expect(extractTasks('- ふつうの項目')).toEqual([]);
  });

  it('リンクや強調の記号はラベルから落とす', () => {
    expect(extractTasks('- [ ] **[docs](./a.md)** を書く')[0].text).toBe(
      'docs を書く',
    );
  });
});

describe('linkCategory', () => {
  it('スキーム付きは外部', () => {
    expect(linkCategory('https://example.com')).toBe('external');
    expect(linkCategory('mailto:a@example.com')).toBe('external');
    expect(linkCategory('//example.com/x')).toBe('external');
  });

  it('# 始まりはアンカー', () => {
    expect(linkCategory('#section')).toBe('anchor');
  });

  it('それ以外は相対パス', () => {
    expect(linkCategory('./docs/a.md')).toBe('relative');
    expect(linkCategory('img/a.png')).toBe('relative');
  });
});

describe('extractLinks', () => {
  it('リンクと画像を種別つきで集める', () => {
    const src = [
      '[外部](https://example.com) と ![図](./img/a.png)',
      '',
      '[章へ](#sec)',
    ].join('\n');
    expect(extractLinks(src)).toEqual([
      {
        line: 1,
        column: 0,
        kind: 'link',
        label: '外部',
        target: 'https://example.com',
        category: 'external',
      },
      {
        line: 1,
        column: src.indexOf('!['),
        kind: 'image',
        label: '図',
        target: './img/a.png',
        category: 'relative',
      },
      {
        line: 3,
        column: 0,
        kind: 'link',
        label: '章へ',
        target: '#sec',
        category: 'anchor',
      },
    ]);
  });

  it('同じ行に複数あるリンクは桁で区別できる', () => {
    const links = extractLinks('[a](./a.md) [b](./b.md)');
    expect(links.map((l) => l.column)).toEqual([0, 12]);
  });

  it('タイトル付きリンクの行き先だけを取る', () => {
    expect(extractLinks('[a](./b.md "タイトル")')[0].target).toBe('./b.md');
  });

  it('コードブロックとインラインコードの中は拾わない', () => {
    const src = ['```', '[a](./a.md)', '```', '`[b](./b.md)`'].join('\n');
    expect(extractLinks(src)).toEqual([]);
  });

  it('空リンク（[]()）は拾わない', () => {
    expect(extractLinks('[空]()')).toEqual([]);
  });

  it('相対リンクの行き先だけを重複なしで返す', () => {
    const src = '[a](./a.md) [a2](./a.md) [x](https://e.com) [s](#s)';
    expect(relativeTargets(extractLinks(src))).toEqual(['./a.md']);
  });
});

describe('extractDiagrams', () => {
  it('mermaid ブロックを行番号・種類つきで集める', () => {
    const src = [
      '# Doc',
      '',
      '```mermaid',
      'graph TD; A-->B',
      '```',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '```mmd',
      'sequenceDiagram',
      '  A->>B: hi',
      '```',
    ].join('\n');
    const diagrams = extractDiagrams(src);
    expect(diagrams).toHaveLength(2);
    expect(diagrams[0]).toMatchObject({
      line: 3,
      lang: 'mermaid',
      kind: 'graph',
    });
    expect(diagrams[1]).toMatchObject({
      line: 11,
      lang: 'mmd',
      kind: 'sequenceDiagram',
    });
    expect(diagrams[1].preview).toBe('sequenceDiagram / A->>B: hi');
  });

  it('先頭が %% コメントなら種類は空になる', () => {
    const src = '```mermaid\n%% memo\ngraph TD; A-->B\n```';
    expect(extractDiagrams(src)[0].kind).toBe('');
  });

  it('図が無ければ空配列', () => {
    expect(extractDiagrams('# only text')).toEqual([]);
  });
});

describe('computeDocStats', () => {
  const src = [
    '# 見出し',
    '',
    'Some text with [link](./a.md) and ![img](./b.png).',
    '',
    '## 小見出し',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '```ts',
    'const x = 1;',
    '```',
    '',
    '- [ ] やること',
    '- [x] 済んだ',
  ].join('\n');

  it('見出し・コードブロック・表を数える', () => {
    const s = computeDocStats(src);
    expect(s.headings).toBe(2);
    expect(s.codeBlocks).toBe(1);
    expect(s.tables).toBe(1);
  });

  it('リンク・画像・タスクを数える', () => {
    const s = computeDocStats(src);
    expect(s.links).toBe(1);
    expect(s.images).toBe(1);
    expect(s.tasks).toBe(2);
    expect(s.doneTasks).toBe(1);
  });

  it('文字数・行数を数える', () => {
    const s = computeDocStats('あい\nうえお');
    expect(s.chars).toBe(6);
    expect(s.charsNoSpace).toBe(5);
    expect(s.lines).toBe(2);
  });

  it('読了時間は 0 分にせず最低 1 分', () => {
    expect(computeDocStats('a').readingMinutes).toBe(1);
  });

  it('日本語の長文は文字数から読了時間を見積もる', () => {
    // 500 字/分 なので 1500 字は約 3 分
    expect(computeDocStats('あ'.repeat(1500)).readingMinutes).toBe(3);
  });

  it('空文字はすべて 0（読了時間だけ 1 分）', () => {
    const s = computeDocStats('');
    expect(s.chars).toBe(0);
    expect(s.lines).toBe(0);
    expect(s.headings).toBe(0);
    expect(s.readingMinutes).toBe(1);
  });
});

describe('parseFrontmatter', () => {
  it('先頭の YAML をキーと値に分ける', () => {
    const src = [
      '---',
      'title: 設計メモ',
      'status: draft',
      '---',
      '# 本文',
    ].join('\n');
    expect(parseFrontmatter(src)).toEqual({
      fields: [
        { key: 'title', value: '設計メモ' },
        { key: 'status', value: 'draft' },
      ],
      lineCount: 4,
    });
  });

  it('入れ子・配列は直前のキーへ畳む', () => {
    const src = ['---', 'tags:', '  - a', '  - b', '---', ''].join('\n');
    expect(parseFrontmatter(src)?.fields).toEqual([
      { key: 'tags', value: 'a, b' },
    ]);
  });

  it('frontmatter が無ければ null', () => {
    expect(parseFrontmatter('# 見出し\n\n---\n')).toBeNull();
  });

  it('閉じの --- が無ければ frontmatter とみなさない', () => {
    expect(parseFrontmatter('---\ntitle: x\n')).toBeNull();
  });

  it('frontmatter の中身は本文の走査対象から外れる', () => {
    const src = ['---', 'title: "- [ ] not a task"', '---', '- [ ] 本物'].join(
      '\n',
    );
    expect(extractTasks(src)).toHaveLength(1);
  });
});

describe('findTermLines', () => {
  const src = [
    '# nymph とは',
    '',
    'nymph は Markdown レビューツール。',
    '',
    '```',
    'nymph',
    '```',
  ].join('\n');

  it('用語が現れる行を大文字小文字を無視して返す', () => {
    expect(findTermLines(src, 'Nymph')).toEqual([1, 3]);
  });

  it('別名も対象にする', () => {
    expect(findTermLines('別名テスト', 'nymph', ['別名'])).toEqual([1]);
  });

  it('コードブロックの中は数えない', () => {
    expect(findTermLines(src, 'nymph')).not.toContain(6);
  });

  it('空の用語では何も返さない', () => {
    expect(findTermLines(src, '  ')).toEqual([]);
  });
});

describe('stripInlineMarkup', () => {
  it('強調・コード・リンクの記号を落とす', () => {
    expect(stripInlineMarkup('**太字** と `code` と [x](./a.md)')).toBe(
      '太字 と code と x',
    );
  });
});
