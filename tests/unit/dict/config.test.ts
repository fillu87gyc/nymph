import { describe, expect, test } from 'vitest';
import { loadConfig, parseConfig } from '../../../src/dict/config.ts';

describe('loadConfig', () => {
  test('存在しない設定ファイルは何が無いか分かるメッセージでエラーになる', () => {
    expect(() => loadConfig('tests/fixtures/dict/no-such-config.yml')).toThrow(
      '設定ファイルが存在しません: tests/fixtures/dict/no-such-config.yml',
    );
  });

  test('存在する設定ファイルは読み込める', () => {
    const config = loadConfig('tests/fixtures/dict/nymph.yml');
    expect(config.sources.length).toBeGreaterThan(0);
  });
});

describe('parseConfig', () => {
  test('正しい YAML をパースできる', () => {
    const yaml = `
sources:
  - name: glossary
    fetch:
      cmd: ["cat", "tests/fixtures/dict/glossary.md"]
    adapter: markdown
    rules:
      term: "h2:contains('ユビキタス言語') > h3"
      definition: "term > p"
dict:
  out: ".nymph/dict.json"
`;
    const config = parseConfig(yaml);
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0].name).toBe('glossary');
    expect(config.sources[0].fetch.cmd).toEqual([
      'cat',
      'tests/fixtures/dict/glossary.md',
    ]);
    expect(config.sources[0].adapter).toBe('markdown');
    expect(config.sources[0].rules.term).toBe(
      "h2:contains('ユビキタス言語') > h3",
    );
    expect(config.sources[0].rules.definition).toBe('term > p');
    expect(config.dict?.out).toBe('.nymph/dict.json');
  });

  test('sources が空配列の場合', () => {
    const yaml = `sources: []`;
    const config = parseConfig(yaml);
    expect(config.sources).toEqual([]);
  });

  test('dict フィールドが省略された場合', () => {
    const yaml = `
sources:
  - name: test
    fetch:
      cmd: ["cat", "test.md"]
    adapter: markdown
    rules:
      term: "h2"
      definition: "term > p"
`;
    const config = parseConfig(yaml);
    expect(config.dict).toBeUndefined();
  });

  test('rules.aliases フィールドをパース', () => {
    const yaml = `
sources:
  - name: glossary
    fetch:
      cmd: ["cat", "glossary.md"]
    adapter: markdown
    rules:
      term: "h2"
      aliases: "term > li:contains('names') > li"
      definition: "term > li:contains('説明') > li"
`;
    const config = parseConfig(yaml);
    expect(config.sources[0].rules.aliases).toBe(
      "term > li:contains('names') > li",
    );
  });

  test('rules.aliases が省略された場合は undefined', () => {
    const yaml = `
sources:
  - name: test
    fetch:
      cmd: ["cat", "test.md"]
    adapter: markdown
    rules:
      term: "h2"
      definition: "term > p"
`;
    const config = parseConfig(yaml);
    expect(config.sources[0].rules.aliases).toBeUndefined();
  });

  test('不正な YAML でエラーをスロー', () => {
    const yaml = `invalid: [unclosed bracket`;
    expect(() => parseConfig(yaml)).toThrow();
  });

  test('ttl フィールドをパース', () => {
    const yaml = `
sources: []
dict:
  ttl: "1h"
  out: ".nymph/dict.json"
`;
    const config = parseConfig(yaml);
    expect(config.dict?.ttl).toBe('1h');
  });
});
