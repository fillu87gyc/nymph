import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { SearchFileResult, SearchMatch } from './client/types.ts';

/**
 * 全文検索（mo の /_/api/search 相当）。
 * 大文字小文字を無視した部分一致で、ファイル名と本文の両方を対象にする。
 * スニペットは前後 1 行のコンテキスト付き。長い行はマッチ周辺にクリップし、
 * ハイライト用オフセット（start/end）はクリップ後のテキスト基準で返す。
 */

export const MAX_MATCHES_PER_FILE = 5;
export const MAX_TOTAL_MATCHES = 50;
const CONTEXT_LINES = 1;
// スニペットの最大表示幅と、クリップ時にマッチ手前へ残す文字数
const CLIP_WIDTH = 160;
const CLIP_LEAD = 40;

function clipContextLine(line: string): string {
  return line.length > CLIP_WIDTH ? `${line.slice(0, CLIP_WIDTH)}…` : line;
}

function clipMatchLine(
  line: string,
  start: number,
  end: number,
): Pick<SearchMatch, 'text' | 'start' | 'end'> {
  if (line.length <= CLIP_WIDTH) return { text: line, start, end };
  let winStart = Math.max(0, start - CLIP_LEAD);
  if (winStart + CLIP_WIDTH > line.length) {
    winStart = Math.max(0, line.length - CLIP_WIDTH);
  }
  const winEnd = winStart + CLIP_WIDTH;
  const prefix = winStart > 0 ? '…' : '';
  const suffix = winEnd < line.length ? '…' : '';
  const text = prefix + line.slice(winStart, winEnd) + suffix;
  const clippedStart = start - winStart + prefix.length;
  const clippedEnd = Math.min(end, winEnd) - winStart + prefix.length;
  return { text, start: clippedStart, end: clippedEnd };
}

export function searchContent(
  content: string,
  query: string,
  maxMatches = MAX_MATCHES_PER_FILE,
): SearchMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const lines = content.split('\n');
  const matches: SearchMatch[] = [];
  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    const line = lines[i];
    const idx = line.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    matches.push({
      line: i + 1,
      ...clipMatchLine(line, idx, idx + q.length),
      before: lines
        .slice(Math.max(0, i - CONTEXT_LINES), i)
        .map(clipContextLine),
      after: lines.slice(i + 1, i + 1 + CONTEXT_LINES).map(clipContextLine),
    });
  }
  return matches;
}

export function searchFiles(
  paths: string[],
  query: string,
): { results: SearchFileResult[]; truncated: boolean } {
  const q = query.trim().toLowerCase();
  if (!q) return { results: [], truncated: false };
  const results: SearchFileResult[] = [];
  let total = 0;
  let truncated = false;
  for (const path of paths) {
    if (total >= MAX_TOTAL_MATCHES) {
      // 残りのファイルに一致があるかは調べず打ち切る（上限到達済み）
      truncated = true;
      break;
    }
    let content: string;
    try {
      content = readFileSync(path, 'utf-8');
    } catch {
      continue;
    }
    const name = basename(path);
    const nameMatch = name.toLowerCase().includes(q);
    const budget = Math.min(MAX_MATCHES_PER_FILE, MAX_TOTAL_MATCHES - total);
    // 上限より 1 件多く探して「まだ一致が残っている」ことを検出する
    const found = searchContent(content, q, budget + 1);
    if (found.length > budget) truncated = true;
    const matches = found.slice(0, budget);
    total += matches.length;
    if (nameMatch || matches.length > 0) {
      results.push({ path, name, nameMatch, matches });
    }
  }
  return { results, truncated };
}
