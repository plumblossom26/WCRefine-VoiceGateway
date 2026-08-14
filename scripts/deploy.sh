#!/bin/sh
set -eu

REPO_URL="${REPO_URL:-https://github.com/plumblossom26/WCRefine-VoiceGateway.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/WCRefine-VoiceGateway}"

command -v docker >/dev/null 2>&1 || { echo "请先安装 Docker"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "请先安装 Docker Compose"; exit 1; }
[ -n "${FISH_API_KEY:-}" ] || { echo "请先执行: export FISH_API_KEY='你的密钥'"; exit 1; }

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
PROXY_TOKEN="${PROXY_TOKEN:-$(openssl rand -hex 32)}"
cat > .env <<EOF
PORT=8787
PROXY_TOKEN=$PROXY_TOKEN
FISH_API_KEY=$FISH_API_KEY
FISH_BASE_URL=https://api.fish.audio
VOICE_CATALOG_URL=https://raw.githubusercontent.com/plumblossom26/WCRefine-VoiceHub/main/catalog/voices.json
CATALOG_CACHE_PATH=/data/catalog.json
EOF

docker compose up -d --build
echo "VoiceGateway 已启动: http://SERVER_IP:8787"
echo "PROXY_TOKEN=$PROXY_TOKEN"

