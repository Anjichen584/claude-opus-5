#!/usr/bin/env bash
# 一键收尾:提交 → 推送 → 清沙箱。
#
# 用法:  tools/sync.sh "提交信息"
#
# 为什么要有这个脚本(2026-09-29 事故复盘):
#   构建沙箱的工作区快照上限约 128 MB,超过就会「静默丢掉大文件」——
#   本会话因此丢过 .git、node_modules 和 80 MB 美术源图共三次。
#   2026-09-29 第二次事故:快照会把 **.git 历史**回滚到更早的提交(工作树是新的、历史却落后),
#   于是 push 被 non-fast-forward 拒绝。本脚本现在带「历史对齐」自愈:先 fetch,
#   若自己在远程之后且工作树相对远程只有新增/修改(没有需要保留的本地提交),就自动
#   `git reset --soft origin/main` 后重新提交再推 —— 见第 2 步。
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

# ---- 权限自愈:快照不保留权限位 —— 密钥变 644 会被 ssh 拒绝,脚本自身也可能丢 +x ----
if [ -f "$HOME/.ssh/github_deploy" ]; then
  chmod 600 "$HOME/.ssh/github_deploy" 2>/dev/null || true
  [ -f "$HOME/.ssh/config" ] && chmod 600 "$HOME/.ssh/config" 2>/dev/null || true
fi
chmod +x "$0" 2>/dev/null || true

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
# 先取一次远程状态:快照可能把 .git 历史回滚(工作树却是新的),那样 push 必被拒。
git fetch origin main -q 2>/dev/null || true
if git rev-parse --verify -q origin/main >/dev/null; then
  if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
    # 远程领先(本地历史被回滚)。若本地 HEAD 没有"远程没有的提交",就能安全对齐。
    LOCAL_ONLY=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
    if [ "$LOCAL_ONLY" = "0" ]; then
      git reset --soft origin/main
      if ! git diff --cached --quiet; then
        git -c user.name="Arena Agent" -c user.email="agent@arena.ai" commit -q -m "$MSG"
        echo "🔄 已对齐远程历史(本地 .git 被快照回滚)并重新提交:$(git log --oneline -1)"
      else
        echo "🔄 已对齐远程历史(本地 .git 被快照回滚,工作树与远程一致)"
      fi
    else
      echo "⚠️  本地有 $LOCAL_ONLY 个远程没有的提交且远程领先 —— 需要人工 rebase,不要自动处理"
    fi
  fi
fi

if git push origin main >/dev/null 2>/tmp/push_err; then
  echo "🚀 已推送 origin/main"
else
  cat /tmp/push_err; echo "❌ 推送失败(原因见上)—— 检查密钥/网络后重试:git push origin main"
  exit 1
fi

# ---- 3. 清沙箱 ----
rm -f "$HOME"/*.png "$HOME"/*.jpg 2>/dev/null || true   # 临时预览拼图
rm -rf "$ROOT/web/dist" "$ROOT/unity/Tests/bin" "$ROOT/unity/Tests/obj" /tmp/refs /tmp/gh 2>/dev/null || true
SIZE=$(du -sm --exclude=node_modules --exclude=dist --exclude=.git "$ROOT" 2>/dev/null | cut -f1)
echo "🧹 已清理临时文件 · 工作区(不含 .git/node_modules)约 ${SIZE} MB"
if [ "$SIZE" -gt "$LIMIT_MB" ]; then
  echo "⚠️  超过 ${LIMIT_MB} MB 警戒线 —— 检查是否有大文件误入仓库(源图/中间产物)"
fi
