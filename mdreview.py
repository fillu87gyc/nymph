#!/usr/bin/env python3
"""
mdreview - Markdown review tool with hot reload
Usage: python3 mdreview.py <file.md>
"""
import sys, os, json, time, webbrowser, threading, socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# ── Embedded HTML ──────────────────────────────────────────────────────────────
HTML = r"""<!DOCTYPE html>
<html lang="ja" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MD Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@700&family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/marked@9/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
:root {
  --bg:           #0d0c0a;
  --bg-surface:   #161410;
  --bg-hover:     #1e1c18;
  --border:       #252218;
  --border-light: #302d25;
  --text:         #e4ddc8;
  --text-muted:   #6b6454;
  --text-dim:     #302d20;
  --accent:       #c27030;
  --accent-dim:   rgba(194,112,48,.13);
  --accent-glow:  rgba(194,112,48,.06);
  --code-bg:      #131210;
  --sb:           #252218;
}
[data-theme="light"] {
  --bg:           #f8f5ee;
  --bg-surface:   #eeeade;
  --bg-hover:     #e8e3d4;
  --border:       #d4cfc0;
  --border-light: #cac4b2;
  --text:         #28241c;
  --text-muted:   #887f6a;
  --text-dim:     #cac4b0;
  --accent:       #a85e20;
  --accent-dim:   rgba(168,94,32,.1);
  --accent-glow:  rgba(168,94,32,.05);
  --code-bg:      #eee9dc;
  --sb:           #cac4b2;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text);
  font-family: 'DM Sans', sans-serif; font-size: 14px; }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--sb); border-radius: 3px; }

/* ── App shell ── */
#app { display: flex; flex-direction: column; height: 100vh; }

/* ── Toolbar ── */
#toolbar {
  display: flex; align-items: center; gap: 6px;
  padding: 0 16px; height: 46px; flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.brand {
  font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700;
  color: var(--accent); letter-spacing: .02em; user-select: none; margin-right: 4px;
}
.watch-badge {
  display: flex; align-items: center; gap: 5px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted);
  background: var(--bg-surface); border: 1px solid var(--border);
  padding: 3px 9px; border-radius: 5px;
}
.watch-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #4a9a4a;
  box-shadow: 0 0 6px rgba(74,154,74,.6);
  animation: pulse 2s ease-in-out infinite;
}
.watch-dot.error { background: #c04040; box-shadow: 0 0 6px rgba(192,64,64,.6); animation: none; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
.update-time { font-size: 11px; color: var(--text-muted); font-family: 'DM Sans', sans-serif; }
.sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
.spacer { flex: 1; }
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: transparent; color: var(--text-muted); font-family: 'DM Sans', sans-serif;
  font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; white-space: nowrap;
}
.btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-light); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }
.btn.primary:hover { filter: brightness(1.1); }
.btn.icon { padding: 5px 8px; }
#comment-count {
  display: none; align-items: center; justify-content: center;
  width: 17px; height: 17px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 10px; font-weight: 700;
}
#comment-count.visible { display: inline-flex; }

/* ── Main scroll area ── */
#main { flex: 1; overflow-y: auto; }
#content {
  max-width: 820px; margin: 0 auto;
  padding: 48px 64px 80px;
}

/* ── Welcome ── */
#welcome {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; height: 60vh; opacity: .4; pointer-events: none;
}
#welcome.hidden { display: none; }
#welcome svg { opacity: .5; }
#welcome p { font-family: 'Lora', serif; font-size: 14px; color: var(--text-muted); text-align: center; line-height: 1.8; }

/* ── Markdown blocks ── */
.md-block {
  position: relative; margin-bottom: 1.35em;
  padding-left: 20px; margin-left: -20px;
}
.md-block::before {
  content: ''; position: absolute; left: 0; top: 2px; bottom: 2px;
  width: 2px; border-radius: 1px; background: transparent; transition: background .2s;
}
.md-block.has-comment::before { background: var(--accent); }
.md-block:hover::before { background: var(--border-light); }
.md-block.has-comment:hover::before { background: var(--accent); }

.comment-btn {
  position: absolute; left: -34px; top: 50%; transform: translateY(-50%);
  width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid var(--border); background: var(--bg-surface);
  color: var(--text-muted); font-size: 13px; line-height: 1;
  cursor: pointer; opacity: 0; transition: all .15s;
  display: flex; align-items: center; justify-content: center;
}
.md-block:hover .comment-btn,
.md-block.has-comment .comment-btn { opacity: 1; }
.md-block.has-comment .comment-btn {
  background: var(--accent-dim); border-color: var(--accent); color: var(--accent);
}

/* ── Markdown typography ── */
#content h1 {
  font-family: 'Playfair Display', serif; font-size: 2em; font-weight: 700;
  line-height: 1.2; color: var(--text);
  border-bottom: 1px solid var(--border); padding-bottom: .4em; margin-bottom: .1em;
}
#content h2 {
  font-family: 'Playfair Display', serif; font-size: 1.45em; font-weight: 700;
  color: var(--text); margin-top: .3em;
}
#content h3 {
  font-family: 'Lora', serif; font-size: 1.15em; font-weight: 500; color: var(--text);
}
#content h4, #content h5, #content h6 {
  font-family: 'DM Sans', sans-serif; font-size: .9em; font-weight: 600;
  text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted);
}
#content p {
  font-family: 'Lora', serif; font-size: 1em; line-height: 1.82; color: var(--text);
}
#content ul, #content ol {
  font-family: 'Lora', serif; font-size: 1em; line-height: 1.8; padding-left: 1.5em;
}
#content li { margin-bottom: .15em; }
#content code {
  font-family: 'JetBrains Mono', monospace; font-size: .83em;
  background: var(--code-bg); padding: .1em .4em; border-radius: 3px; color: var(--accent);
}
#content pre {
  background: var(--code-bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px 20px; overflow-x: auto; margin-bottom: 0;
}
#content pre code { background: none; padding: 0; font-size: .84em; color: var(--text); }
#content blockquote {
  border-left: 3px solid var(--accent); padding-left: 16px; margin-left: 0;
  color: var(--text-muted); font-family: 'Lora', serif; font-style: italic;
}
#content hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
#content table { width: 100%; border-collapse: collapse; font-family: 'DM Sans', sans-serif; font-size: .9em; }
#content th { background: var(--bg-surface); padding: 7px 12px; border: 1px solid var(--border); font-weight: 600; text-align: left; }
#content td { padding: 7px 12px; border: 1px solid var(--border); }
#content a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
#content img { max-width: 100%; border-radius: 6px; }
#content strong { font-weight: 700; }
#content em { font-style: italic; }

/* ── Mermaid block ── */
.mermaid-wrap {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden;
}
.mermaid-bar {
  display: flex; align-items: center; padding: 7px 12px;
  border-bottom: 1px solid var(--border); gap: 8px;
}
.mermaid-label {
  font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted);
}
.mermaid-label em { color: var(--accent); font-style: normal; }
.mermaid-area { padding: 24px; display: flex; justify-content: center; overflow-x: auto; }
.mermaid-area svg { max-width: 100%; }
.btn-drawio {
  margin-left: auto; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 500;
  padding: 3px 9px; border: 1px solid var(--border); border-radius: 4px;
  background: transparent; color: var(--text-muted); cursor: pointer; transition: all .15s;
}
.btn-drawio:hover { background: var(--bg-hover); color: var(--text); border-color: var(--accent); }

/* ── Comments panel ── */
#comments-panel {
  border-top: 1px solid var(--border); background: var(--bg);
  flex-shrink: 0; overflow: hidden; height: 0; transition: height .2s ease;
}
#comments-panel.open { height: 210px; }
.cpanel-head {
  display: flex; align-items: center; padding: 9px 18px;
  border-bottom: 1px solid var(--border); gap: 8px;
}
.cpanel-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .1em; color: var(--text-muted);
}
#comments-list { list-style: none; overflow-y: auto; max-height: 156px; }
.comment-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 9px 18px;
  border-bottom: 1px solid var(--border); cursor: pointer; transition: background .1s;
}
.comment-item:hover { background: var(--bg-hover); }
.c-line {
  flex-shrink: 0; font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--accent); background: var(--accent-dim);
  padding: 2px 6px; border-radius: 3px; white-space: nowrap; margin-top: 1px;
}
.c-body { flex: 1; min-width: 0; }
.c-text { font-size: 13px; color: var(--text); line-height: 1.45; }
.c-ctx {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted);
  margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.c-del {
  flex-shrink: 0; background: none; border: none; color: var(--text-dim);
  cursor: pointer; font-size: 13px; padding: 2px 4px; border-radius: 3px; transition: color .1s;
}
.c-del:hover { color: #b04040; }
#no-comments {
  padding: 28px 18px; text-align: center; color: var(--text-dim);
  font-size: 12px; font-style: italic;
}

/* ── Comment modal ── */
#comment-modal {
  position: fixed; inset: 0; z-index: 1000;
  display: none; align-items: flex-start; justify-content: flex-end;
}
#comment-modal.open { display: flex; }
#modal-backdrop { position: absolute; inset: 0; }
#modal-box {
  position: relative; width: 340px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.45);
  margin: 54px 18px 0; overflow: hidden;
}
.modal-head {
  padding: 11px 14px 8px; border-bottom: 1px solid var(--border);
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .08em; color: var(--accent);
}
.modal-ctx {
  padding: 7px 14px; background: var(--code-bg); border-bottom: 1px solid var(--border);
  font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted);
  max-height: 54px; overflow: hidden;
}
#comment-ta {
  width: 100%; padding: 11px 14px; background: transparent;
  border: none; color: var(--text); font-family: 'DM Sans', sans-serif;
  font-size: 13px; line-height: 1.6; resize: none; outline: none; min-height: 80px;
}
.modal-foot {
  display: flex; gap: 7px; padding: 7px 14px 11px; justify-content: flex-end;
}

/* ── draw.io modal ── */
#drawio-modal {
  position: fixed; inset: 0; z-index: 1000;
  display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.6); backdrop-filter: blur(2px);
}
#drawio-modal.open { display: flex; }
#drawio-box {
  width: 520px; max-width: 90vw; max-height: 80vh;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.dbox-head {
  display: flex; align-items: center; padding: 12px 16px;
  border-bottom: 1px solid var(--border); gap: 8px;
}
.dbox-title {
  font-size: 13px; font-weight: 600; color: var(--text); flex: 1;
}
.dbox-hint {
  padding: 10px 16px; font-size: 12px; color: var(--text-muted);
  border-bottom: 1px solid var(--border); line-height: 1.6;
}
.dbox-hint code {
  font-family: 'JetBrains Mono', monospace; font-size: .9em;
  background: var(--code-bg); padding: 1px 5px; border-radius: 3px; color: var(--accent);
}
.dbox-code {
  flex: 1; overflow-y: auto; padding: 14px 16px;
  background: var(--code-bg); margin: 10px 16px; border-radius: 6px;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: var(--text); white-space: pre; line-height: 1.7;
}
.dbox-foot {
  display: flex; gap: 8px; padding: 10px 16px 14px; border-top: 1px solid var(--border);
}

/* ── Toast ── */
#toast {
  position: fixed; bottom: 22px; right: 22px;
  background: var(--bg-surface); border: 1px solid var(--border-light); color: var(--text);
  padding: 9px 18px; border-radius: 8px; font-size: 13px;
  box-shadow: 0 4px 20px rgba(0,0,0,.35);
  transform: translateY(50px); opacity: 0;
  transition: all .28s cubic-bezier(.16,1,.3,1);
  z-index: 9999; pointer-events: none;
}
#toast.show { transform: translateY(0); opacity: 1; }
</style>
</head>
<body>
<div id="app">

  <header id="toolbar">
    <span class="brand">MD Review</span>
    <div class="watch-badge">
      <span class="watch-dot" id="watch-dot"></span>
      <span id="watch-name">—</span>
    </div>
    <span class="update-time" id="update-time"></span>
    <span class="sep"></span>
    <span class="spacer"></span>
    <button class="btn" id="btn-comments" title="コメントパネル">
      コメント <span id="comment-count"></span>
    </button>
    <button class="btn primary" id="btn-copy">レビューをコピー</button>
    <span class="sep"></span>
    <button class="btn icon" id="btn-theme" title="テーマ切替">◐</button>
  </header>

  <div id="main">
    <div id="content">
      <div id="welcome">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="4" width="28" height="32" rx="3" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 13h16M12 19h16M12 25h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <p>ファイルを読み込んでいます…</p>
      </div>
    </div>
  </div>

  <div id="comments-panel">
    <div class="cpanel-head">
      <span class="cpanel-title">レビューコメント</span>
      <span class="spacer"></span>
      <button class="btn icon" id="btn-close-panel">✕</button>
    </div>
    <ul id="comments-list">
      <li id="no-comments">コメントはまだありません。ブロックにカーソルを合わせて ＋ をクリック。</li>
    </ul>
  </div>

</div>

<!-- Comment input modal -->
<div id="comment-modal">
  <div id="modal-backdrop"></div>
  <div id="modal-box">
    <div class="modal-head" id="modal-line">コメントを追加</div>
    <div class="modal-ctx" id="modal-ctx"></div>
    <textarea id="comment-ta" placeholder="コメントを入力… (Cmd+Enter で追加)" rows="4"></textarea>
    <div class="modal-foot">
      <button class="btn" id="btn-cancel">キャンセル</button>
      <button class="btn primary" id="btn-submit">追加</button>
    </div>
  </div>
</div>

<!-- draw.io export modal -->
<div id="drawio-modal">
  <div id="drawio-box">
    <div class="dbox-head">
      <span class="dbox-title">draw.io エクスポート</span>
      <button class="btn icon" id="btn-close-drawio">✕</button>
    </div>
    <div class="dbox-hint">
      <strong>.drawio ファイルをダウンロード</strong>して draw.io で開くか、
      コードをコピーして draw.io の <code>挿入 › Mermaid</code> にペースト。
    </div>
    <div class="dbox-code" id="drawio-code"></div>
    <div class="dbox-foot">
      <button class="btn primary" id="btn-dl-drawio">⬇ .drawio ダウンロード</button>
      <button class="btn" id="btn-copy-mermaid">コードをコピー</button>
      <span class="spacer"></span>
    </div>
  </div>
</div>

<div id="toast"></div>

<script>
// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  source: '',
  comments: [],
  nextId: 1,
  pending: null,
  mermaidPending: null,
};

// ── Mermaid init ──────────────────────────────────────────────────────────────
let mermaidSeq = 0;

function initMermaid() {
  const dark = document.documentElement.dataset.theme !== 'light';
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: '"JetBrains Mono", monospace',
  });
}
initMermaid();

// ── Rendering ─────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function assignLines(src, tokens) {
  let from = 0;
  for (const t of tokens) {
    if (!t.raw) continue;
    const idx = src.indexOf(t.raw, from);
    if (idx === -1) continue;
    const before = src.substring(0, idx);
    t.ls = before.split('\n').length;
    const raw = t.raw.endsWith('\n') ? t.raw.slice(0, -1) : t.raw;
    t.le = t.ls + raw.split('\n').length - 1;
    from = idx + t.raw.length;
  }
}

const BLOCK_TYPES = new Set(['paragraph','heading','code','blockquote','list','hr','table','html']);

async function renderSource(src) {
  const el = document.getElementById('content');
  const welcome = document.getElementById('welcome');

  if (!src.trim()) {
    el.innerHTML = '';
    el.appendChild(welcome);
    welcome.classList.remove('hidden');
    return;
  }
  welcome.classList.add('hidden');

  const tokens = marked.lexer(src);
  assignLines(src, tokens);

  // Custom renderer with line tracking
  const blockTokens = tokens.filter(t => BLOCK_TYPES.has(t.type));
  let idx = 0;

  const renderer = new marked.Renderer();

  function wrap(inner, token) {
    const t = blockTokens[idx++] || token || {};
    const ls = t.ls || 1, le = t.le || ls;
    return `<div class="md-block" data-ls="${ls}" data-le="${le}">` +
           `<button class="comment-btn" aria-label="コメント">＋</button>` +
           inner + '</div>';
  }

  renderer.paragraph = (text) => wrap(`<p>${text}</p>`);
  renderer.heading    = (text, level) => wrap(`<h${level}>${text}</h${level}>`);
  renderer.blockquote = (q)    => wrap(`<blockquote>${q}</blockquote>`);
  renderer.list       = (body, ordered, start) => {
    const tag = ordered ? `ol${start !== 1 ? ` start="${start}"` : ''}` : 'ul';
    return wrap(`<${tag}>${body}</${tag}>`);
  };
  renderer.hr         = ()     => wrap('<hr>');
  renderer.table      = (h,b)  => wrap(`<table><thead>${h}</thead><tbody>${b}</tbody></table>`);
  renderer.html       = (html) => wrap(html);

  renderer.code = (code, lang) => {
    const t = blockTokens[idx++] || {};
    const ls = t.ls || 1, le = t.le || ls;
    if (lang === 'mermaid' || lang === 'mmd') {
      mermaidSeq++;
      const mid = `mermaid-${mermaidSeq}`;
      const enc = encodeURIComponent(code);
      return `<div class="md-block" data-ls="${ls}" data-le="${le}">` +
             `<button class="comment-btn">＋</button>` +
             `<div class="mermaid-wrap">` +
             `<div class="mermaid-bar">` +
             `<span class="mermaid-label"><em>Mermaid</em> Diagram</span>` +
             `<button class="btn-drawio" data-code="${enc}">→ draw.io</button>` +
             `</div>` +
             `<div class="mermaid-area"><div class="mermaid" id="${mid}">${esc(code)}</div></div>` +
             `</div></div>`;
    }
    return `<div class="md-block" data-ls="${ls}" data-le="${le}">` +
           `<button class="comment-btn">＋</button>` +
           `<pre><code class="language-${esc(lang||'')}">${esc(code)}</code></pre>` +
           `</div>`;
  };

  const html = marked.parse(src, { renderer });
  mermaidSeq = 0;
  idx = 0;

  el.innerHTML = html;
  el.appendChild(welcome);

  try {
    await mermaid.run({ querySelector: '#content .mermaid' });
  } catch(e) { console.warn('mermaid:', e); }

  restoreIndicators();
  attachHandlers();
}

// ── Comment indicators ────────────────────────────────────────────────────────
function restoreIndicators() {
  document.querySelectorAll('.md-block').forEach(b => {
    const ls = +b.dataset.ls, le = +b.dataset.le;
    b.classList.toggle('has-comment', state.comments.some(c => c.ls <= le && c.le >= ls));
  });
}

// ── Block interaction ─────────────────────────────────────────────────────────
function attachHandlers() {
  document.querySelectorAll('.comment-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const b = btn.closest('.md-block');
      const ls = +b.dataset.ls, le = +b.dataset.le;
      const lines = state.source.split('\n');
      const ctx = lines.slice(ls - 1, Math.min(ls + 2, le)).join('\n');
      openCommentModal(ls, le, ctx);
    });
  });

  document.querySelectorAll('.btn-drawio').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDrawioModal(decodeURIComponent(btn.dataset.code));
    });
  });
}

// ── Comment modal ─────────────────────────────────────────────────────────────
function openCommentModal(ls, le, ctx) {
  state.pending = { ls, le, ctx };
  document.getElementById('modal-line').textContent =
    ls === le ? `L${ls} にコメント追加` : `L${ls}–${le} にコメント追加`;
  document.getElementById('modal-ctx').textContent = ctx;
  document.getElementById('comment-ta').value = '';
  document.getElementById('comment-modal').classList.add('open');
  document.getElementById('comment-ta').focus();
}
function closeCommentModal() {
  document.getElementById('comment-modal').classList.remove('open');
  state.pending = null;
}
function submitComment() {
  const text = document.getElementById('comment-ta').value.trim();
  if (!text || !state.pending) return;
  const c = { id: state.nextId++, ls: state.pending.ls, le: state.pending.le,
              ctx: state.pending.ctx, text };
  state.comments.push(c);
  state.comments.sort((a,b) => a.ls - b.ls);
  closeCommentModal();
  saveComments();
  updatePanel();
  restoreIndicators();
  openPanel();
  toast('コメントを追加しました');
}

// ── draw.io modal ─────────────────────────────────────────────────────────────
function openDrawioModal(code) {
  state.mermaidPending = code;
  document.getElementById('drawio-code').textContent = code;
  document.getElementById('drawio-modal').classList.add('open');
}
function closeDrawioModal() {
  document.getElementById('drawio-modal').classList.remove('open');
  state.mermaidPending = null;
}
function downloadDrawio(code) {
  const mdata = JSON.stringify({ code, config: {} })
    .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="mdreview" version="1.0">
  <diagram id="mermaid-${Date.now()}" name="Mermaid Export">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" page="1"
      pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <UserObject label="" mermaid_data="${mdata}" id="2">
          <mxCell style="shape=mxgraph.mermaid.undefined;html=1;whiteSpace=wrap;align=center;"
            vertex="1" parent="1">
            <mxGeometry x="80" y="80" width="600" height="400" as="geometry"/>
          </mxCell>
        </UserObject>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  const blob = new Blob([xml], { type: 'application/xml' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `mermaid-${Date.now()}.drawio`
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast('.drawio をダウンロードしました');
}

// ── Comment panel ─────────────────────────────────────────────────────────────
function openPanel() { document.getElementById('comments-panel').classList.add('open'); }
function closePanel() { document.getElementById('comments-panel').classList.remove('open'); }

function updatePanel() {
  const list = document.getElementById('comments-list');
  const noEl = document.getElementById('no-comments');
  const cnt  = document.getElementById('comment-count');
  if (!state.comments.length) {
    list.innerHTML = '';
    list.appendChild(noEl);
    noEl.style.display = '';
    cnt.classList.remove('visible');
    return;
  }
  noEl.style.display = 'none';
  cnt.textContent = state.comments.length;
  cnt.classList.add('visible');
  list.innerHTML = '';
  state.comments.forEach(c => {
    const li = document.createElement('li');
    li.className = 'comment-item';
    const range = c.ls === c.le ? `L${c.ls}` : `L${c.ls}–${c.le}`;
    li.innerHTML = `<span class="c-line">${range}</span>
      <div class="c-body">
        <div class="c-text">${esc(c.text)}</div>
        <div class="c-ctx">${esc(c.ctx.split('\n')[0])}</div>
      </div>
      <button class="c-del" title="削除">✕</button>`;
    li.querySelector('.c-del').addEventListener('click', ev => {
      ev.stopPropagation();
      state.comments = state.comments.filter(x => x.id !== c.id);
      saveComments();
      updatePanel();
      restoreIndicators();
    });
    li.addEventListener('click', () => scrollToLine(c.ls));
    list.appendChild(li);
  });
}

function scrollToLine(ls) {
  const b = document.querySelector(`.md-block[data-ls="${ls}"]`);
  if (!b) return;
  b.scrollIntoView({ behavior: 'smooth', block: 'center' });
  b.style.outline = '2px solid var(--accent)';
  b.style.outlineOffset = '4px';
  setTimeout(() => { b.style.outline = ''; b.style.outlineOffset = ''; }, 1400);
}

// ── Copy review ───────────────────────────────────────────────────────────────
function copyReview() {
  if (!state.comments.length) { toast('コメントがありません'); return; }
  const lines = state.source.split('\n');
  const date = new Date().toLocaleDateString('ja-JP');
  let out = `# MD Review — ${date}\n\nコメント数: ${state.comments.length}\n\n---\n\n`;
  state.comments.forEach((c, i) => {
    const range = c.ls === c.le ? `L${c.ls}` : `L${c.ls}–${c.le}`;
    const excerpt = lines.slice(c.ls - 1, c.le).join('\n');
    out += `## [${i+1}] ${range}\n\n`;
    out += `\`\`\`\n${excerpt}\n\`\`\`\n\n`;
    out += `**コメント:** ${c.text}\n\n---\n\n`;
  });
  navigator.clipboard.writeText(out)
    .then(() => toast('レビューをコピーしました'))
    .catch(() => { // fallback
      const ta = Object.assign(document.createElement('textarea'), { value: out });
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      toast('レビューをコピーしました');
    });
}

// ── Server API ────────────────────────────────────────────────────────────────
async function loadContent() {
  const res = await fetch('/content');
  const { content, filename } = await res.json();
  document.getElementById('watch-name').textContent = filename;
  state.source = content;
  mermaidSeq = 0;
  await renderSource(content);
  const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('update-time').textContent = `更新: ${now}`;
}

async function loadComments() {
  try {
    const res = await fetch('/comments');
    const data = await res.json();
    state.comments = data;
    state.nextId = data.length ? Math.max(...data.map(c => c.id)) + 1 : 1;
    updatePanel();
  } catch(e) {}
}

function saveComments() {
  fetch('/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.comments),
  }).catch(() => {});
}

// ── SSE hot reload ────────────────────────────────────────────────────────────
function connectSSE() {
  const dot = document.getElementById('watch-dot');
  const sse = new EventSource('/watch');
  sse.onopen    = () => dot.classList.remove('error');
  sse.onerror   = () => dot.classList.add('error');
  sse.onmessage = async (e) => {
    if (e.data === 'reload') {
      await loadContent();
      toast('ファイルが更新されました');
    }
  };
}

// ── Theme ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-theme').addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'dark' : 'light';
  initMermaid();
  mermaidSeq = 0;
  renderSource(state.source);
  localStorage.setItem('mdreview-theme', document.documentElement.dataset.theme);
});

// ── Wire up buttons ───────────────────────────────────────────────────────────
document.getElementById('btn-comments').addEventListener('click', () =>
  document.getElementById('comments-panel').classList.toggle('open'));
document.getElementById('btn-close-panel').addEventListener('click', closePanel);
document.getElementById('btn-copy').addEventListener('click', copyReview);

document.getElementById('modal-backdrop').addEventListener('click', closeCommentModal);
document.getElementById('btn-cancel').addEventListener('click', closeCommentModal);
document.getElementById('btn-submit').addEventListener('click', submitComment);
document.getElementById('comment-ta').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment();
  if (e.key === 'Escape') closeCommentModal();
});

document.getElementById('btn-close-drawio').addEventListener('click', closeDrawioModal);
document.getElementById('drawio-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('drawio-modal')) closeDrawioModal();
});
document.getElementById('btn-dl-drawio').addEventListener('click', () =>
  downloadDrawio(state.mermaidPending));
document.getElementById('btn-copy-mermaid').addEventListener('click', () => {
  navigator.clipboard.writeText(state.mermaidPending || '')
    .then(() => toast('コードをコピーしました'));
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Init ──────────────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('mdreview-theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

(async () => {
  await loadContent();
  await loadComments();
  connectSSE();
})();
</script>
</body>
</html>"""


