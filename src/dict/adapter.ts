import type { DictEntry, SourceRules } from './schema.ts';

export interface DictAdapter {
  name: string;
  extract(raw: string, rules: SourceRules): DictEntry[];
}

const registry = new Map<string, DictAdapter>();

export function registerAdapter(adapter: DictAdapter): void {
  registry.set(adapter.name, adapter);
}

export function getAdapter(name: string): DictAdapter {
  const adapter = registry.get(name);
  if (!adapter) {
    throw new Error(`アダプタが見つかりません: ${name}`);
  }
  return adapter;
}
