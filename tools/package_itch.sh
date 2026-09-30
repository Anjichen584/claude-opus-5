#!/usr/bin/env bash
# itch.io 打包(轮 9/46):构建相对路径版 → zip(index.html 在包根,itch 的硬要求)。
# 用法:bash tools/package_itch.sh  → 产物 release/starfall-knights-itch.zip
set -euo pipefail
cd "$(dirname "$0")/../web"
[ -d node_modules ] || npm ci --silent   # 自愈:快照不带依赖
echo "▶ 构建(相对 base,itch 的 iframe 环境用)"
npx vite build --base=./ >/dev/null
cd dist
mkdir -p ../../release
ZIP=../../release/starfall-knights-itch.zip
rm -f "$ZIP"
zip -qr "$ZIP" .
cd ../..
# 自检:zip 根上必须有 index.html(itch 只认根)
if ! unzip -l release/starfall-knights-itch.zip | grep -q ' index.html'; then
  echo "✗ 包根没有 index.html" >&2; exit 1
fi
echo "✅ release/starfall-knights-itch.zip ($(du -h release/starfall-knights-itch.zip | cut -f1))"
