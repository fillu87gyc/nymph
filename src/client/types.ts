export interface Comment {
  // 新規コメントは `c_` + 乱数6桁hex（src/client/lib/commentId.ts）。
  // 既存データの整数 ID は非破壊で共存させるため number も許容する。
  id: number | string;
  lineStart: number;
  lineEnd: number;
  block_type: string;
  context: string | TableContext | CodeContext | DiffContext;
  selection_offset?: number;
  text: string;
  // 未定義 = 未解決（open）。明示的に true になったコメントのみ解決済み扱い。
  resolved?: boolean;
  // ISO8601。新規作成時のみ付与し、既存コメントは無しのまま有効。
  createdAt?: string;
  // 作成時点のレビューラウンド（0 なら省略可）。チェックポイント設定のたびに
  // 進む「ラウンド境界」の記録。既存コメントは無しのまま有効。
  round?: number;
  // 作成時点の「もとの文章」（対象行 + 前後 5 行）。対象が削除・解決された
  // 後でも何に対する指摘だったかを辿れるようにする。この機能より前に作られた
  // コメントには無いため optional。
  snapshot?: CommentSnapshot;
}

// コメント対象の文章を作成時点で切り出したスナップショット。
// before / after はそれぞれ最大 SNAPSHOT_CONTEXT_LINES 行（ファイル端では
// それ未満）。startLine は target 先頭行の行番号（1 始まり）。
export interface CommentSnapshot {
  startLine: number;
  before: string[];
  target: string[];
  after: string[];
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

export interface RecentEntry {
  path: string;
  name: string;
  dir: string;
  openedAt: string;
}

export interface BookmarkEntry {
  path: string;
  name: string;
  dir: string;
  type: 'file' | 'dir';
  addedAt: string;
}

export interface TreeNode {
  type: 'dir' | 'file';
  name: string;
  path: string;
  children?: TreeNode[];
}

export interface TreeResponse {
  root: string | null;
  rootName?: string;
  tree: TreeNode[];
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

// GET /comments のレスポンス形状。version 2 のエンベロープが持つ round を
// そのまま client に橋渡しする（新規コメント作成時に付与する round の元）。
export interface CommentsResponse {
  round: number;
  comments: Comment[];
}

// コメントの状態。未解決のまま対象の文章が消えたものが deleted になり、
// 解決済みは対象が消えても resolved のまま（src/client/lib/comments.ts の
// commentStatus が唯一の判定窓口）。
export type CommentStatus = 'open' | 'deleted' | 'resolved';

export type CommentFilter = 'all' | CommentStatus;

export interface PendingComment {
  lineStart: number;
  lineEnd: number;
  block_type: string;
  context: Comment['context'];
  selection_offset: number | null;
}

// GET /search の1マッチ。text は長い行の場合マッチ周辺にクリップ済みで、
// start/end はクリップ後の text 基準のハイライト範囲。
export interface SearchMatch {
  line: number;
  text: string;
  start: number;
  end: number;
  before: string[];
  after: string[];
}

export interface SearchFileResult {
  path: string;
  name: string;
  nameMatch: boolean;
  matches: SearchMatch[];
}

export interface SearchResponse {
  query: string;
  results: SearchFileResult[];
  truncated: boolean;
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
