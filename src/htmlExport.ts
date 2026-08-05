/**
 * 静的 HTML エクスポート（`nymph <file> --export <out.html>`）。
 *
 * レビュー結果を nymph の外へ持ち出すための出力。開いていた Markdown と、
 * XDG 配下に溜まっているコメントを 1 枚の HTML に焼き込む。生成物は
 * **単体で完結する**（外部 CSS/JS/フォントを読みに行かない）ことを要件に
 * する——レビュー結果はメールに添付されたり社内 Wiki に置かれたりする
 * ので、ネットワークの有無で見え方が変わってはいけない。
 *
 * アプリ本体との違い（意図的なもの）:
 *  - 本文中の生 HTML は sanitize せず **エスケープして literal 表示** する。
 *    アプリは DOMPurify（＝ブラウザの DOM）で消毒できるが、CLI 側には DOM が
 *    無い。「消毒し損ねた HTML を配布物に埋める」より「HTML を書いたまま
 *    見せる」方が安全側なのでそちらに倒す。
 *  - Mermaid はソースを枠付きで見せるだけ（描画にはブラウザが要る）。
 *  - コードのシンタックスハイライトは付けない（hljs はクライアント同梱のため）。
 *
 * ここは純粋な文字列生成に寄せてある（ファイル I/O は画像の読み込みだけ）。
 */

import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';
import { Marked, type Tokens } from 'marked';
import { commentStatus, ctxDisplay } from './client/lib/comments.ts';
import { assignLines, esc, getBlockTokensDFS } from './client/lib/markdown.ts';
import type { Comment, CommentStatus } from './client/types.ts';
import { resolveLinkTarget } from './linkCheck.ts';

/** データ URI に埋め込む画像の拡張子と MIME。ここに無い拡張子は埋め込まない。 */
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

/** 1 枚あたりの埋め込み上限。これを超える画像は元の src のまま残す。 */
export const MAX_EMBED_IMAGE_BYTES = 2 * 1024 * 1024;

export interface ExportBlock {
  /** レンダリング済み HTML。mermaid ブロックでは空文字。 */
  html: string;
  lineStart: number;
  lineEnd: number;
  type: string;
  /** type が 'mermaid' のときのみ、図のソース。 */
  mermaidCode?: string;
}

export interface ExportInput {
  /** レビュー対象の絶対パス（見出しと相対画像の基準に使う）。 */
  file: string;
  /** Markdown 本文。 */
  content: string;
  /** 保存済みコメント。 */
  comments: Comment[];
  /** レビューラウンド（`comments.json` の round）。 */
  round?: number;
  /** 生成日時（テストから固定するため注入可能）。 */
  generatedAt?: Date;
  /** 相対画像をデータ URI に埋め込むか（既定: true）。 */
  embedImages?: boolean;
}

/** ローカル画像を読んでデータ URI にする。埋め込めないものは null。 */
function toDataUri(href: string, baseDir: string): string | null {
  // 判定範囲は「開いているファイルのディレクトリ配下」に限る。
  // リンクの生死チェックと同じ封じ込め方針で、`../../etc/...` のような
  // 範囲外のファイルを配布物へ吸い上げてしまうことを防ぐ。
  const abs = resolveLinkTarget(href, baseDir, baseDir);
  if (abs === null) return null;
  const mime = IMAGE_MIME[extname(abs).toLowerCase()];
  if (!mime) return null;
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_EMBED_IMAGE_BYTES) return null;
    return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * エクスポート専用の marked インスタンス。
 * グローバルな `marked` を `use()` で汚すと同じプロセス内の dict ビルド等に
 * 影響が出るため、呼び出しごとに独立したインスタンスを作る。
 */
