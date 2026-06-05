# nymph install

nymph の PostToolUse フックをインストールします。以下の手順を実行してください。

## 1. フックスクリプトを配置

`~/.claude/plugins/nymph/` ディレクトリを作成し、`hook.sh` を以下の内容で書き込んでください:

```sh
#!/bin/sh
INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input', d)
    print(ti.get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

LOCK="${FILE_PATH}.nymph-lock"
[ -f "$LOCK" ] || exit 0

PORT=$(cat "$LOCK")

if ! echo "$INPUT" | curl -s --connect-timeout 0.1 -X POST \
     "http://localhost:${PORT}/edit-op" \
     -H "Content-Type: application/json" \
     --data-binary @- > /dev/null 2>&1; then
  rm -f "$LOCK"
fi
```

書き込み後、実行権限を付与してください:

```sh
chmod +x ~/.claude/plugins/nymph/hook.sh
```

## 2. ~/.claude/settings.json に PostToolUse フックを追加

`~/.claude/settings.json` を読み込み、`hooks.PostToolUse` 配列に以下のエントリを追加してください。配列が存在しない場合は作成してください:

```json
{
  "matcher": "Edit",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/plugins/nymph/hook.sh"
    }
  ]
}
```

完了したら「nymph フックをインストールしました」と報告してください。
