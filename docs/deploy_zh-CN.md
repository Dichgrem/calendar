# 部署指南

## Cloudflare Workers

### 一键部署

```bash
just cf-deploy
```

此脚本自动完成：复制 `wrangler.toml` → 创建 D1 数据库 → 运行迁移 → 设置 `SESSION_SECRET` → 部署。

### 手动步骤

```bash
# 1. 克隆项目
git clone https://github.com/Dichgrem/calendar.git
cd calendar

# 2. 安装依赖
pnpm install

# 3. 复制示例配置
cd packages/server
cp wrangler.toml.example wrangler.toml

# 4. 创建 D1 数据库
pnpm cf:d1:create
# --update-config 标志会自动将 database_id 写入 wrangler.toml

# 5. 运行迁移
pnpm cf:d1:migrate

# 6. 设置密钥
npx wrangler secret put SESSION_SECRET

# 7. 构建前端并部署
cd ../..
pnpm --filter @calendar/web build
cd packages/server
pnpm cf:deploy
```

### 更新部署

```bash
cd calendar
git pull
pnpm install
cd packages/server
pnpm cf:d1:migrate
pnpm cf:deploy
```

## Docker

### 使用 Justfile（推荐）

```bash
just docker-up       # 构建并启动
just docker-logs     # 查看日志
just docker-down     # 停止
```

### 使用 Docker Compose

```bash
docker compose up -d
```

启动时自动运行数据库迁移，无需手动执行。访问 http://localhost:3000。

### 使用 Dockerfile

```bash
docker build -t calendar .
docker run -d -p 3000:3000 \
  -v calendar-data:/app/data \
  -e DATABASE_URL=/app/data/calendar.db \
  -e SESSION_SECRET=your-secret \
  --name calendar calendar
```

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `SESSION_SECRET` | 会话签名密钥 | 是 |
| `CORS_ORIGIN` | 允许的跨域来源 | 否 |
| `DATABASE_URL` | SQLite 数据库路径（仅 Node.js） | 否 |
| `PORT` | 服务端口（默认 3000） | 否 |