function createRenderer(baseDir: string, embedImages: boolean): Marked {
  return new Marked({
    renderer: {
      // 生 HTML はブロック・インラインとも literal 表示（上部コメント参照）。
      html({ text }: Tokens.HTML | Tokens.Tag): string {
        return esc(text);
      },
      image(token: Tokens.Image): string {
        const alt = esc(token.text ?? '');
        const embedded = embedImages ? toDataUri(token.href, baseDir) : null;
        const src = esc(embedded ?? token.href);
        const title = token.title ? ` title="${esc(token.title)}"` : '';
        return `<img src="${src}" alt="${alt}"${title}>`;
      },
    },
  });
}

/**
 * 本文をブロック（コメントが紐づく単位）へ分解する。
 *
 * 行番号の割り当ては本体と同じ `assignLines` / `getBlockTokensDFS` を使う。
 * ここで独自に数えるとコメントのアンカーがアプリとずれるため、必ず共有する。
 */
export function buildExportBlocks(src: string, md: Marked): ExportBlock[] {
  const tokens = md.lexer(src);
  assignLines(src, tokens);
  const blocks: ExportBlock[] = [];

  for (const t of getBlockTokensDFS(tokens)) {
    if (t.__nested) continue;
    const lineStart = t.lineStart || 1;
    const lineEnd = t.lineEnd || lineStart;

    if (t.type === 'code') {
      if (t.lang === 'mermaid' || t.lang === 'mmd') {
        blocks.push({
          html: '',
          lineStart,
          lineEnd,
          type: 'mermaid',
          mermaidCode: t.text,
        });
      } else {
        const lang = t.lang?.trim() || 'plaintext';
        blocks.push({
          html: `<pre><code class="language-${esc(lang)}">${esc(t.text)}</code></pre>`,
          lineStart,
          lineEnd,
          type: 'code',
        });
      }
      continue;
    }

    blocks.push({
      html: (md.parse(t.raw) as string).trim(),
      lineStart,
      lineEnd,
      type: t.type,
    });
  }

  return blocks;
}

/** HTML タグを落として本文テキストだけにする（選択コメントの照合用）。 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 「もとの文章が消えている」コメントを洗い出す。
 *
 * 判定規則はアプリ（`ContentArea.tsx`）と揃える:
 *  - ブロックコメント: `lineStart` から始まるブロックが無ければ消えた扱い
 *  - 選択コメント: 重なるブロックの表示テキストに文言が見つからなければ消えた扱い
 *  - 差分コメント: 本文ブロックに紐づかないので、ここでは判定しない
 */
export function findOrphanedIds(
  blocks: readonly ExportBlock[],
  comments: readonly Comment[],
): Set<Comment['id']> {
  const orphaned = new Set<Comment['id']>();
  const textOf = new Map<ExportBlock, string>();

  for (const c of comments) {
    if (c.block_type === 'diff') continue;

    if (c.block_type === 'selection' && typeof c.context === 'string') {
      const needle = c.context.endsWith('…')
        ? c.context.slice(0, -1)
        : c.context;
      const overlapping = blocks.filter(
        (b) => c.lineStart <= b.lineEnd && c.lineEnd >= b.lineStart,
      );
      const found = overlapping.some((b) => {
        let text = textOf.get(b);
        if (text === undefined) {
          text = stripTags(b.html || b.mermaidCode || '');
          textOf.set(b, text);
        }
        return text.includes(needle);
      });
      if (!found) orphaned.add(c.id);
      continue;
    }

    if (!blocks.some((b) => b.lineStart === c.lineStart)) orphaned.add(c.id);
  }

  return orphaned;
}

const STATUS_LABEL: Record<CommentStatus, string> = {
  open: '未解決',
  deleted: '削除済',
  resolved: '解決済',
};

function lineRef(c: Comment): string {
  return c.lineStart === c.lineEnd
    ? `L${c.lineStart}`
    : `L${c.lineStart}-${c.lineEnd}`;
}

function formatDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderSnapshot(c: Comment): string {
  const snap = c.snapshot;
  if (!snap) return '';
  const row = (text: string, n: number, target: boolean) =>
    `<div class="snapLine${target ? ' snapTarget' : ''}"><span class="snapNo">${n}</span><span class="snapText">${esc(text)}</span></div>`;
  const rows: string[] = [];
  let n = snap.startLine - snap.before.length;
  for (const line of snap.before) rows.push(row(line, n++, false));
  for (const line of snap.target) rows.push(row(line, n++, true));
  for (const line of snap.after) rows.push(row(line, n++, false));
  return `<details class="snapshot"><summary>もとの文章</summary><div class="snapBody">${rows.join('')}</div></details>`;
}

function renderComment(c: Comment, status: CommentStatus): string {
  const target = ctxDisplay(c);
  const created = c.createdAt
    ? `<span class="cMeta">${esc(formatDateTime(new Date(c.createdAt)))}</span>`
    : '';
  const round =
    typeof c.round === 'number' && c.round > 0
      ? `<span class="cMeta">ラウンド ${c.round}</span>`
      : '';
  return [
    `<article class="comment" data-status="${status}">`,
    '<header class="cHead">',
    `<span class="chip chip-${status}">${STATUS_LABEL[status]}</span>`,
    `<span class="cLine">${esc(lineRef(c))}</span>`,
    round,
    created,
    '</header>',
    target ? `<p class="cTarget">${esc(target)}</p>` : '',
    `<div class="cText">${esc(c.text).replace(/\n/g, '<br>')}</div>`,
    renderSnapshot(c),
    '</article>',
  ].join('');
}

// renderBlock に渡すため、レンダリング済み HTML を持ち回る内部型。
type RenderedComment = Comment & { __html: string };

