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
 *  - Mermaid は既定ではソースを枠付きで見せるだけ。`--export-mermaid` を
 *    付けると描画エンジン（`dist/mermaid-standalone.js`）を丸ごと焼き込み、
 *    オフラインのまま図が描かれる。CDN から拾う案は採らなかった——配布物が
 *    開かれるたび第三者へ接続する（＝閲覧が漏れる）うえ、mermaid の ESM は
 *    図の種類ごとに動的 import するため SRI で守りきれないため。
 *  - コードのシンタックスハイライトは付けない（hljs はクライアント同梱のため）。
 *
 * ここは純粋な文字列生成に寄せてある（ファイル I/O は画像の読み込みだけ）。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commentStatus, ctxDisplay } from './client/lib/comments.ts';
import { esc } from './client/lib/markdown.ts';
import type { Comment, CommentStatus } from './client/types.ts';
import {
  anchorComments,
  buildReviewBlocks,
  createBlockRenderer,
  findOrphanedIds,
  type ReviewBlock,
} from './reviewBlocks.ts';

/**
 * `dist/` に置く mermaid 自己完結バンドルのファイル名。
 * 複製はビルド時（`vite.config.ts` の copyMermaidBundle）に行う。
 */
export const MERMAID_BUNDLE_FILE = 'mermaid-standalone.js';

/**
 * インライン `<script>` に埋めても安全な形にする。
 *
 * JS 文字列の中に `</script` が現れると、そこで script 要素が閉じてしまう
 * （HTML パーサは JS の文法を知らない）。`<\/script` は JS としては同じ
 * 文字列を表すので、意味を変えずにパーサだけを黙らせられる。
 */
export function inlineScriptSafe(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

/**
 * `dist/mermaid-standalone.js` の中身を読む。
 *
 * 読み込みは呼び出し側（`exportCommand.ts`）の責務。このモジュールは
 * 受け取った文字列を焼き込むだけにしておく——そうしないと HTML 組み立てが
 * ビルド成果物の有無に依存し、`dist/` を持たない環境（CI の unit ジョブ）
 * ではテストできなくなる。
 */
export function readMermaidBundle(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundlePath = join(here, '..', 'dist', MERMAID_BUNDLE_FILE);
  try {
    return readFileSync(bundlePath, 'utf-8');
  } catch {
    throw new Error(
      `Mermaid の同梱バンドルが見つかりません: ${bundlePath}\n` +
        '  先に `bun run build` を実行してください',
    );
  }
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
  /**
   * Mermaid 描画エンジンの中身（`readMermaidBundle()` の戻り値）。
   * 渡すと生成物へ丸ごと焼き込み、オフラインのまま図が描画される。
   * 生成物は 3MB 以上大きくなるため、図が 1 つも無い文書では焼き込まない。
   */
  mermaidBundle?: string;
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

/**
 * Mermaid ブロック。既定ではソースを枠付きで見せるだけ。
 *
 * 描画エンジンを同梱する場合も、出発点はこの「ソース表示」のまま変えない。
 * 描画に成功したときだけ JS が図を差し込んで `data-mermaid="done"` を立て、
 * CSS がソース側を隠す。こうしておけば、JS が無効でも・描画に失敗しても
 * 何も欠けない（枠だけが残る、を避ける）。
 */
function renderMermaid(code: string, embedMermaid: boolean): string {
  const view = embedMermaid ? '<div class="mermaidView"></div>' : '';
  const attr = embedMermaid ? ' data-mermaid="pending"' : '';
  return `<figure class="mermaid"${attr}><figcaption>Mermaid</figcaption>${view}<pre><code>${esc(code)}</code></pre></figure>`;
}

function renderBlock(
  block: ReviewBlock,
  comments: RenderedComment[],
  embedMermaid: boolean,
): string {
  const body =
    block.type === 'mermaid'
      ? renderMermaid(block.mermaidCode ?? '', embedMermaid)
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
    mermaidBundle,
  } = input;

  const embedMermaid = typeof mermaidBundle === 'string';

  const md = createBlockRenderer(dirname(file), embedImages);
  const blocks = buildReviewBlocks(content, md);
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
  const { attached, unanchored } = anchorComments(blocks, rendered);
  const bodyParts = blocks.map((block) =>
    renderBlock(block, attached.get(block) ?? [], embedMermaid),
  );

  // mermaid のバンドルは 3MB を超える。図が 1 つも無ければ焼き込まない。
  const withMermaid = embedMermaid && blocks.some((b) => b.type === 'mermaid');
  const mermaidScript = withMermaid
    ? `<script>${inlineScriptSafe(mermaidBundle as string)}</script>\n<script>${MERMAID_BOOT}</script>`
    : '';
  const mermaidStyles = withMermaid ? MERMAID_STYLES : '';

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
<style>${STYLES}${mermaidStyles}</style>
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
${mermaidScript}
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

/* 描画エンジンを同梱したときだけ足すスタイル。描画に成功した図だけ
   ソース表示を畳む——pending / failed のままならソースが見えるので、
   JS 無効でも描画失敗でも情報は欠けない。 */
const MERMAID_STYLES = `
figure.mermaid[data-mermaid="done"]{border-style:solid;text-align:center}
figure.mermaid[data-mermaid="done"] figcaption,
figure.mermaid[data-mermaid="done"] pre{display:none}
.mermaidView svg{max-width:100%;height:auto}
`;

// 同梱した mermaid で図を描く。描けたものだけソース表示と差し替え、
// 失敗した図はソース表示のまま残す（1 つの図の構文エラーで他を巻き添えに
// しない）。テーマ切替のたびに描き直すため、ソースは DOM に残しておく。
const MERMAID_BOOT = `
(function(){
  var figures=[].slice.call(document.querySelectorAll('figure.mermaid[data-mermaid]'));
  if(!figures.length||!window.mermaid) return;
  var seq=0;
  function draw(){
    var dark=document.documentElement.getAttribute('data-theme')!=='light';
    window.mermaid.initialize({
      startOnLoad:false,
      theme:dark?'dark':'default',
      securityLevel:'strict',
    });
    figures.forEach(function(fig){
      var src=fig.querySelector('pre code');
      var view=fig.querySelector('.mermaidView');
      if(!src||!view) return;
      var code=src.textContent||'';
      Promise.resolve()
        .then(function(){ return window.mermaid.render('nymph-mmd-'+(seq++), code); })
        .then(function(res){
          view.innerHTML=res.svg;
          fig.setAttribute('data-mermaid','done');
        })
        .catch(function(){
          // 構文エラー等。ソース表示のまま据え置く
          view.innerHTML='';
          fig.setAttribute('data-mermaid','failed');
        });
    });
  }
  draw();
  document.getElementById('toggle-theme').addEventListener('click',function(){
    // テーマ確定後に描き直す
    setTimeout(draw,0);
  });
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
