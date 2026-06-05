import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { ThyrsYml } from './schema.ts';

export function parseConfig(yamlText: string): ThyrsYml {
  const data = parse(yamlText) as ThyrsYml;
  return data;
}

export function loadConfig(configPath: string): ThyrsYml {
  const text = readFileSync(configPath, 'utf-8');
  return parseConfig(text);
}
