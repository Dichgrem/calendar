# 开发指南

## 环境要求

- Node.js ≥ 24
- pnpm ≥ 8

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
just start

# 或分别启动
pnpm --filter @calendar/server dev
pnpm --filter @calendar/web dev
```

访问 http://localhost:5173（`/api` 代理到 http://localhost:3000）

## Nix 开发环境

Nix Flake 提供可复现环境，包含 Node.js、pnpm、Biome。

```bash
# 使用 direnv（进入目录自动激活）
echo "use flake" > .envrc
direnv allow

# 或手动激活
nix develop
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `just start` | 启动开发环境 |
| `just stop` | 停止服务 |
| `just test` | 运行单元测试 (vitest, 98 测试) |
| `just format` | Biome 格式化代码 |
| `just lint` | Biome 代码检查 |
| `just typecheck` | 两个包的类型检查 |
| `just clean` | 清理构建产物 |
| `just cf-deploy` | 部署到 Cloudflare Workers |
| `just docker-up` | 构建并启动 Docker 容器 |
| `just docker-down` | 停止 Docker 容器 |
| `just docker-logs` | 查看 Docker 日志 |

## 移动端 (React Native)

```bash
cd packages/mobile
pnpm --filter @calendar/mobile start
# 按 'a' 启动 Android
```

需要 Android SDK + Expo CLI。使用与 web 前端相同的 API 服务器。
在 `.env` 中配置 `EXPO_PUBLIC_API_URL` 设置服务器地址。

## 项目结构

```
calendar/
├── packages/
│   ├── server/          # Hono 后端
│   │   ├── src/
│   │   │   ├── auth/    # 认证模块
│   │   │   ├── db/      # 数据库
│   │   │   ├── routes/  # API 路由
│   │   │   ├── services/# 业务逻辑
│   │   │   └── sync/    # 同步协议
│   │   └── wrangler.toml
│   └── web/             # React 前端
│       ├── src/
│       │   ├── components/
│       │   │   └── ui/  # CVA 按钮、模态框
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── pages/
│       └── index.html
├── docs/                # 文档
├── biome.json           # 代码格式化配置
├── flake.nix            # Nix 环境
├── Justfile             # 任务命令
└── turbo.json           # Turborepo 配置
```

## 数据库

### 生成迁移

```bash
cd packages/server
pnpm db:generate
```

### 运行迁移

```bash
pnpm db:migrate
```

## 代码规范

- TypeScript 严格模式
- Biome 格式化（2 空格缩进，100 字符行宽）
- 提交信息遵循 Conventional Commits

## 核心技术详情

| 技术 | 用途 |
|------|------|
| React 19 + Vite 6 | SPA 前端 |
| FullCalendar v6 | 月视图渲染 |
| TanStack Query v5 | 服务端状态 + 缓存 |
| React Router v7 | 客户端路由 |
| Tailwind CSS 3 + CVA | 原子化 CSS + 组件变体管理 |
| Radix UI | 无头组件原语（Dialog, Select, Popover, Slot） |
| Phosphor Icons | SVG 图标库（bold 粗体） |
| Hono v4 | 轻量 Web 框架 |
| Drizzle ORM | 类型安全 SQL 查询构建 |
| SQLite (better-sqlite3) | 嵌入式数据库 |
| Cloudflare D1 | 生产环境数据库 |
| scrypt-js | 密码哈希（同步，兼容 Node.js 和 Workers） |
| Biome | 代码格式化 |
