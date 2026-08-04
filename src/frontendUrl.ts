/**
 * フロントエンド（アセット配信元）URL の解決。
 *
 * 本番の nymph では Bun サーバー自身が `dist/` を配るので、バックエンドの
 * ポート = フロント URL になる。しかし `bun run dev` では Vite dev server が
 * フロントを配っており、バックエンドのポート（:6276）を開いてもビルド済みの
 * 古い `dist/` が返るだけで、開発中の画面は見られない。
 *
 * そこで開発時は `NYMPH_FRONTEND_URL` に Vite の URL を渡してもらい、CLI が
 * 表示・自動オープンする URL をそちらへ切り替える。既存インスタンスへ委譲する
 * 側の CLI は `/version` からこの値を受け取るため（instanceLock.ts の
 * `fetchFrontendUrl`）、`nymph <file>` を後から実行した端末でも
 * バックエンドのポートではなくフロント URL が表示される。
 */

/**
 * フロント URL として使える文字列かを検証し、末尾スラッシュを落として返す。
 * http/https 以外や URL として解釈できない値は null（＝指定なし扱い）。
 */
export function normalizeFrontendUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.href.replace(/\/$/, '');
}

/**
 * このインスタンスのフロント URL を決める。
 * `NYMPH_FRONTEND_URL` が無ければバックエンド自身が dist/ を配る前提で
 * `http://localhost:<backendPort>` を返す（＝従来どおりの挙動）。
 */
export function resolveFrontendUrl(
  backendPort: number,
  envUrl: string | undefined,
): string {
  return normalizeFrontendUrl(envUrl) ?? backendUrl(backendPort);
}

/** バックエンド（API）の URL。表示用なので 127.0.0.1 ではなく localhost を使う */
export function backendUrl(port: number): string {
  return `http://localhost:${port}`;
}
