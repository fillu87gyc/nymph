/**
 * 本文（Markdown ソース）を走査して、ウィジェットが並べる一覧を作る純関数群。
 *
 * marked のトークン化（parseBlocks / extractToc）は本文の描画に使っているが、
 * ここで欲しいのは「何行目に何があるか」だけなので、行単位の軽い走査で足りる。
 * ウィジェットは本文が更新されるたびに作り直されるため、安く済ませたい。
 *
 * どの関数もコードフェンス（``` / ~~~）の中は対象外にする。コード例の中の
 * `- [ ]` やリンク記法を拾ってしまうと一覧が嘘になるため。
 */

/** 走査中の 1 行。`fenced` はコードフェンスの内側（囲みの行自身も含む）。 */
interface SourceLine {
  /** 1 始まりの行番号。 */
  line: number;
  text: string;
  fenced: boolean;
  /** フェンスの開始行なら情報文字列（```mermaid の "mermaid"）。 */
  fenceInfo: string | null;
}

const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;

/**
 * 行を走査してコードフェンスの内外を判定する。frontmatter（先頭の `---`）は
 * 本文ではないので、`skipFrontmatter` で読み飛ばせる。
 */
function scanLines(src: string, skipFrontmatter = true): SourceLine[] {
  const lines = src.split('\n');
  const out: SourceLine[] = [];
  let fence: string | null = null;
  let start = 0;

  if (skipFrontmatter) {
    const fm = frontmatterRange(lines);
    if (fm) start = fm.end;
  }

  for (let i = start; i < lines.length; i++) {
    const text = lines[i];
    const m = FENCE_RE.exec(text);
    if (fence === null && m) {
      fence = m[2][0].repeat(3);
      out.push({
        line: i + 1,
        text,
        fenced: true,
        fenceInfo: m[3].trim() || '',
      });
      continue;
    }
    if (fence !== null && m && m[2].startsWith(fence) && !m[3].trim()) {
      fence = null;
      out.push({ line: i + 1, text, fenced: true, fenceInfo: null });
      continue;
    }
    out.push({ line: i + 1, text, fenced: fence !== null, fenceInfo: null });
  }
  return out;
}

/** 先頭の frontmatter（`---` で挟まれた範囲）。無ければ null。 */
function frontmatterRange(
  lines: string[],
): { start: number; end: number } | null {
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return { start: 0, end: i + 1 };
  }
  return null;
}

// ---------------------------------------------------------------- タスク

export interface TaskItem {
  line: number;
  done: boolean;
  text: string;
  /** ネストの深さ（インデント 2 スペースを 1 段とみなす）。 */
  depth: number;
}

const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/;

/** `- [ ]` / `- [x]` のチェックボックス項目を上から順に集める。 */
export function extractTasks(src: string): TaskItem[] {
  const out: TaskItem[] = [];
  for (const { line, text, fenced } of scanLines(src)) {
    if (fenced) continue;
    const m = TASK_RE.exec(text);
    if (!m) continue;
    out.push({
      line,
      done: m[2] !== ' ',
      text: stripInlineMarkup(m[3]).trim(),
      depth: Math.floor(m[1].replace(/\t/g, '  ').length / 2),
    });
  }
  return out;
}

// ------------------------------------------------------------ リンク / 画像

export type LinkCategory = 'external' | 'anchor' | 'relative';

export interface LinkItem {
  line: number;
  /** 行の中の桁（0 始まり）。同じ行に複数あるときの区別に使う。 */
  column: number;
  kind: 'link' | 'image';
  /** リンクテキスト（画像なら alt）。空なら target をそのまま見せる。 */
  label: string;
  /** 記法に書かれたままの行き先。 */
  target: string;
  category: LinkCategory;
}

// [label](target) と ![alt](target)。target のタイトル部（"..."）は捨てる。
const LINK_RE = /(!?)\[([^\]]*)\]\(\s*<?([^)>\s]*)>?(?:\s+"[^"]*")?\s*\)/g;

