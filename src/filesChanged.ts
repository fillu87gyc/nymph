/**
 * タブ一覧（開いているファイルと選択中タブ）が変わったことを SSE 接続へ伝える
 * 購読機構。
 *
 * タブ一覧はクライアントからは `/files` のフェッチでしか取れず、SSE（`/watch`）
 * が流していたのはファイル内容の変化と辞書更新だけだった。そのため別プロセスの
 * `nymph <file>` / `nymphx <file>` が既存インスタンスへ委譲してタブを増やしても
 * （`src/cli.ts` の委譲経路 → `/open-file`）、既に開いている画面は SWR の
 * revalidateOnFocus 頼み＝ウィンドウにフォーカスが戻るまでタブが現れなかった。
 *
 * タブ一覧を書き換えたハンドラが `notifyFilesChanged()` を呼び、SSE ストリームが
 * `subscribeFilesChanged()` で受けて `{ filesChanged: true }` を push する。
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * タブ一覧の変化を購読する。戻り値を呼ぶと購読を解除する。
 * SSE ストリームは接続ごとに購読し、cancel（クライアント切断）で解除すること。
 */
export function subscribeFilesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** タブ一覧が変わったことを購読者へ知らせる。 */
export function notifyFilesChanged(): void {
  // 配信中に購読解除されうる（クライアント切断）ため、スナップショットを回す。
  // Set を直接回すと、解除された分だけ以降の購読者が飛ばされる。
  for (const listener of [...listeners]) listener();
}
