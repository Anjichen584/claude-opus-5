#!/usr/bin/env bash
# 一键收尾:提交 → 推送 → 清沙箱。
#
# 用法:  tools/sync.sh "提交信息"
#
# 为什么要有这个脚本(2026-09-29 事故复盘):
#   构建沙箱的工作区快照上限约 128 MB,超过就会「静默丢掉大文件」——
#   本会话因此丢过 .git、node_modules 和 80 MB 美术源图共三次。
#   纪律:每写完一小块就推送;工作区不留大文件;临时拼图(预览 PNG)用完即删。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MSG="${1:?用法: tools/sync.sh \"提交信息\"}"
LIMIT_MB=60   # 工作区(不含 node_modules/dist)超过这个数就告警

cd "$ROOT"

# ---- 0. 自愈:.git/config 属敏感路径,快照会剥离 —— 环境重建后远程配置必丢 ----
REMOTE_URL="git@github.com:Anjichen584/claude-opus-5.git"
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE_URL"
  git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
  git config branch.main.remote origin
  git config branch.main.merge refs/heads/main
  echo "🔧 已自愈 origin 远程配置(快照剥离了 .git/config)"
fi

# 密钥缺失时的友好提示(环境重建会清掉 ~/.ssh)
if [ ! -f "$HOME/.ssh/github_deploy" ]; then
  echo "⚠️  缺少部署密钥 ~/.ssh/github_deploy —— 请重新放置后再推送(见 docs/07-CONTRIBUTING.md)"
fi

# ---- 1. 提交 ----
git add -A
if git diff --cached --quiet; then
  echo "ℹ️  没有需要提交的改动"
else
  git -c user.name="Arena Agent" -c user.email="agent@arena.ai" commit -q -m "$MSG"
  echo "📝 已提交:$(git log --oneline -1)"
fi

# ---- 2. 推送(密钥走 ~/.ssh/config)----
if git push origin main >/dev/null 2>/tmp/push_err; then
  echo "🚀 已推送 origin/main"
else
  cat /tmp/push_err; echo "❌ 推送失败(原因见上)—— 检查密钥/网络后重试:git push origin main"
  exit 1
fi

# ---- 3. 清沙箱 ----
rm -f "$HOME"/*.png "$HOME"/*.jpg 2>/dev/null || true   # 临时预览拼图
rm -rf "$ROOT/web/dist" /tmp/refs /tmp/gh 2>/dev/null || true
SIZE=$(du -sm --exclude=node_modules --exclude=dist --exclude=.git "$ROOT" 2>/dev/null | cut -f1)
echo "🧹 已清理临时文件 · 工作区(不含 .git/node_modules)约 ${SIZE} MB"
if [ "$SIZE" -gt "$LIMIT_MB" ]; then
  echo "⚠️  超过 ${LIMIT_MB} MB 警戒线 —— 检查是否有大文件误入仓库(源图/中间产物)"
fi
