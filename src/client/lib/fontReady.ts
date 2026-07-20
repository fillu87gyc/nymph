/**
 * Web フォントのロード完了を確実に待つためのヘルパー。
 *
 * `document.fonts.ready` は「その時点でロード中のフォントが無ければ」即座に
 * 解決するため、Google Fonts の <link> CSS がまだ適用されていないタイミングで
 * await すると、フォールバックフォントのままテキスト計測が走るレースがある
 * （mermaid のダイアグラム寸法が描画ごとに揺れる根本原因）。
 *
 * ここでは
 *   1. 文書中の全 stylesheet <link> の決着（load / error）を待ち、
 *   2. 対象フォントを FontFaceSet.load() で明示的にロードしてから
 *   3. fonts.ready を待つ。
 * オフライン等でロードできない場合も timeoutMs 経過後にフォールバックで続行する。
 */

/** 決着（load/error/タイムアウト）を確認済みの link。再訪時に待ち直さない。 */
const settledLinks = new WeakSet<HTMLLinkElement>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function linkSettled(link: HTMLLinkElement): Promise<void> {
  if (link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
  });
}

export async function waitForFonts(
  specs: readonly string[],
  timeoutMs = 3000,
): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return;

  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ).filter((l) => !settledLinks.has(l));
  if (links.length > 0) {
    await Promise.race([Promise.all(links.map(linkSettled)), delay(timeoutMs)]);
    // タイムアウトした link も決着扱いにする（以後の呼び出しで待ち続けない）
    for (const l of links) settledLinks.add(l);
  }

  try {
    await Promise.race([
      Promise.all(specs.map((s) => fonts.load(s))),
      delay(timeoutMs),
    ]);
  } catch {
    // NetworkError 等でロードできない場合はフォールバックフォントで続行
  }
  await fonts.ready;
}