# ── HTTP Handler ───────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    file_path     = None
    comments_path = None

    def log_message(self, *_): pass  # suppress access logs

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ('/', '/index.html'):
            self._send(200, 'text/html; charset=utf-8', HTML.encode())
        elif path == '/content':
            self._serve_content()
        elif path == '/watch':
            self._serve_sse()
        elif path == '/comments':
            self._serve_comments()
        else:
            self._send(404, 'text/plain', b'Not found')

    def do_POST(self):
        if urlparse(self.path).path == '/comments':
            self._save_comments()
        else:
            self._send(404, 'text/plain', b'Not found')

    def _send(self, status, ctype, body):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _serve_content(self):
        try:
            with open(Handler.file_path, 'r', encoding='utf-8') as f:
                text = f.read()
            data = json.dumps({
                'content':  text,
                'filename': os.path.basename(Handler.file_path),
                'mtime':    os.path.getmtime(Handler.file_path),
            }).encode()
            self._send(200, 'application/json', data)
        except Exception as e:
            self._send(500, 'text/plain', str(e).encode())

    def _serve_sse(self):
        self.send_response(200)
        self.send_header('Content-Type',  'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection',    'keep-alive')
        self.end_headers()
        last = None
        try:
            while True:
                try:
                    mtime = os.path.getmtime(Handler.file_path)
                    if last is not None and mtime != last:
                        self.wfile.write(b'data: reload\n\n')
                        self.wfile.flush()
                    last = mtime
                except FileNotFoundError:
                    pass
                time.sleep(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _serve_comments(self):
        try:
            if os.path.exists(Handler.comments_path):
                with open(Handler.comments_path, 'r', encoding='utf-8') as f:
                    data = f.read().encode()
            else:
                data = b'[]'
            self._send(200, 'application/json', data)
        except Exception as e:
            self._send(500, 'text/plain', str(e).encode())

    def _save_comments(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            parsed = json.loads(body)
            with open(Handler.comments_path, 'w', encoding='utf-8') as f:
                json.dump(parsed, f, ensure_ascii=False, indent=2)
            self._send(200, 'application/json', b'{}')
        except Exception as e:
            self._send(500, 'text/plain', str(e).encode())


# ── Helpers ────────────────────────────────────────────────────────────────────
def find_port(start=6276):
    for port in range(start, start + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
    return start


# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print("使い方: python3 mdreview.py <file.md>")
        sys.exit(1)

    fpath = os.path.abspath(sys.argv[1])
    if not os.path.exists(fpath):
        print(f"エラー: {fpath} が見つかりません")
        sys.exit(1)

    Handler.file_path     = fpath
    Handler.comments_path = fpath + '.comments.json'

    port = find_port()
    server = HTTPServer(('localhost', port), Handler)

    url = f'http://localhost:{port}'
    print(f"MD Review  {url}")
    print(f"監視中     {fpath}")
    print("Ctrl+C で停止")

    threading.Timer(0.3, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")


if __name__ == '__main__':
    main()