function renderBlock(block: ExportBlock, comments: RenderedComment[]): string {
  const body =
    block.type === 'mermaid'
      ? `<figure class="mermaid"><figcaption>Mermaid</figcaption><pre><code>${esc(block.mermaidCode ?? '')}</code></pre></figure>`
      : block.html;
  const hasComments = comments.length > 0;
  const attrs = [
    'class="block"',
    `data-line-start="${block.lineStart}"`,
    `data-line-end="${block.lineEnd}"`,
    hasComments ? 'data-commented="true"' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const aside = hasComments
    ? `<aside class="comments">${comments.map((c) => c.__html).join('')}</aside>`
    : '';
  return `<section ${attrs}>${body}${aside}</section>`;
}

/** 生成された HTML 全体を返す。副作用は相対画像の読み込みのみ。 */
export function renderExportHtml(input: ExportInput): string {
  const {
    file,
    content,
    comments,
    round = 0,
    generatedAt = new Date(),
    embedImages = true,
  } = input;

  const md = createRenderer(dirname(file), embedImages);
  const blocks = buildExportBlocks(content, md);
  const orphaned = findOrphanedIds(blocks, comments);

  const counts: Record<CommentStatus, number> = {
    open: 0,
    deleted: 0,
    resolved: 0,
  };
  const rendered: RenderedComment[] = comments.map((c) => {
    const status = commentStatus(c, orphaned.has(c.id));
    counts[status]++;
    return { ...c, __html: renderComment(c, status) };
  });

  // 各コメントは最初に重なったブロックへ 1 度だけ置く。どのブロックにも
  // 重ならないもの（消えた対象・差分への指摘）は末尾にまとめる。
  const placed = new Set<Comment['id']>();
  const bodyParts: string[] = [];
  for (const block of blocks) {
    const attached = rendered.filter(
      (c) =>
        c.block_type !== 'diff' &&
        !placed.has(c.id) &&
        c.lineStart <= block.lineEnd &&
        c.lineEnd >= block.lineStart,
    );
    for (const c of attached) placed.add(c.id);
    bodyParts.push(renderBlock(block, attached));
  }

  const unanchored = rendered.filter((c) => !placed.has(c.id));
  const unanchoredSection = unanchored.length
    ? `<section class="unanchored"><h2 class="unanchoredTitle">本文に紐づかないコメント（${unanchored.length}）</h2><aside class="comments">${unanchored.map((c) => c.__html).join('')}</aside></section>`
    : '';

  const name = basename(file);
  const roundLabel =
    round > 0 ? `<span class="metaItem">ラウンド ${round}</span>` : '';

  return `<!doctype html>
<html lang="ja" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="nymph">
<title>${esc(name)} — nymph レビュー</title>
<style>${STYLES}</style>
<script>${THEME_BOOT}</script>
</head>
<body>
<header class="topbar">
  <div class="titleGroup">
    <h1 class="docTitle">${esc(name)}</h1>
    <div class="metaRow">
      <span class="metaItem">${esc(formatDateTime(generatedAt))} 出力</span>
      ${roundLabel}
      <span class="metaItem">コメント ${comments.length} 件</span>
    </div>
  </div>
  <div class="controls">
    <span class="chip chip-open">未解決 ${counts.open}</span>
    <span class="chip chip-deleted">削除済 ${counts.deleted}</span>
    <span class="chip chip-resolved">解決済 ${counts.resolved}</span>
    <button type="button" id="toggle-resolved" class="ctlBtn" aria-pressed="false">解決済みを隠す</button>
    <button type="button" id="toggle-theme" class="ctlBtn">ライト</button>
  </div>
</header>
<main id="content">
${bodyParts.join('\n')}
${unanchoredSection}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

// ── 生成物に埋め込む CSS / JS ──
// 外部ホストを一切参照しない（フォントもシステムフォントのみ）。

const STYLES = `
:root{color-scheme:dark;--bg:#0e0f13;--bg-surface:#171922;--border:#262b3d;--border-light:#343a52;--text:#c0caf5;--text-muted:#565f89;--accent:#85aaf8;--accent-rgb:133,170,248;--code-bg:#1a1b26;--danger:#f7768e;--danger-rgb:247,118,142;--success:#56d364;--success-rgb:86,211,100;}
[data-theme="light"]{color-scheme:light;--bg:#ffffff;--bg-surface:#f6f8fa;--border:#d0d7de;--border-light:#d8dee4;--text:#1f2328;--text-muted:#636c76;--accent:#0969da;--accent-rgb:9,105,218;--code-bg:#f6f8fa;--danger:#d1242f;--danger-rgb:209,36,47;--success:#1a7f37;--success-rgb:26,127,55;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif;font-size:14px;line-height:1.7}
.topbar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:14px 24px;background:var(--bg-surface);border-bottom:1px solid var(--border)}
.docTitle{font-size:16px;font-weight:600}
.metaRow{display:flex;flex-wrap:wrap;gap:10px;margin-top:2px}
.metaItem{color:var(--text-muted);font-size:12px}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctlBtn{height:28px;padding:0 12px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-muted);font:inherit;font-size:12px;cursor:pointer}
.ctlBtn:hover{border-color:var(--border-light);color:var(--text)}
.chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap}
.chip-open{background:rgba(var(--accent-rgb),.15);color:var(--accent)}
.chip-deleted{background:rgba(var(--danger-rgb),.14);color:var(--danger)}
.chip-resolved{background:rgba(var(--success-rgb),.14);color:var(--success)}
#content{max-width:920px;margin:0 auto;padding:40px 32px 96px}
.block{margin-bottom:1.35em;scroll-margin-top:80px}
.block[data-commented="true"]{border-left:2px solid rgba(var(--accent-rgb),.55);padding-left:14px;margin-left:-16px}
h1,h2,h3,h4,h5,h6{line-height:1.3}
#content h1{font-size:2em;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:.4em;margin:2.6rem 0 1.5rem}
#content h2{font-size:1.45em;font-weight:700;margin:2.3rem 0 1.6rem}
#content h3{font-size:1.15em;font-weight:600;margin:2rem 0 1.4rem}
#content h4,#content h5,#content h6{font-size:.9em;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:1.8rem 0 1.4rem}
.block:first-child :is(h1,h2,h3,h4,h5,h6){margin-top:0}
p{line-height:1.82}
ul,ol{padding-left:1.5em;line-height:1.8}
li{margin:.2em 0}
blockquote{border-left:3px solid var(--border-light);padding-left:1em;color:var(--text-muted)}
hr{border:0;border-top:1px solid var(--border);margin:2rem 0}
a{color:var(--accent)}
img{max-width:100%;height:auto}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:var(--code-bg);border-radius:4px;padding:.15em .4em}
pre{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;overflow-x:auto}
pre code{background:none;padding:0;font-size:.86em;line-height:1.6}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}
th,td{border:1px solid var(--border);padding:6px 12px;text-align:left}
th{background:var(--bg-surface);font-weight:600}
figure.mermaid{border:1px dashed var(--border-light);border-radius:8px;padding:10px 12px}
figure.mermaid figcaption{color:var(--text-muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
figure.mermaid pre{border:0;padding:0;background:none}
.comments{display:flex;flex-direction:column;gap:8px;margin:12px 0 4px}
.comment{border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:8px;background:var(--bg-surface);padding:10px 12px}
.comment[data-status="deleted"]{border-left-color:var(--danger)}
.comment[data-status="resolved"]{border-left-color:var(--success);opacity:.72}
.cHead{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
.cLine{color:var(--accent);font-family:ui-monospace,monospace;font-size:11px}
.cMeta{color:var(--text-muted);font-size:11px}
.cTarget{color:var(--text-muted);font-size:12px;font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}
.cText{white-space:pre-wrap;word-break:break-word}
.snapshot{margin-top:8px}
.snapshot summary{color:var(--text-muted);font-size:11px;cursor:pointer}
.snapBody{margin-top:6px;border:1px solid var(--border);border-radius:6px;background:var(--code-bg);padding:6px 0;overflow-x:auto}
.snapLine{display:flex;gap:10px;font-family:ui-monospace,monospace;font-size:11px;line-height:1.6;padding:0 10px}
.snapTarget{background:rgba(var(--accent-rgb),.1)}
.snapNo{color:var(--text-muted);min-width:3ch;text-align:right;user-select:none}
.snapText{white-space:pre-wrap}
.unanchored{margin-top:48px;border-top:1px solid var(--border);padding-top:24px}
.unanchoredTitle{font-size:1.15em;font-weight:600;margin-bottom:12px}
body[data-hide-resolved="true"] .comment[data-status="resolved"]{display:none}
@media print{
  .topbar{position:static}
  .controls{display:none}
  .comment{break-inside:avoid}
  .snapshot>summary{display:none}
  .snapshot .snapBody{display:block}
  #content{max-width:none;padding:0}
}
`;

// テーマの確定は描画前（head）に済ませる。body 末尾でやると
// 「ダークで一瞬光ってからライトになる」ちらつきが出る。
const THEME_BOOT = `
(function(){
  var t=null;
  try{t=localStorage.getItem('nymph-export-theme')}catch(e){}
  if(t!=='dark'&&t!=='light'){
    t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark';
  }
  document.documentElement.setAttribute('data-theme',t);
})();
`;

const SCRIPT = `
(function(){
  var KEY='nymph-export-theme';
  var root=document.documentElement, body=document.body;
  var themeBtn=document.getElementById('toggle-theme');
  var resolvedBtn=document.getElementById('toggle-resolved');
  function store(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function applyTheme(t){
    root.setAttribute('data-theme',t);
    themeBtn.textContent = t==='dark' ? 'ライト' : 'ダーク';
  }
  applyTheme(root.getAttribute('data-theme')==='light'?'light':'dark');
  themeBtn.addEventListener('click',function(){
    var next=root.getAttribute('data-theme')==='dark'?'light':'dark';
    applyTheme(next); store(KEY,next);
  });
  resolvedBtn.addEventListener('click',function(){
    var hide=body.getAttribute('data-hide-resolved')!=='true';
    body.setAttribute('data-hide-resolved',String(hide));
    resolvedBtn.setAttribute('aria-pressed',String(hide));
    resolvedBtn.textContent=hide?'解決済みを表示':'解決済みを隠す';
  });
})();
`;
