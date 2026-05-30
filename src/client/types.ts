export interface Comment {
  id: number;
  ls: number;
  le: number;
  block_type: string;
  context: string | TableContext | CodeContext;
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
  type: 'equal' | 'insert' | 'delete';
  content: string;
  g: number | null;
}

export interface DiffResponse {
  lines: DiffLine[];
}

export interface ContentResponse {
  content: string;
  filename: string | null;
  mtime: number;
}

export interface PendingComment {
  ls: number;
  le: number;
  blockType: string;
  context: Comment['context'];
  selectionOffset: number | null;
}
