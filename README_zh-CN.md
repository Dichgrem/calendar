<p align="right">
  <a href="README.md">English</a> |
  <a href="README_zh-CN.md">简体中文</a>
</p>

# Calendar

轻量级自托管日历应用，支持 ICS 导入导出和农历显示。

---

## 功能特性

- **多平台部署** — Cloudflare Workers、Node.js / Docker
- **Web 界面** — FullCalendar 月视图、深色模式、移动端适配
- **单用户认证** — 密码登录，Cookie 会话管理
- **ICS 导入导出** — 文件上传、远程 URL、日历管理
- **农历显示** — 内置中国农历日期显示
- **事件搜索** — 全局搜索，支持按日历筛选
- **常用日历** — 一键订阅中国节假日、节日纪念日、二十四节气
- **日期格式** — 自定义日期时间显示
- **国际化** — 支持中文和英文

---

## 快速开始

### Cloudflare Workers（推荐，免费）

```bash
# 1. 克隆项目
git clone https://github.com/Dichgrem/calendar.git
cd calendar

# 2. 安装依赖
pnpm install

# 3. 复制并编辑配置
cd packages/server
cp wrangler.toml.example wrangler.toml

# 4. 创建 D1 数据库，将 database_id 填入 wrangler.toml
pnpm cf:d1:create

# 5. 运行迁移并设置会话密钥
pnpm cf:d1:migrate
npx wrangler secret put SESSION_SECRET

# 6. 部署
pnpm cf:deploy
```

### Node.js / Docker

**直接运行 Node.js：**
```bash
cd calendar
pnpm install
pnpm dev
# 服务端: http://localhost:3000
# 前端: http://localhost:5173
```

**Docker：**
```bash
docker build -t calendar .
docker run -d -p 3000:3000 -v calendar-data:/data --name calendar calendar
```

---

## 文档

| 文档 | EN | 中文 |
|---|---|---|
| 使用指南 | [usage.md](docs/usage.md) | [usage_zh-CN.md](docs/usage_zh-CN.md) |
| 部署指南 | [deploy.md](docs/deploy.md) | [deploy_zh-CN.md](docs/deploy_zh-CN.md) |
| API 参考 | [api.md](docs/api.md) | [api_zh-CN.md](docs/api_zh-CN.md) |
| 开发指南 | [dev-guide.md](docs/dev-guide.md) | [dev-guide_zh-CN.md](docs/dev-guide_zh-CN.md) |
| 架构与结构 | [structure.md](docs/structure.md) | [structure_zh-CN.md](docs/structure_zh-CN.md) |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Vite 6, FullCalendar v6, TanStack Query v5 |
| 样式 | Tailwind CSS 3, CVA, Radix UI, Lucide React |
| 后端 | Hono v4, Drizzle ORM |
| 数据库 | SQLite (better-sqlite3), Cloudflare D1 |
| 认证 | scrypt 密码哈希, httpOnly cookie 会话 |
| 工具 | pnpm, Turborepo, Biome, Nix Flake |

---

## 许可证

[GNU AGPL v3.0](LICENSE)
