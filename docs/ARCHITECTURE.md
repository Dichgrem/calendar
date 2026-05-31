# Calendar 项目架构

## 总览

自托管日历应用，支持 ICS 导入/导出、单用户认证、离线同步。  
Monorepo 结构，前后端分离，SQLite 存储，可部署到 Docker 或 Cloudflare Workers。

```
calendar/
├── packages/
│   ├── server/          # Hono + SQLite 后端
│   └── web/             # React 19 + Vite 前端
├── flake.nix            # Nix 开发环境
├── Justfile             # 任务命令
├── turbo.json           # Turborepo 配置
└── biome.json           # 代码格式化
```

## 技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| 前端框架 | React 19 | SPA |
| 构建工具 | Vite 6 | 开发服务器 + 打包 |
| 路由 | React Router v7 | 客户端路由 |
| 状态管理 | TanStack Query v5 | 服务端状态 + 缓存 |
| 样式 | Tailwind CSS 3 + CVA | 原子化 CSS |
| UI 组件 | Radix UI (Slot) | 无头组件原语 |
| 日历组件 | FullCalendar v6 | 月视图渲染 + 交互 |
| 图标 | Lucide React | SVG 图标库 |
| 后端框架 | Hono v4 | 轻量 Web 框架 |
| 数据库 | SQLite (better-sqlite3) | 嵌入式数据库 |
| ORM | Drizzle ORM | 类型安全 SQL |
| 认证 | scrypt + httpOnly cookie | 密码哈希 + 会话 |
| 格式化 | Biome | 代码格式化（替代 Prettier） |
| Monorepo | pnpm + Turborepo | 工作区管理 |
| 开发环境 | Nix Flake | 可复现环境 |

## 前端架构 (`packages/web`)

```
src/
├── main.tsx              # 入口：BrowserRouter + QueryClient
├── components/
│   ├── Layout.tsx        # 顶部导航栏 + Portal 插槽系统
│   ├── CalendarView.tsx  # FullCalendar 月视图 + 日历切换 + FAB
│   ├── EventEditor.tsx   # 事件编辑/创建模态框
│   ├── RequireAuth.tsx   # 路由守卫
│   └── ui/
│       ├── button.tsx    # CVA 按钮组件
│       └── modal.tsx     # 模态框组件
├── pages/
│   ├── LoginPage.tsx     # 首次注册 / 登录
│   ├── CalendarPage.tsx  # 日历主页（挂载 CalendarView）
│   ├── SettingsPage.tsx  # 设置 + 日历管理
│   └── ImportPage.tsx    # ICS 导入预览
├── hooks/
│   ├── use-auth.ts       # 认证状态
│   ├── use-calendars.ts  # 日历列表查询
│   ├── use-events.ts     # 多日历事件并行查询
│   ├── use-settings.ts   # 用户设置
│   └── use-i18n.ts       # 中英文翻译（64 个键）
├── lib/
│   ├── api.ts            # 类型安全的 fetch 封装
│   └── utils.ts          # cn() 工具函数
└── types.ts              # 前端类型定义
```

### 关键设计

- **Portal 插槽系统**：`Layout` 提供 `TopBarCtx`，`CalendarView` 通过 `createPortal` 将日期导航和日历切换按钮注入导航栏
- **多日历并行查询**：`useEvents` 对每个可见日历发起独立查询，`combine` 合并结果
- **双模式 EventEditor**：通过联合类型 `EditMode | CreateMode` 支持编辑和创建两种模式
- **Vite 代理**：开发时 `/api` 请求代理到 `localhost:3000`

## 后端架构 (`packages/server`)

```
src/
├── index.ts              # Hono 应用入口
├── types.ts              # 服务端类型 + 权限类型
├── db/
│   ├── client.ts         # SQLite 连接（WAL 模式 + 外键约束）
│   └── schema.ts         # Drizzle 表定义（9 张表）
├── auth/
│   ├── auth.routes.ts    # /auth/* 路由
│   ├── auth.service.ts   # scrypt 哈希 + 会话管理
│   ├── middleware.ts      # 会话验证中间件
│   └── permissions.query.ts  # 查询级权限注入
├── routes/
│   ├── calendars.ts      # 日历 CRUD
│   ├── events.ts         # 事件 CRUD + 覆盖
│   ├── ics.ts            # ICS 导入/导出/预览
│   └── settings.ts       # 设置 + 备份/恢复
├── services/
│   ├── calendar.service.ts
│   ├── event.service.ts
│   ├── ics.service.ts    # 自研 ICS 解析器 + 序列化器
│   └── settings.service.ts
└── sync/
    ├── routes.ts         # /sync/pull + /sync/push
    └── sync.service.ts   # WatermelonDB 风格同步协议
```

### 关键设计

- **单用户认证**：首次访问自动注册，scrypt 密码哈希，30 天 httpOnly cookie 会话
- **RBAC 权限**：日历级 viewer/editor/admin 角色，查询时通过 LEFT JOIN 自动过滤
- **软删除**：事件删除标记 `deleted=true`，不物理删除
- **同步协议**：基于 `sync_sequence` 的 pull/push，LWW 冲突解决，事务写入

## 数据库模型

| 表 | 用途 |
|---|---|
| `users` | 用户账号（单用户场景） |
| `sessions` | 会话 token + 过期时间 |
| `calendars` | 日历容器（颜色、来源类型、所有者） |
| `calendar_members` | 用户-日历关联 + 角色 |
| `events` | 事件（RRULE 支持、软删除） |
| `event_overrides` | 循环事件的单次覆盖 |
| `deleted_log` | 删除墓碑表（同步用） |
| `sync_sequence` | 变更序列号（同步用） |
| `user_settings` | 用户偏好（时区、语言、每周首日） |

