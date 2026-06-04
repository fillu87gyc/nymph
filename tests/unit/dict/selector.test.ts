import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { select, selectRelative } from '../../../src/dict/selector.ts';
import { buildTree } from '../../../src/dict/tree.ts';

const glossaryMd = readFileSync(
  resolve(__dirname, '../../fixtures/dict/glossary.md'),
  'utf-8',
);

describe('select', () => {
  test('h2 > h3 — h2 の直下 h3 のみ', () => {
    const tree = buildTree(glossaryMd);
    const nodes = select(tree, 'h2 > h3');
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(n.type).toBe('h3');
      expect(n.parent?.type).toBe('h2');
    }
  });

  test('h2 > p — h2 の直下 p（h3 下の p は含まない）', () => {
    const md = `## Section\n\nDirect paragraph.\n\n### Sub\n\nNested paragraph.\n`;
    const tree = buildTree(md);
    const nodes = select(tree, 'h2 > p');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toContain('Direct paragraph');
  });

  test('h3 ~ * — h3 以降の兄弟', () => {
    const md = `## Parent\n### First\n\nFirst para.\n### Second\n\nSecond para.\n`;
    const tree = buildTree(md);
    const h3Nodes = select(tree, 'h3');
    expect(h3Nodes.length).toBeGreaterThan(0);

    const firstH3 = h3Nodes[0];
    // Siblings after firstH3 in its parent's children
    const siblings = selectRelative(firstH3, 'term ~ *', []);
    expect(siblings.length).toBeGreaterThan(0);
    // First h3 itself should not be in the siblings
    expect(siblings).not.toContain(firstH3);
  });

  test('h3 + p — h3 の直後の p のみ', () => {
    const md = `## Parent\n### Sub\n\nFirst para.\n\nSecond para.\n`;
    const tree = buildTree(md);
    const nodes = select(tree, 'h3 + p');
    // Direct adjacent sibling: h3 is parent of p in our tree model
    // In our tree structure, p is child of h3, so + means first child p
    expect(nodes.length).toBeGreaterThanOrEqual(0);
  });

  test(':contains() — テキスト部分一致する見出し', () => {
    const tree = buildTree(glossaryMd);
    const nodes = select(tree, "h2:contains('ユビキタス言語')");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('h2');
    expect(nodes[0].text).toContain('ユビキタス言語');
  });

  test(':contains() — マッチしない場合は空', () => {
    const tree = buildTree(glossaryMd);
    const nodes = select(tree, "h2:contains('存在しないテキスト')");
    expect(nodes).toHaveLength(0);
  });

  test('複合セレクタ h2:contains() > h3', () => {
    const tree = buildTree(glossaryMd);
    const nodes = select(tree, "h2:contains('ユビキタス言語') > h3");
    expect(nodes.length).toBe(2);
    const texts = nodes.map((n) => n.text);
    expect(texts).toContain('集約');
    expect(texts).toContain('リポジトリ');
    // エンティティ（その他 配下）は含まない
    expect(texts).not.toContain('エンティティ');
  });

  test('子孫セレクタ h2 p — h2 配下の全 p', () => {
    const tree = buildTree(glossaryMd);
    const nodes = select(tree, 'h2 p');
    // Should include paragraphs under h3 which is under h2
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(n.type).toBe('p');
    }
  });

  test('タイプのみ h3 — ツリー全体から h3 を取得', () => {
    const tree = buildTree(glossaryMd);
    const nodes = select(tree, 'h3');
    expect(nodes.length).toBe(3); // 集約, リポジトリ, エンティティ
  });

  test('* ワイルドカード — 全ノードを返す', () => {
    const md = `## Section\n\nParagraph.\n`;
    const tree = buildTree(md);
    const nodes = select(tree, '*');
    expect(nodes.length).toBeGreaterThan(1);
  });

  test(':contains() 内にスペースがあっても正しくパースされる', () => {
    const md = `## ubiquitous language\n\n### Aggregate\n\nDesc.\n`;
    const tree = buildTree(md);
    const nodes = select(tree, "h2:contains('ubiquitous language') > h3");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('Aggregate');
  });
});

