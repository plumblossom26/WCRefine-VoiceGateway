#!/bin/sh
set -eu

REPO_URL="${REPO_URL:-https://github.com/plumblossom26/WCRefine-VoiceGateway.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/WCRefine-VoiceGateway}"

command -v docker >/dev/null 2>&1 || { echo "请先安装 Docker"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "请先安装 Docker Compose"; exit 1; }

if [ -z "${DOMAIN:-}" ]; then
  [ -r /dev/tty ] || { echo "请设置 DOMAIN"; exit 1; }
  printf "反代域名: " > /dev/tty
  IFS= read -r DOMAIN < /dev/tty
fi
case "$DOMAIN" in
  ""|*[^A-Za-z0-9.-]*) echo "域名格式不正确"; exit 1 ;;
esac
if [ -z "${FISH_API_KEY:-}" ]; then
  [ -r /dev/tty ] || { echo "请设置 FISH_API_KEY"; exit 1; }
  printf "Fish API Key: " > /dev/tty
  stty -echo < /dev/tty
  trap 'stty echo < /dev/tty' EXIT HUP INT TERM
  IFS= read -r FISH_API_KEY < /dev/tty
  stty echo < /dev/tty
  trap - EXIT HUP INT TERM
  printf "\n" > /dev/tty
fi
[ -n "$FISH_API_KEY" ] || { echo "Fish API Key 为空"; exit 1; }

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
umask 077
PROXY_TOKEN="${PROXY_TOKEN:-$(openssl rand -hex 32)}"
cat > .env <<EOF
PORT=8787
BIND_ADDR=127.0.0.1
PROXY_TOKEN=$PROXY_TOKEN
FISH_API_KEY=$FISH_API_KEY
UPSTREAM_AUTH_MODE=server
FISH_BASE_URL=https://api.fish.audio
FISH_TTS_MODEL=s2.1-pro-free
VOICE_CATALOG_URL=https://raw.githubusercontent.com/plumblossom26/WCRefine-VoiceHub/main/catalog/voices.json
CATALOG_CACHE_PATH=/data/catalog.json
EOF
chmod 600 .env
cat > Caddyfile <<EOF
$DOMAIN {
    reverse_proxy gateway:8787
}
EOF

docker compose up -d --build
echo "VoiceGateway 已启动: https://$DOMAIN"
echo "插件 API Key: $PROXY_TOKEN"
