import os
import threading
import time
from http.server import ThreadingHTTPServer

import pytest

from nymph.server import Handler, find_port

SAMPLE_MD = """\
# フルスペック Markdown ドキュメント

**太字**、*イタリック*、~~打ち消し~~、`インラインコード` を含むリード文。

---

## 1. コードブロック

```python
def fibonacci(n: int) -> list[int]:
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]
```

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function fetchUser(id: string): Promise<Result<User>> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) return { ok: false, error: new Error(res.statusText) };
  return { ok: true, value: await res.json() };
}
```

```bash
#!/usr/bin/env bash
set -euo pipefail
poetry install --with dev
pytest tests/ -v --tb=short
```

## 2. Mermaid — シーケンス図

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant API
    participant DB

    User->>Browser: ログイン送信
    Browser->>API: POST /auth/login
    API->>DB: SELECT * FROM users
    DB-->>API: ユーザーレコード
    API-->>Browser: JWT トークン
    Browser-->>User: ダッシュボードへリダイレクト
```

## 3. Mermaid — フロー図

```mermaid
flowchart TD
    A([開始]) --> B{認証済み？}
    B -- Yes --> C[ダッシュボード表示]
    B -- No  --> D[ログインページ]
    D --> E[資格情報入力]
    E --> F{検証}
    F -- OK --> C
    F -- NG --> G[エラー表示]
    G --> E
    C --> H([終了])
```

## 4. テーブル

| メソッド | エンドポイント      | 説明             | 認証       |
|---------|-------------------|-----------------|-----------|
| GET     | `/api/users`      | ユーザー一覧取得  | 必要       |
| POST    | `/api/users`      | ユーザー作成     | 必要       |
| GET     | `/api/users/:id`  | ユーザー詳細     | 必要       |
| DELETE  | `/api/users/:id`  | ユーザー削除     | 管理者のみ  |

## 5. リスト

### 番号なしリスト（ネスト）

- クリーンアーキテクチャ
  - ドメイン層
  - アプリケーション層
  - インフラ層
- テスト種別
  - ユニットテスト
  - 統合テスト
  - E2E テスト

### 番号付きリスト

1. 要件定義
2. 設計
3. 実装
4. テスト
5. デプロイ

## 6. 引用

> コードは書かれるよりも読まれる回数の方が多い。
> — Guido van Rossum

## 7. JSON サンプル

```json
{
  "name": "nymph",
  "version": "0.1.0",
  "scripts": {
    "dev": "python -m nymph",
    "test": "pytest tests/ -v"
  }
}
```
"""


@pytest.fixture(scope="session")
def live_server(tmp_path_factory):
    md_path = tmp_path_factory.mktemp("e2e") / "test.md"
    md_path.write_text(SAMPLE_MD, encoding="utf-8")

    Handler.file_path = str(md_path)
    Handler.comments_path = str(md_path) + ".comments.json"

    port = find_port()
    httpd = ThreadingHTTPServer(("localhost", port), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.3)

    yield f"http://localhost:{port}"

    httpd.shutdown()


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "viewport": {"width": 1280, "height": 800}}


@pytest.fixture(autouse=True)
def clean_comments():
    """Remove comments file before each test for a clean state."""
    cp = Handler.comments_path
    if cp and os.path.exists(cp):
        os.remove(cp)
    yield