export function linkCategory(target: string): LinkCategory {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return 'external';
  if (target.startsWith('//')) return 'external';
  if (target.startsWith('#')) return 'anchor';
  return 'relative';
}

/** 本文中のリンクと画像を上から順に集める。 */
export function extractLinks(src: string): LinkItem[] {
  const out: LinkItem[] = [];
  for (const { line, text, fenced } of scanLines(src)) {
    if (fenced) continue;
    // インラインコード（`...`）の中は記法として扱わない
    const scannable = text.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length));
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null = LINK_RE.exec(scannable);
    while (m !== null) {
      const target = m[3];
      if (target) {
        out.push({
          line,
          column: m.index,
          kind: m[1] === '!' ? 'image' : 'link',
          label: stripInlineMarkup(m[2]).trim(),
          target,
          category: linkCategory(target),
        });
      }
      m = LINK_RE.exec(scannable);
    }
  }
  return out;
}

/**
 * 生死を問い合わせる相対リンクの行き先（重複を畳んだもの）。
 * アンカーだけのリンクと外部 URL はサーバーに聞いても意味がないので除く。
 */
export function relativeTargets(links: LinkItem[]): string[] {
  const seen = new Set<string>();
  for (const l of links) {
    if (l.category !== 'relative') continue;
    seen.add(l.target);
  }
  return [...seen];
}

// ------------------------------------------------------------------ 図

export interface DiagramItem {
  /** フェンスの開始行（```mermaid の行）。 */
  line: number;
  /** 情報文字列（mermaid / mmd）。 */
  lang: string;
  /** 図の種類（graph / sequenceDiagram など）。判別できなければ空。 */
  kind: string;
  /** 中身の先頭数行のプレビュー。 */
  preview: string;
}

const DIAGRAM_LANGS = new Set(['mermaid', 'mmd']);
const PREVIEW_LINES = 2;

/** 本文中の Mermaid 図（```mermaid / ```mmd）を上から順に集める。 */
export function extractDiagrams(src: string): DiagramItem[] {
  const lines = scanLines(src);
  const out: DiagramItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const info = lines[i].fenceInfo;
    if (info === null) continue;
    const lang = info.split(/\s+/)[0].toLowerCase();
    if (!DIAGRAM_LANGS.has(lang)) continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j].fenced; j++) {
      // 閉じフェンス（fenced だが本文ではない行）に当たったら終わり
      if (FENCE_RE.test(lines[j].text) && !lines[j].fenceInfo) break;
      const t = lines[j].text.trim();
      if (t) body.push(t);
    }
    out.push({
      line: lines[i].line,
      lang,
      kind: diagramKind(body[0] ?? ''),
      preview: body.slice(0, PREVIEW_LINES).join(' / '),
    });
  }
  return out;
}

