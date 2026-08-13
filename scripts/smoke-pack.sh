#!/usr/bin/env bash
#
# 公開物そのものに対する煙試験。
#
# `npm pack` した tarball を隔離ディレクトリへインストールし、CLI の入口を
# ひととおり叩く。狙いは package.json の `files` から実ファイルが漏れたまま
# publish される事故を止めること（1.0.3〜1.0.5 では `files` が
# "src/cli.ts", "src/server.ts" の明示列挙のままだったため、cli.ts が import
# する portUtils.ts / recent.ts が tarball に入らず、インストール直後に
# "Cannot find module './portUtils.ts'" で起動できなかった）。
#
# 作業ツリーで `bun run src/cli.ts` を叩いても、この種の漏れは絶対に出ない。
# 検証対象を `files` でふるいにかけた後の姿にするのが要点。
#
# bin は #!/usr/bin/env bun のまま TypeScript を直接指しているので、
# 相対 import はすべて実ファイルとして同梱されている必要がある。
#
# 使い方: bun run smoke:pack  （事前に bun run build が済んでいること）

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fail() {
  echo "::error::$*" >&2
  exit 1
}

# dist は .gitignore 済みで `files` 頼み。ビルドを忘れたまま publish すると
# 「起動はするが真っ白な画面」が配られるので、pack 前に手元で止める。
[ -f "$repo_root/dist/index.html" ] ||
  fail "dist/index.html がありません。先に bun run build を実行してください"

echo "==> npm pack"
(cd "$repo_root" && npm pack --silent --pack-destination "$work" >/dev/null)
tarball="$(echo "$work"/*.tgz)"
[ -f "$tarball" ] || fail "npm pack が tarball を作りませんでした"
echo "    $(basename "$tarball") ($(du -h "$tarball" | cut -f1))"

echo "==> 隔離ディレクトリへインストール"
app="$work/app"
mkdir -p "$app"
cd "$app"
# name を package 名と別にしておかないと自己参照になる
cat > package.json <<'JSON'
{ "name": "nymph-smoke", "version": "0.0.0", "private": true }
JSON
bun add "$tarball" >/dev/null 2>&1 || fail "tarball のインストールに失敗しました"

nymph="$app/node_modules/.bin/nymph"
[ -x "$nymph" ] || fail "bin/nymph が入っていません"

pkg_root="$app/node_modules/@fillu87gyc/nymph"
[ -s "$pkg_root/dist/index.html" ] ||
  fail "公開物に dist/index.html が入っていません（files の設定漏れ）"
compgen -G "$pkg_root/dist/assets/*.js" >/dev/null ||
  fail "公開物に dist/assets/*.js が入っていません（files の設定漏れ）"

printf '# smoke\n\n本文。\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n' > s.md

# 各サブコマンドを叩き、モジュール解決の失敗だけを落第にする。
# `--version` の静的 import で届くのは cli.ts から辿れる範囲だけで、
# --export / export / --annotate / dict build の実装は await import() の
# 先にいるため、入口ごとに一度は実行しないと同梱漏れが素通りする。
run() {
  local expect="$1" # ok = 終了コード 0 必須 / load = 解決さえ通れば可
  shift
  local out rc=0
  echo "==> nymph $*"
  out="$("$nymph" "$@" 2>&1)" || rc=$?
  if grep -qE "Cannot find module|Could not resolve|ERR_MODULE_NOT_FOUND" <<<"$out"; then
    echo "$out" >&2
    fail "公開物にファイルが足りません: nymph $*"
  fi
  if [ "$expect" = "ok" ] && [ "$rc" -ne 0 ]; then
    echo "$out" >&2
    fail "nymph $* が終了コード $rc で落ちました"
  fi
}

run ok   --version
run ok   s.md --export out.html
run ok   s.md --export out-mermaid.html --export-mermaid
run ok   export s.md
run ok   s.md --annotate out.md
# dict build は設定ファイルが無いので失敗して当然。ここで見たいのは
# dict/ 配下（build/config/consent/adapter/adapters/*/schema/selector/tree）が
# 読み込めることだけなので、終了コードは問わない。
run load dict build

[ -s "$app/out.html" ] || fail "--export が HTML を書き出しませんでした"
[ -s "$app/out.md" ] || fail "--annotate が Markdown を書き出しませんでした"

echo
echo "OK: 公開物の CLI 入口はすべて起動しました"
