# 新しい API エンドポイントを追加するときのチェックリスト

## 1. サーバー（`src/server.ts`）

- `handleXxx(req)` 関数を追加
- `createServer` のルーティングに追加（GET / POST）

```typescript
// GET の例
if (path === '/your-endpoint') return handleYourEndpoint(url);

// POST の例
if (path === '/your-endpoint') return handleYourEndpoint(req);
```

## 2. Vite プロキシ（`vite.config.ts`）

開発時の HMR（`bun run dev`）でフロントエンドのリクエストをサーバーに転送するために必須。
**追加を忘れると開発環境でのみ 404 になる。**

```typescript
server: {
  proxy: {
    '/your-endpoint': 'http://localhost:6276',  // ← 追加
  },
},
```

## 3. クライアント（`src/client/hooks/`）

対応するフックに関数を追加して `return` に含める。

```typescript
const yourAction = useCallback(async (arg: string) => {
  const res = await fetch('/your-endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arg }),
  });
  return await res.json();
}, []);

return { ..., yourAction };
```

## 4. E2E テスト

新エンドポイントを使う機能の E2E を必ず追加する。
パターンは `/e2e-patterns` を参照。
