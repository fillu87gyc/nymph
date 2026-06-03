import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { NymphYml } from './schema.ts';

export function parseConfig(yamlText: string): NymphYml {
  const data = parse(yamlText) as NymphYml;
  return data;
}

export function loadConfig(configPath: string): NymphYml {
  const text = readFileSync(configPath, 'utf-8');
  return parseConfig(text);
}
