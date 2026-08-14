# WCRefine VoiceGateway

## 部署反代

```bash
git clone https://github.com/plumblossom26/WCRefine-VoiceGateway.git
cd WCRefine-VoiceGateway
cp .env.example .env
```

编辑 `.env`：

```ini
UPSTREAM_AUTH_MODE=passthrough
```

启动：

```bash
docker compose up -d --build
```

插件开启「反代服务」后，填写你的 HTTPS 地址即可。