/** 先頭行から図の種類を読む（`graph TD;` → graph、`%%` のコメントは飛ばす）。 */
function diagramKind(firstLine: string): string {
  if (!firstLine || firstLine.startsWith('%%')) return '';
  const token = firstLine.split(/[\s;:{]/)[0];
  return /^[A-Za-z]/.test(token) ? token : '';
}

// -------------------------------------------------------------- 文書統計

export interface DocStats {
  chars: number;
  /** 空白・改行を除いた文字数。 */
  charsNoSpace: number;
  /** 半角の語数（日本語は文字数側で数える）。 */
  words: number;
  lines: number;
  headings: number;
  codeBlocks: number;
  tables: number;
  images: number;
  links: number;
  tasks: number;
  doneTasks: number;
  /** 推定読了時間（分）。0 分にはせず最低 1 分。 */
  readingMinutes: number;
}

/** 読了時間の見積もりで「文字数で数える」側の文字（かな・漢字・全角記号）。 */
const JA_CHAR_RE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/g;

/** 日本語の読む速さ（文字/分）。 */
const CHARS_PER_MINUTE = 500;
/** 英語の読む速さ（語/分）。 */
const WORDS_PER_MINUTE = 200;

export function computeDocStats(src: string): DocStats {
  const lines = scanLines(src);
  const links = extractLinks(src);
  const tasks = extractTasks(src);

  let headings = 0;
  let codeBlocks = 0;
  let tables = 0;
  for (const { text, fenced, fenceInfo } of lines) {
    if (fenceInfo !== null) codeBlocks++;
    if (fenced) continue;
    if (/^\s{0,3}#{1,6}\s/.test(text)) headings++;
    // 区切り行（|---|---|）を表 1 つとして数える
    if (/^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(text) && text.includes('|'))
      tables++;
  }

  const body = lines
    .filter((l) => !l.fenced)
    .map((l) => l.text)
    .join('\n');
  const chars = src.length;
  const charsNoSpace = src.replace(/\s/g, '').length;
  const words = (body.match(/[A-Za-z0-9][A-Za-z0-9'’_-]*/g) ?? []).length;
  // 日本語は文字数、英語は語数で見積もって足し合わせる（混在文書のため）
  const jaChars = (body.match(JA_CHAR_RE) ?? []).length;
  const readingMinutes = Math.max(
    1,
    Math.round(jaChars / CHARS_PER_MINUTE + words / WORDS_PER_MINUTE),
  );

  return {
    chars,
    charsNoSpace,
    words,
    lines: src === '' ? 0 : src.split('\n').length,
    headings,
    codeBlocks,
    tables,
    images: links.filter((l) => l.kind === 'image').length,
    links: links.filter((l) => l.kind === 'link').length,
    tasks: tasks.length,
    doneTasks: tasks.filter((t) => t.done).length,
    readingMinutes,
  };
}

// ------------------------------------------------------------ frontmatter

export interface FrontmatterField {
  key: string;
  value: string;
}

export interface Frontmatter {
  /** 上から順のキーと、1 行に畳んだ値。 */
  fields: FrontmatterField[];
  /** frontmatter が占める行数（本文の開始行 - 1）。 */
  lineCount: number;
}

/**
 * 先頭の YAML frontmatter をキー / 値の並びとして読む。
 *
 * ここが欲しいのは「一覧で眺める」表示なので、YAML の全機能は解釈せず、
 * トップレベルのキーだけを拾い、入れ子・配列は 1 行に畳んで見せる。
 * 閉じの `---` が無いものは frontmatter とみなさない（本文の水平線と区別）。
 */
export function parseFrontmatter(src: string): Frontmatter | null {
  const lines = src.split('\n');
  const range = frontmatterRange(lines);
  if (!range) return null;

  const fields: FrontmatterField[] = [];
  for (let i = 1; i < range.end - 1; i++) {
    const text = lines[i];
    if (!text.trim() || text.trim().startsWith('#')) continue;
    const m = /^([A-Za-z0-9_.$-]+)\s*:\s*(.*)$/.exec(text);
    if (m) {
      fields.push({ key: m[1], value: m[2].trim() });
      continue;
    }
    // 直前のキーに属する入れ子・配列要素は、その値へ畳んで見せる
    const last = fields[fields.length - 1];
    if (last && /^\s+/.test(text)) {
      const piece = text.trim().replace(/^-\s*/, '');
      last.value = last.value ? `${last.value}, ${piece}` : piece;
    }
  }
  return { fields, lineCount: range.end };
}

// ---------------------------------------------------------------- 用語

/**
 * 用語（と別名）が本文に現れる行番号。大文字小文字は無視し、コードフェンスの
 * 中は数えない（本文中の用語解説という用途に合わせる）。
 */
export function findTermLines(
  src: string,
  term: string,
  aliases: readonly string[] = [],
): number[] {
  const needles = [term, ...aliases]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (needles.length === 0) return [];
  const out: number[] = [];
  for (const { line, text, fenced } of scanLines(src)) {
    if (fenced) continue;
    const lower = text.toLowerCase();
    if (needles.some((n) => lower.includes(n))) out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------- 共通

/** 一覧に出す短いラベル用に、記法の記号（`*` `` ` `` `[]`）を落とす。 */
export function stripInlineMarkup(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1');
}
