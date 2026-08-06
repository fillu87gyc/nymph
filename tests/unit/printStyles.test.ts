/**
 * 印刷スタイル（styles/print.css）の回帰テスト。
 *
 * 印刷は「ライト配色で紙に出す」ことを前提にしているが、プレーン CSS では
 * [data-theme="light"] のトークンを @media print から参照できないため、値を
 * 書き写している。書き写しは放っておくとずれる（片方だけ色を変えた瞬間に
 * 印刷結果が壊れ、しかも画面を見ているかぎり気付けない）ので、ここで両者の
 * 一致を機械的に見張る。
 *
 * あわせて「紙に出すのは本文だけ」「スクロール容器を解く」という印刷 CSS の
 * 骨格が消えていないことも確認する（E2E では実際の描画結果を検証する）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const CLIENT_DIR = join(import.meta.dirname, '../../src/client');
const globalCss = readFileSync(join(CLIENT_DIR, 'styles/global.css'), 'utf8');
const printCss = readFileSync(join(CLIENT_DIR, 'styles/print.css'), 'utf8');
const styleCss = readFileSync(join(CLIENT_DIR, 'style.css'), 'utf8');
const appCss = readFileSync(join(CLIENT_DIR, 'App.module.css'), 'utf8');

/** `セレクタ { ... }` の中身から `--x: y` を Map に取り出す（ネストなしの前提）。 */
function customProps(css: string, selector: string): Map<string, string> {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`セレクタが見つからない: ${selector}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) {
    throw new Error(`ブロックを取り出せない: ${selector}`);
  }
  const body = css.slice(open + 1, close);
  const props = new Map<string, string>();
  for (const decl of body.split(';')) {
    const m = decl.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/s);
    if (m) props.set(m[1], m[2]);
  }
  return props;
}

describe('印刷スタイル', () => {
  test('style.css が global.css の後ろで print.css を読み込む（上書きが効く順序）', () => {
    const g = styleCss.indexOf('styles/global.css');
    const p = styleCss.indexOf('styles/print.css');
    expect(g).toBeGreaterThanOrEqual(0);
    expect(p).toBeGreaterThan(g);
  });

  test('@media print の配色が [data-theme="light"] と完全に一致する', () => {
    const light = customProps(globalCss, '[data-theme="light"]');
    const print = customProps(printCss, ':root');

    // 取り出せている前提（正規表現が空振りしていないことの担保）
    expect(light.size).toBeGreaterThan(10);
    expect(Object.fromEntries(print)).toEqual(Object.fromEntries(light));
  });

  test('ダークのトークンを印刷側で漏らさない（:root で定義される変数を全部上書きしている）', () => {
    const dark = customProps(globalCss, ':root');
    const print = customProps(printCss, ':root');
    for (const name of dark.keys()) {
      // --content-font / --ligatures のような配色以外の設定は印刷でも
      // そのまま使う（上書き対象は色だけ）。
      if (!/^--(content|ligatures)/.test(name)) {
        expect(print.has(name), `印刷側に ${name} が無い`).toBe(true);
      }
    }
  });

  test('紙に出すのは本文列だけ（残すものを指定して他を落とす形を保つ）', () => {
    expect(printCss).toContain('body > *:not(#root)');
    expect(printCss).toContain('#app > *:not(#main)');
    expect(printCss).toContain('#main > *:not([data-print-region])');
  });

  test('画面用のスクロール容器を印刷時に解く', () => {
    // html/body（styles/print.css）と本文列（App.module.css）の両方が要る。
    // 片方でも残っていると 1 ページ目で内容が切れる。
    expect(printCss).toMatch(/html,\s*body\s*\{[^}]*overflow:\s*visible/);
    const printBlock = appCss.slice(appCss.indexOf('@media print'));
    expect(printBlock).toContain('.contentGrid');
    expect(printBlock).toMatch(/overflow:\s*visible/);
  });
});
