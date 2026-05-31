# 部署指南

## Cloudflare Workers

### 准备工作

1. 注册 [Cloudflare](https://cloudflare.com) 账号
2. 安装 wrangler：`npm install -g wrangler`
3. 登录：`wrangler login`

### 部署步骤

```bash
# 1. 克隆项目
git clone https://github.com/Dichgrem/calendar.git
cd calendar

# 2. 安装依赖
pnpm install

# 3. 创建 D1 数据库
cd packages/server
pnpm cf:d1:create
# 记录返回的 database_id

# 4. 更新配置
# 编辑 packages/server/wrangler.toml
# 替换 database_id

# 5. 运行迁移
pnpm cf:d1:migrate

# 6. 设置密钥
wrangler secret put SESSION_SECRET

# 7. 部署
pnpm cf:deploy
```

### 更新部署

```bash
cd calendar
git pull
pnpm install
cd packages/server
pnpm cf:deploy
```

## Docker

### 使用 Dockerfile

```bash
# 构建
docker build -t calendar .

# 运行
docker run -d -p 3000:3000 \
  -v calendar-data:/app/packages/server/data \
  -e SESSION_SECRET=your-secret \
  --name calendar calendar
```

### 使用 Docker Compose

```bash
docker compose up -d
```

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `SESSION_SECRET` | 会话签名密钥 | 是 |
| `CORS_ORIGIN` | 允许的跨域来源 | 否 |
| `DATABASE_URL` | SQLite 数据库路径 | 否 |
