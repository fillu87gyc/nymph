import { describe, expect, test } from 'vitest';
import { buildTree } from '../../../src/dict/tree.ts';

describe('buildTree', () => {
  test('h1-h2-h3 の正しいネスト構造', () => {
    const md = `# Title\n## Section\n### Subsection\n`;
    const tree = buildTree(md);

    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe('h1');
    expect(tree[0].text).toBe('Title');
    expect(tree[0].children).toHaveLength(1);

    const h2 = tree[0].children[0];
    expect(h2.type).toBe('h2');
    expect(h2.text).toBe('Section');
    expect(h2.children).toHaveLength(1);

    const h3 = h2.children[0];
    expect(h3.type).toBe('h3');
    expect(h3.text).toBe('Subsection');
  });

  test('見出し配下の p/li/code ブロックが children になる', () => {
    const md = `## Section\n\nSome paragraph text.\n\n- list item\n`;
    const tree = buildTree(md);

    expect(tree).toHaveLength(1);
    const h2 = tree[0];
    expect(h2.type).toBe('h2');
    // paragraph and list should be children of h2
    const childTypes = h2.children.map((c) => c.type);
    expect(childTypes).toContain('p');
    expect(childTypes).toContain('li');
  });

  test('次の同レベル見出しが来たら前の見出しの子ではない', () => {
    const md = `## First\n### Child\n## Second\n`;
    const tree = buildTree(md);

    // Should have two h2 at root level
    expect(tree).toHaveLength(2);
    expect(tree[0].type).toBe('h2');
    expect(tree[0].text).toBe('First');
    expect(tree[1].type).toBe('h2');
    expect(tree[1].text).toBe('Second');

    // Second h2 is NOT a child of First h2
    const firstH2Children = tree[0].children.map((c) => c.text);
    expect(firstH2Children).not.toContain('Second');
  });

  test('depth なしブロック（p のみ）が root level になる', () => {
    const md = `Just a paragraph.\n\nAnother paragraph.\n`;
    const tree = buildTree(md);

    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].type).toBe('p');
  });

  test('実際の glossary.md 構造をパースできる', () => {
    const md = `# ドメイン用語集\n\n## ユビキタス言語\n\n### 集約\n\n集約とは、整合性を保つべきオブジェクトの集まりである。\n\n### リポジトリ\n\nリポジトリとは、集約の永続化と再構築を担うオブジェクトである。\n\n## その他\n\n### エンティティ\n\nエンティティとは、同一性を持つドメインオブジェクトである。\n`;
    const tree = buildTree(md);

    // Root should be h1
    expect(tree[0].type).toBe('h1');
    expect(tree[0].text).toBe('ドメイン用語集');

    // h1 has two h2 children
    const h2Children = tree[0].children.filter((c) => c.type === 'h2');
    expect(h2Children).toHaveLength(2);

    // First h2 is "ユビキタス言語"
    const ubiquitous = h2Children[0];
    expect(ubiquitous.text).toBe('ユビキタス言語');

    // "ユビキタス言語" has two h3 children
    const h3Children = ubiquitous.children.filter((c) => c.type === 'h3');
    expect(h3Children).toHaveLength(2);
    expect(h3Children[0].text).toBe('集約');
    expect(h3Children[1].text).toBe('リポジトリ');

    // 集約 h3 has a paragraph child
    const shuuyakuP = h3Children[0].children.find((c) => c.type === 'p');
    expect(shuuyakuP).toBeDefined();
    expect(shuuyakuP?.text).toContain('集約とは');
  });

  test('ネストリスト — 親 li の children に子 li が入る', () => {
    const md = `## 用語\n\n* コードの中の名前\n  * term\n* 説明\n  * 〜〜〜\n`;
    const tree = buildTree(md);
    const h2 = tree[0];
    expect(h2.type).toBe('h2');

    const topLis = h2.children.filter((c) => c.type === 'li');
    expect(topLis.length).toBeGreaterThanOrEqual(2);

    const namesLi = topLis.find((n) => n.text === 'コードの中の名前');
    expect(namesLi).toBeDefined();
    expect(namesLi!.children).toHaveLength(1);
    expect(namesLi!.children[0].type).toBe('li');
    expect(namesLi!.children[0].text).toBe('term');
    expect(namesLi!.children[0].parent).toBe(namesLi);
  });

  test('parent 参照が正しく設定される', () => {
    const md = `## Parent\n### Child\n`;
    const tree = buildTree(md);

    const parent = tree[0];
    const child = parent.children[0];
    expect(child.parent).toBe(parent);
  });

  test('html フィールドが設定される', () => {
    const md = `## Section\n\nParagraph text.\n`;
    const tree = buildTree(md);

    const h2 = tree[0];
    expect(h2.html).toBeTruthy();
    expect(typeof h2.html).toBe('string');

    const p = h2.children.find((c) => c.type === 'p');
    expect(p?.html).toContain('<p>');
  });
});
