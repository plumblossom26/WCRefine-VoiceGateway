# WCRefine VoiceGateway

WCRefine 独立语音网关。插件只连接自己的网关地址，由服务器读取公共音色目录并访问上游语音服务，客户端不直接连接 GitHub Raw 或 Fish。

## 快速部署

Linux 服务器已安装 Docker 时：

```bash
export FISH_API_KEY='你的 Fish 服务端密钥'
curl -fsSL https://raw.githubusercontent.com/plumblossom26/WCRefine-VoiceGateway/main/scripts/deploy.sh | bash
```

脚本会生成 `PROXY_TOKEN`、克隆或更新仓库、构建镜像并启动容器。完成后会打印插件需要填写的网关令牌。

## 手动部署

```bash
git clone https://github.com/plumblossom26/WCRefine-VoiceGateway.git
cd WCRefine-VoiceGateway
cp .env.example .env
docker compose up -d --build
```

## 接口

- `GET /health`
- `GET /v1/audio/voice/catalog`
- `GET /v1/audio/voice/list`
- `POST /v1/audio/speech`
- `POST /v1/audio/voice-clone`
- `DELETE /v1/audio/voice/{id}`

目录接口公开读取，其余接口要求：

```http
Authorization: Bearer PROXY_TOKEN
```

## 插件配置

```text
供应商：OpenAI兼容
接口地址：https://你的网关域名
API Key：部署脚本生成的 PROXY_TOKEN
```

当前 Fish 的目录、合成、克隆、列表和删除链路已接入。FV、原神、日漫先提供目录，后续按稳定接口增加合成适配器。

合成模型可由客户端指定，未填写时使用服务端默认配置。

`UPSTREAM_AUTH_MODE=passthrough` 时使用客户端提供的上游凭证，默认模式则使用服务器配置。
