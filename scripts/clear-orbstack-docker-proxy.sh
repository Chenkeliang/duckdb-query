#!/usr/bin/env bash
# 清除 OrbStack 失效代理，并配置 DaoCloud 镜像加速（国内拉 docker.io 超时时用）
set -euo pipefail

CONFIG="${HOME}/.orbstack/config/docker.json"

if [[ ! -f "${CONFIG}" ]]; then
  echo "未找到 ${CONFIG}（可能未使用 OrbStack）"
  exit 0
fi

cp "${CONFIG}" "${CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
cat > "${CONFIG}" <<'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io"
  ]
}
EOF

if command -v orb >/dev/null 2>&1; then
  orb config set network_proxy none || true
fi

echo "✅ 已备份并更新 ${CONFIG}（移除 proxies，启用 registry-mirrors）"
echo "   请在菜单栏重启 OrbStack，然后: ./quick-start.sh"
