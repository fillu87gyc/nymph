export interface Comment {
  id: number;
  lineStart: number;
  lineEnd: number;
  block_type: string;
  context: string | TableContext | CodeContext | DiffContext;
  selection_offset?: number;
  text: string;
}

export interface TableContext {
  headers: string[];
  rows: Record<string, string>[];
}

export interface CodeContext {
  lang?: string;
  code: string;
}

export interface FileEntry {
  path: string;
  name: string;
}

export interface DiffLine {
  n: number | null;
  o: number | null;
  type: 'equal' | 'insert' | 'delete';
  content: string;
  g: number | null;
}

export interface DiffResponse {
  lines: DiffLine[];
  hasCheckpoint: boolean;
}

// 「差分への指摘」コメント（block_type: 'diff'）のアンカー情報。
// checkpoint が変わったり消えたりしてもコメント単体で文脈を再現できるよう、
// 対象行とその前後のスナップショット（hunk）を自己完結で保持する。
export interface DiffContext {
  side: 'old' | 'new';
  oldLine: number | null;
  newLine: number | null;
  line: string;
  hunk: string[];
}

export interface ContentResponse {
  content: string;
  filename: string | null;
  mtime: number;
}

export interface PendingComment {
  lineStart: number;
  lineEnd: number;
  block_type: string;
  context: Comment['context'];
  selection_offset: number | null;
}

export interface DictEntry {
  term: string;
  aliases: string[];
  definition: string;
  definitionHtml: string;
  source: string;
  sourceRef: string;
}

export interface DictResponse {
  version: number;
  updatedAt: string;
  entries: DictEntry[];
}
