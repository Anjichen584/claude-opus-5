#!/usr/bin/env bash
# 跑 C# 逻辑层测试(零第三方依赖,只编译 Assets/Scripts 下不依赖 UnityEngine 的目录)。
# 用法: bash unity/Tests/run.sh
# 依赖: .NET SDK 8+ —— 沙箱/CI 里没有就自动装,装到 $HOME/.local/dotnet。
#
# 为什么是 ~/.local(而不是 ~/.dotnet 或系统目录):
#   本仓库的工作区快照**按目录名排除** .local/.cache 等,装在 ~/.local/dotnet 的 SDK
#   (约 500 MB、4000+ 文件)既不进快照、也不占工作区预算。
#   2026-09-29 那次 565 MB 超限事故,一半就是 SDK 装在了 ~/.dotnet(不在排除名单里)——
#   代价是 4286 个文件没被快照保住。系统目录在无 sudo 环境里装不了,所以也别指望 /usr/share。
set -euo pipefail
cd "$(dirname "$0")/../.."

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
DOTNET_DIR="${DOTNET_DIR:-$HOME/.local/dotnet}"
SDK_CHANNEL="${SDK_CHANNEL:-8.0}"

if ! command -v dotnet >/dev/null 2>&1; then
  if [ -x "$DOTNET_DIR/dotnet" ]; then
    export PATH="$DOTNET_DIR:$PATH"
  else
    echo "[i] 本机没有 .NET SDK,自动安装到 $DOTNET_DIR(不进工作区快照)…" >&2
    curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    bash /tmp/dotnet-install.sh --channel "$SDK_CHANNEL" --install-dir "$DOTNET_DIR" >/dev/null
    export PATH="$DOTNET_DIR:$PATH"
  fi
fi
command -v dotnet >/dev/null 2>&1 || { echo "[!] .NET SDK 安装失败,请手动装到 $DOTNET_DIR" >&2; exit 127; }
dotnet run -c Release --nologo "$@" \
  --property:WarningLevel=4 \
  --project unity/Tests/StarfallLogicTests.csproj
