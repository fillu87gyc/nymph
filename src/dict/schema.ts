export interface DictEntry {
  term: string;
  aliases: string[];
  definition: string;
  definitionHtml: string;
  source: string;
  sourceRef: string;
}

export interface DictFile {
  version: 1;
  updatedAt: string;
  entries: DictEntry[];
}

export interface SourceRules {
  term: string;
  definition: string;
  aliases?: string;
}

export interface SourceConfig {
  name: string;
  fetch: { cmd: string[] };
  adapter: string;
  rules: SourceRules;
}

export interface NaiadYml {
  sources: SourceConfig[];
  dict?: { ttl?: string; out?: string };
}
