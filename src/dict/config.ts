import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { NymphYml } from './schema.ts';

export function parseConfig(yamlText: string): NymphYml {
  const data = parse(yamlText) as NymphYml;
  return data;
}

export function loadConfig(configPath: string): NymphYml {
  // 生の ENOENT ではなく、何が無いのかが分かるメッセージで落とす
  if (!existsSync(configPath)) {
    throw new Error(`設定ファイルが存在しません: ${configPath}`);
  }
  const text = readFileSync(configPath, 'utf-8');
  return parseConfig(text);
}