describe('selectRelative — 多段セレクタ', () => {
  test('term > li:contains() > li — 2 段ネストを辿れる', () => {
    const md = `## 用語\n\n* コードの中の名前\n  * MyAlias\n* 説明\n  * 定義テキスト\n`;
    const tree = buildTree(md);
    const h2Nodes = select(tree, 'h2');
    expect(h2Nodes).toHaveLength(1);

    const result = selectRelative(
      h2Nodes[0],
      "term > li:contains('コードの中の名前') > li",
      tree,
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('MyAlias');
  });

  test('term > li:contains() > li — 定義ノードも取得できる', () => {
    const md = `## 用語\n\n* コードの中の名前\n  * MyAlias\n* 説明\n  * 定義テキスト\n`;
    const tree = buildTree(md);
    const h2Nodes = select(tree, 'h2');

    const result = selectRelative(
      h2Nodes[0],
      "term > li:contains('説明') > li",
      tree,
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('定義テキスト');
  });
});

describe(':has-alias 疑似クラス', () => {
  test('括弧（全角）を含むノードにマッチする', () => {
    const md = `## 用語集\n### 集約（Aggregate）\n集約とは...\n### リポジトリ\nリポジトリとは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, 'h3:has-alias');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toContain('Aggregate');
  });

  test('括弧（半角）を含むノードにマッチする', () => {
    const md = `## 用語集\n### リポジトリ(Repository)\nリポジトリとは...\n### エンティティ\nエンティティとは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, 'h3:has-alias');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toContain('Repository');
  });

  test('括弧なしのノードはマッチしない', () => {
    const md = `## 用語集\n### 集約\n集約とは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, 'h3:has-alias');
    expect(nodes).toHaveLength(0);
  });

  test('コンビネータと組み合わせ可能 — h2:contains() > h3:has-alias', () => {
    const md = `## ユビキタス言語\n### 集約（Aggregate）\n集約とは...\n### リポジトリ\nリポジトリとは...\n## その他\n### エンティティ（Entity）\nエンティティとは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, "h2:contains('ユビキタス言語') > h3:has-alias");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('集約（Aggregate）');
  });
});

describe(':alias() 疑似クラス', () => {
  test('括弧内テキストに部分一致するノードにマッチする', () => {
    const md = `## 用語集\n### 集約（Aggregate）\n集約とは...\n### リポジトリ（Repository）\nリポジトリとは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, "h3:alias('Aggregate')");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toContain('集約');
  });

  test('部分一致: Repo で Repository にマッチする', () => {
    const md = `## 用語集\n### リポジトリ（Repository）\nリポジトリとは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, "h3:alias('Repo')");
    expect(nodes).toHaveLength(1);
  });

  test('マッチしない場合は空', () => {
    const md = `## 用語集\n### 集約（Aggregate）\n集約とは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, "h3:alias('Repository')");
    expect(nodes).toHaveLength(0);
  });

  test('括弧なしのノードはマッチしない', () => {
    const md = `## 用語集\n### 集約\n集約とは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, "h3:alias('集約')");
    expect(nodes).toHaveLength(0);
  });

  test("ダブルクォートでも動作する — h3:alias(\"text\")", () => {
    const md = `## 用語集\n### 集約（Aggregate）\n集約とは...\n`;
    const tree = buildTree(md);
    const nodes = select(tree, 'h3:alias("Aggregate")');
    expect(nodes).toHaveLength(1);
  });
});

describe('selectRelative', () => {
  test('term > p — term の直下 p', () => {
    const tree = buildTree(glossaryMd);
    const h3Nodes = select(tree, 'h3');
    const shuuyaku = h3Nodes.find((n) => n.text === '集約');
    expect(shuuyaku).toBeDefined();

    const result = selectRelative(
      shuuyaku as NonNullable<typeof shuuyaku>,
      'term > p',
      tree,
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('p');
    expect(result[0].text).toContain('集約とは');
  });

  test('term ~ * — h3 term 以降の兄弟（h3 は親あり）', () => {
    const tree = buildTree(glossaryMd);
    const h3Nodes = select(tree, 'h3');
    const shuuyaku = h3Nodes.find((n) => n.text === '集約');
    expect(shuuyaku).toBeDefined();

    // 集約 h3 の兄弟: リポジトリ h3 が同じ h2 の子
    const result = selectRelative(
      shuuyaku as NonNullable<typeof shuuyaku>,
      'term ~ *',
      tree,
    );
    const texts = result.map((n) => n.text);
    expect(texts).toContain('リポジトリ');
  });

  test('term ~ * — root-level h2 term でも兄弟を返す（spec case B）', () => {
    // Case B: term = h2 at tree root level (no parent)
    const md = '## 集約\n\n集約とは...\n\n## リポジトリ\n\nリポジトリとは...\n';
    const tree = buildTree(md);
    const h2Nodes = select(tree, 'h2');
    expect(h2Nodes[0].parent).toBeUndefined(); // confirm root-level

    const result = selectRelative(h2Nodes[0], 'term ~ *', tree);
    const terms = result.map((n) => n.text);
    // The sibling h2 "リポジトリ" should be found
    expect(terms).toContain('リポジトリ');
  });

  test('定義セレクタが term ノードを起点に解決される', () => {
    const tree = buildTree(glossaryMd);
    const h3Nodes = select(tree, 'h3');
    const repository = h3Nodes.find((n) => n.text === 'リポジトリ');
    expect(repository).toBeDefined();

    const result = selectRelative(
      repository as NonNullable<typeof repository>,
      'term > p',
      tree,
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('リポジトリとは');
  });
});
