import { registerAdapter } from '../adapter.ts';
import type { DictEntry, SourceRules } from '../schema.ts';

export function extractJsonEntries(
  raw: string,
  rules: SourceRules,
): DictEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`JSON アダプタ: 入力が有効な JSON ではありません: ${e}`);
  }

  let items: unknown[];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    const arrays = Object.values(data as Record<string, unknown>).filter(
      Array.isArray,
    );
    if (arrays.length === 1) {
      items = arrays[0] as unknown[];
    } else {
      throw new Error(
        'JSON アダプタ: 入力はひとつの配列フィールドを持つオブジェクト、または配列である必要があります',
      );
    }
  } else {
    throw new Error(
      'JSON アダプタ: 入力は配列またはオブジェクトである必要があります',
    );
  }

  const entries: DictEntry[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const rawTerm = obj[rules.term];
    if (typeof rawTerm !== 'string' || !rawTerm.trim()) continue;

    const termText = rawTerm.replace(/[（(][^）)]*[）)]/g, '').trim();

    const aliases: string[] = [];
    const aliasMatch = rawTerm.match(/[（(]([A-Za-z][^）)]*)[）)]/);
    if (aliasMatch) aliases.push(aliasMatch[1].trim());

    if (Array.isArray(obj.aliases)) {
      for (const a of obj.aliases) {
        if (typeof a === 'string' && !aliases.includes(a)) aliases.push(a);
      }
    }

    const rawDef = obj[rules.definition];
    const definition = typeof rawDef === 'string' ? rawDef.trim() : '';
    const definitionHtml = definition ? `<p>${definition}</p>` : '';

    entries.push({
      term: termText,
      aliases,
      definition,
      definitionHtml,
      source: '',
      sourceRef: '',
    });
  }

  return entries;
}

registerAdapter({
  name: 'json',
  extract: extractJsonEntries,
});
