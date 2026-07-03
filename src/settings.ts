import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface NymphSettings {
  fontSize: number;
  contentWidth: number;
}

export const DEFAULT_SETTINGS: NymphSettings = {
  fontSize: 14,
  contentWidth: 820,
};

function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export function parseSettings(yamlText: string): NymphSettings {
  const data = (parse(yamlText) ?? {}) as Partial<NymphSettings>;
  return {
    fontSize: isPositiveNumber(data.fontSize)
      ? data.fontSize
      : DEFAULT_SETTINGS.fontSize,
    contentWidth: isPositiveNumber(data.contentWidth)
      ? data.contentWidth
      : DEFAULT_SETTINGS.contentWidth,
  };
}

export function loadSettings(settingsPath: string): NymphSettings {
  if (!existsSync(settingsPath)) return DEFAULT_SETTINGS;
  try {
    return parseSettings(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}
