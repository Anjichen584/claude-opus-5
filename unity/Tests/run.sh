#!/usr/bin/env bash
# 跑 C# 逻辑层测试(零第三方依赖,只编译 Assets/Scripts 下不依赖 UnityEngine 的目录)。
# 用法: bash unity/Tests/run.sh
# 依赖: .NET SDK 8+(没有就装官方脚本: curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0)
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v dotnet >/dev/null 2>&1; then
  cat >&2 <<'EOF'
[!] 找不到 dotnet。安装(.NET SDK 8,装到系统路径最快):
    curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    sudo bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet
    sudo ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet
EOF
  exit 127
fi

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
dotnet run -c Release --nologo "$@" \
  --property:WarningLevel=4 \
  --project unity/Tests/StarfallLogicTests.csproj