## API 路由

### 认证
- `GET /api/auth/status` — 是否已有用户
- `POST /api/auth/register` — 首次注册
- `POST /api/auth/login` — 登录
- `POST /api/auth/logout` — 登出
- `GET /api/auth/me` — 当前用户
- `POST /api/auth/change-password` — 修改密码

### 日历
- `GET /api/calendars` — 列表
- `GET /api/calendars/:id` — 详情
- `POST /api/calendars` — 创建
- `PATCH /api/calendars/:id` — 更新
- `DELETE /api/calendars/:id` — 删除

### 事件
- `GET /api/calendars/:calendarId/events?start=...&end=...` — 按范围查询
- `GET /api/events/:id` — 详情
- `POST /api/calendars/:calendarId/events` — 创建
- `PATCH /api/events/:id` — 更新
- `DELETE /api/events/:id` — 软删除
- `POST /api/events/:id/override` — 创建覆盖

### ICS
- `POST /api/ics/preview` — 预览解析结果
- `POST /api/ics/import` — 导入到日历
- `GET /api/calendars/:calendarId/ics/export` — 导出 ICS

### 设置 & 备份
- `GET /api/settings` — 获取设置
- `PATCH /api/settings` — 更新设置
- `POST /api/backup` — 创建备份
- `GET /api/backups` — 列出备份
- `GET /api/backup/download/:filename` — 下载备份
- `POST /api/backup/restore` — 恢复备份

### 同步
- `GET /api/sync/pull?last_pulled_seq=N` — 拉取变更
- `POST /api/sync/push` — 推送变更

## 核心开源组件

### FullCalendar v6 (`@fullcalendar/*`)
- **用途**：月视图渲染、日期导航、事件点击交互
- **插件**：`dayGridPlugin`（月视图）、`interactionPlugin`（点击/拖拽）
- **集成方式**：React 组件 `<FullCalendar>`，通过 `ref` 操作 API（`gotoDate`、`prev`、`next`、`today`）
- **自定义**：隐藏默认 header，自定义日期导航（中文月份 + 年份选择器）

### Hono v4
- **用途**：HTTP 路由框架，替代 Express
- **优势**：Web Standard API（Request/Response）、轻量、支持 Cloudflare Workers
- **中间件**：CORS、Zod 校验（`@hono/zod-validator`）、cookie 操作

### Drizzle ORM
- **用途**：类型安全的 SQLite 查询构建器
- **特性**：声明式 schema、自动迁移、WAL 模式支持
- **连接**：`better-sqlite3`（Node.js）/ `D1Database`（Cloudflare Workers，预留）

### TanStack Query v5
- **用途**：服务端状态管理、缓存、乐观更新
- **关键 hooks**：`useQuery`（日历/设置）、`useQueries` + `combine`（多日历事件并行查询）、`useMutation`（事件 CRUD）
- **缓存策略**：设置 60s stale time，日历/事件默认

### React Router v7
- **用途**：客户端 SPA 路由
- **结构**：`/auth/login`（公开）、`/calendar`、`/import`、`/settings`（需认证）
- **守卫**：`RequireAuth` 组件包装私有路由

### Radix UI
- **用途**：无头 UI 原语（`Slot` 用于 `asChild` 模式）
- **已有依赖**：`@radix-ui/react-dialog`、`@radix-ui/react-select`、`@radix-ui/react-popover`（预留）

### Tailwind CSS 3 + class-variance-authority (CVA)
- **用途**：原子化样式 + 组件变体管理
- **Button 变体**：`default` / `outline` / `ghost` × `default` / `sm` / `icon`
- **暗色模式**：`class` 策略，`dark:` 前缀

### Lucide React
- **用途**：SVG 图标（Calendar、Settings、LogOut、Plus）

### Biome
- **用途**：代码格式化（替代 Prettier）
- **配置**：2 空格缩进、100 字符行宽、仅格式化不 lint

## 开发环境

### Nix Flake
- Node.js 24、pnpm、Biome
- `direnv` 集成（`.envrc` → `use flake`）

### Justfile 命令
- `just start` — 启动 server + web 开发服务器
- `just stop` — 停止
- `just format` — 格式化代码

### 开发端口
- Server: `http://localhost:3000`
- Web: `http://localhost:5173`（代理 `/api` → 3000）

## 同步协议

WatermelonDB 风格的 pull/push 同步：

1. 客户端发送 `last_pulled_seq`（上次同步的序列号）
2. 服务端返回该序列号之后的所有变更（created/updated/deleted）
3. 客户端合并后推送本地变更
4. 冲突解决：Last-Writer-Wins（基于 `last_modified` 时间戳）
5. 原子性：push 操作在数据库事务中执行

## ICS 处理

自研解析器（非第三方库），支持：
- VEVENT 解析（SUMMARY、DTSTART、DTEND、DESCRIPTION、LOCATION、RRULE）
- 序列化：RFC 5545 合规（75 字符行折叠、`Z` 后缀 UTC 时间、`CALSCALE:GREGORIAN`）
- 导入模式：追加 / 覆盖（先清空日历再导入）
- 预览：解析后返回事件列表，支持逐项选择

## 部署目标

- **Docker**：Node.js 容器 + SQLite 文件挂载
- **Cloudflare Workers**：Hono 原生支持，D1 数据库（`createD1Db` 已预留）
