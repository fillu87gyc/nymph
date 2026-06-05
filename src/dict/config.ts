import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { NaiadYml } from './schema.ts';

export function parseConfig(yamlText: string): NaiadYml {
  const data = parse(yamlText) as NaiadYml;
  return data;
}

export function loadConfig(configPath: string): NaiadYml {
  const text = readFileSync(configPath, 'utf-8');
  return parseConfig(text);
}
