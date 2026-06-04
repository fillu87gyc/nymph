import { describe, expect, test } from 'vitest';
import { extractJsonEntries } from '../../../src/dict/adapters/json.ts';

const RULES = { term: 'term', definition: 'description' };

describe('json adapter: 基本抽出', () => {
  test('配列ルートから term/definition を抽出する', () => {
    const raw = JSON.stringify([
      { term: '集約', description: '集約とは...' },
      { term: 'リポジトリ', description: 'リポジトリとは...' },
    ]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.term)).toContain('集約');
    expect(entries.map((e) => e.term)).toContain('リポジトリ');
  });

  test('definition がプレーンテキストで返る', () => {
    const raw = JSON.stringify([{ term: '集約', description: '集約とは...' }]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries[0].definition).toBe('集約とは...');
    expect(entries[0].definition).not.toContain('<');
  });

  test('definitionHtml が <p> タグで包まれる', () => {
    const raw = JSON.stringify([{ term: '集約', description: '集約とは...' }]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries[0].definitionHtml).toBe('<p>集約とは...</p>');
  });

  test('source / sourceRef が空文字で初期化される', () => {
    const raw = JSON.stringify([{ term: '集約', description: '集約とは...' }]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries[0].source).toBe('');
    expect(entries[0].sourceRef).toBe('');
  });
});

describe('json adapter: オブジェクトルート対応', () => {
  test('単一配列フィールドを持つオブジェクトを解析できる', () => {
    const raw = JSON.stringify({
      entries: [
        { term: '集約', description: '集約とは...' },
        { term: 'リポジトリ', description: 'リポジトリとは...' },
      ],
    });
    const entries = extractJsonEntries(raw, RULES);
    expect(entries.length).toBe(2);
  });
});

describe('json adapter: aliases', () => {
  test('term の括弧表記からエイリアスを抽出し term 本体をクリーンにする', () => {
    const raw = JSON.stringify([
      { term: '集約（Aggregate）', description: '集約とは...' },
    ]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries[0].term).toBe('集約');
    expect(entries[0].aliases).toContain('Aggregate');
  });

  test('aliases フィールドがある場合はそれを読み込む', () => {
    const raw = JSON.stringify([
      {
        term: 'リポジトリ',
        description: 'リポジトリとは...',
        aliases: ['Repository'],
      },
    ]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries[0].aliases).toContain('Repository');
  });

  test('括弧表記 aliases と aliases フィールドが重複しない', () => {
    const raw = JSON.stringify([
      {
        term: '集約（Aggregate）',
        description: '集約とは...',
        aliases: ['Aggregate'],
      },
    ]);
    const entries = extractJsonEntries(raw, RULES);
    const aggCount = entries[0].aliases.filter((a) => a === 'Aggregate').length;
    expect(aggCount).toBe(1);
  });

  test('エイリアスがない場合は空配列', () => {
    const raw = JSON.stringify([{ term: '集約', description: '集約とは...' }]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries[0].aliases).toEqual([]);
  });
});

describe('json adapter: エッジケース', () => {
  test('term フィールドが存在しないアイテムはスキップされる', () => {
    const raw = JSON.stringify([
      { description: '定義のみ' },
      { term: '集約', description: '集約とは...' },
    ]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries.length).toBe(1);
    expect(entries[0].term).toBe('集約');
  });

  test('definition フィールドが空の場合は空文字になる', () => {
    const raw = JSON.stringify([{ term: '集約' }]);
    const entries = extractJsonEntries(raw, RULES);
    expect(entries[0].definition).toBe('');
    expect(entries[0].definitionHtml).toBe('');
  });

  test('空の配列は空の entries を返す', () => {
    const entries = extractJsonEntries('[]', RULES);
    expect(entries).toEqual([]);
  });

  test('カスタム rules でフィールド名を変更できる', () => {
    const raw = JSON.stringify([{ name: '集約', desc: '集約とは...' }]);
    const entries = extractJsonEntries(raw, {
      term: 'name',
      definition: 'desc',
    });
    expect(entries[0].term).toBe('集約');
    expect(entries[0].definition).toBe('集約とは...');
  });

  test('無効な JSON はエラーをスローする', () => {
    expect(() => extractJsonEntries('not json', RULES)).toThrow();
  });

  test('配列でもオブジェクトでもない場合はエラーをスローする', () => {
    expect(() => extractJsonEntries('"string"', RULES)).toThrow();
  });

  test('複数の配列フィールドを持つオブジェクトはエラーをスローする', () => {
    const raw = JSON.stringify({ a: [1, 2], b: [3, 4] });
    expect(() => extractJsonEntries(raw, RULES)).toThrow();
  });
});
