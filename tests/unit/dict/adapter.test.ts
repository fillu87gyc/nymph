import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { extractEntries } from '../../../src/dict/adapters/markdown.ts';

const glossaryMd = `# ドメイン用語集

## ユビキタス言語

### 集約

集約とは、整合性を保つべきオブジェクトの集まりである。

### リポジトリ

リポジトリとは、集約の永続化と再構築を担うオブジェクトである。

## その他

### エンティティ

エンティティとは、同一性を持つドメインオブジェクトである。
`;

const caseARules = {
  term: "h2:contains('ユビキタス言語') > h3",
  definition: 'term > p',
};

describe('markdown adapter', () => {
  test('ケース A: 集約とリポジトリが抽出される', () => {
    const entries = extractEntries(glossaryMd, caseARules);
    expect(entries.length).toBe(2);
    const terms = entries.map((e) => e.term);
    expect(terms).toContain('集約');
    expect(terms).toContain('リポジトリ');
  });

  test('エンティティ（その他配下）は含まない', () => {
    const entries = extractEntries(glossaryMd, caseARules);
    const terms = entries.map((e) => e.term);
    expect(terms).not.toContain('エンティティ');
  });

  test('definition フィールドがプレーンテキストを含む', () => {
    const entries = extractEntries(glossaryMd, caseARules);
    const shuuyaku = entries.find((e) => e.term === '集約');
    expect(shuuyaku).toBeDefined();
    expect(shuuyaku?.definition).toContain('集約とは');
    expect(shuuyaku?.definition).not.toContain('<');
  });

  test('definitionHtml フィールドが HTML を含む', () => {
    const entries = extractEntries(glossaryMd, caseARules);
    const shuuyaku = entries.find((e) => e.term === '集約');
    expect(shuuyaku?.definitionHtml).toContain('<p>');
  });

  test('aliases が空配列（エイリアスなし）', () => {
    const entries = extractEntries(glossaryMd, caseARules);
    const shuuyaku = entries.find((e) => e.term === '集約');
    expect(shuuyaku?.aliases).toEqual([]);
  });

  test('エイリアス付き用語のパース', () => {
    const md = `## 用語集\n### 集約（Aggregate）\n集約とは...\n`;
    const rules = { term: 'h2 > h3', definition: 'term > p' };
    const entries = extractEntries(md, rules);
    expect(entries[0].term).toBe('集約');
    expect(entries[0].aliases).toContain('Aggregate');
  });

  test('ケース B: h2 セレクタで複数エントリ', () => {
    const md = `## 集約\n\n集約とは...\n\n## リポジトリ\n\nリポジトリとは...\n`;
    const rules = { term: 'h2', definition: 'term > p' };
    const entries = extractEntries(md, rules);
    expect(entries.length).toBe(2);
  });

  test('definition が複数ブロックの場合は連結される', () => {
    const md = `## 用語集\n### 集約\n\nFirst para.\n\nSecond para.\n`;
    const rules = { term: 'h2 > h3', definition: 'term > p' };
    const entries = extractEntries(md, rules);
    expect(entries[0].definition).toContain('First para');
    expect(entries[0].definition).toContain('Second para');
  });
});
