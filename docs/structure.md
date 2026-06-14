# 架构

## 概览

Calendar 是一个自托管日历应用，Go 后端 + React 前端，单二进制部署（~15 MiB）。

```
┌─────────────────────────────────────────────┐
│                   浏览器                      │
├─────────────────────────────────────────────┤
│  React SPA  │  CalDAV (DAVx5)  │  REST API  │
└──────────────┬──────────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────────┐
│              Go 二进制 (Chi)                  │
├─────────────────────────────────────────────┤
│  Auth  │  Calendar  │  Event  │  ICS        │
│  Backup│  Sync      │  Settings             │
├─────────────────────────────────────────────┤
│  SQLite (modernc)  │  go:embed 前端         │
└─────────────────────────────────────────────┘
```

## 目录结构

```
calendar/
├── cmd/server/              # Go 入口
│   ├── main.go
│   ├── dist/                # 前端构建产物（go:embed）
│   └── migrations/           # SQL 迁移文件（go:embed）
├── internal/
│   ├── apperror/            # 统一错误类型
│   ├── auth/                # 认证 + 会话 + PBKDF2
│   ├── backup/              # 数据库备份/恢复
│   ├── caldav/              # CalDAV 协议 (PROPFIND/PUT/DELETE/REPORT/MKCALENDAR)
│   ├── calendar/            # 日历 CRUD
│   ├── config/              # 环境变量读取
│   ├── db/                  # SQLite 连接
│   ├── event/               # 事件 CRUD + override
│   ├── ics/                 # ICS 解析/序列化/路由
│   ├── logger/              # 结构化日志系统（slog + 环形缓冲区）
│   ├── middleware/           # 认证、限流、错误、安全头
│   ├── settings/            # 用户设置
│   ├── sync/                # 同步 pull/push
│   └── validate/            # 共享校验
├── web/                     # React SPA（pnpm workspace）
│   ├── src/
│   │   ├── components/       # 前端组件
│   │   │   ├── MonthGrid.tsx  # 自建月视图（CSS Grid）
│   │   │   ├── CalendarView.tsx # 日历页
│   │   │   ├── CalendarManagement.tsx # 设置页日历管理
│   │   │   └── ...
│   │   ├── hooks/            # React hooks
│   │   ├── lib/              # 工具函数（日期格式、农历）
│   │   └── pages/            # 页面组件
├── go.mod / go.sum
├── Justfile                 # 任务运行器
├── Dockerfile               # 三阶段构建（node + go → alpine）
└── docker-compose.yml
```

## 设计决策

### 单二进制

React SPA 由 Vite 编译到 `cmd/server/dist/`，编译时通过 `//go:embed` 嵌入。
运行时 Chi 为非 API 路径提供静态文件，未知路径回退到 `index.html`（SPA）。

无需 CORS 配置、反向代理和独立静态文件服务器。WebView 同源访问。

### SQLite

[modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite)——纯 Go 实现，无 C 编译器依赖。
启用 WAL 模式。单写入连接（`SetMaxOpenConns(1)`）避免 SQLite 并发问题。

### 会话认证

基于 cookie 的会话，存储在 `sessions` 表。提取顺序：

1. `Authorization: Bearer <64-hex-token>`
2. `session_token` cookie

无 JWT——token 即会话 ID。和 WebView 自动携带 cookie 兼容。

### 密码哈希

PBKDF2 SHA-256，100,000 次迭代，16 字节盐值，32 字节输出。
存储格式 `"<64-hex-hash>:<32-hex-salt>"`。与旧 Node.js 实现（Web Crypto，相同参数）兼容。

### 错误处理

`AppError` 结构：`code`（HTTP 状态码）+ `error.code`（枚举）+ `error.message`（可读信息）。
中间件写入 `{ ok: false, error: ... }`。handler 只调 `JSONResponse` 或 `WriteAppError`。

## 数据流

### 请求生命周期

```
HTTP 请求
  → chi.Router (Logger, Recoverer, ErrorHandler, SecurityHeaders)
  → [RequireAuth] ← 提取会话，注入 PermissionContext
  → handler
    → json.Decode
    → 校验
    → db.Query/Exec
    → JSONResponse(w, status, data)
```

### 日历权限

每次日历访问由 `calendar_members` 校验。`RequireAuth` 在请求开始时加载所有成员关系，
存入 `PermissionContext.Roles`（map[calendarID]role）。

权限检查：
- `perm.IsMember(calendarID)` — 任意访问
- `perm.RequireRole(calendarID, "editor")` — 写入
- `perm.RequireRole(calendarID, "admin")` — 删除

角色层级：`viewer < editor < admin`。

### 重复事件例外

重复事件有 `rrule` 字段。单个实例修改存储在 `event_overrides`
（parent_id + original_date 唯一）。后端不展开 RRULE，前端负责。

### 软删除

事件 `deleted = 1` 标记。仍可通过 ID 访问，但不列入列表查询。日历硬删除并级联事件。

### ICS 存储

导入 ICS 文件时，每个 VEVENT 的原始文本完整保存在 `events.raw_ics` 中
（通过 `extractVEventsByUID` 从原始 ICS 按 UID 提取）。DB 的 `start_at`/`end_at`
列通过 `normalizeICSDate` 规范化为 ISO 8601 格式用于查询。

导出时，有 `raw_ics` 的事件直接输出原始 VEVENT 文本（保真导出）——
不经过 go-ical 重新序列化，避免丢失 `VALARM`、`X-FOSSIFY-*` 等属性。
CalDAV PROPFIND 同样使用 `raw_ics` 原文返回，确保 DAVx5 客户端
接收到与原始导入时完全一致的 ICS 数据。无 `raw_ics` 的事件从 DB 列重建。

## 数据库表设计

10 张表，主键均为 TEXT UUID。时间戳用 ISO 8601 文本。last_modified 为 epoch 毫秒。

### `users`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| username | TEXT UNIQUE | 1-100 字符 |
| password_hash | TEXT | `"<64-hex>:<32-hex>"`，PBKDF2 SHA-256 |
| created_at | TEXT | ISO 8601 |

### `sessions`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | 64 位 hex 随机 token |
| user_id | TEXT FK→users | 级联删除 |
| expires_at | TEXT | ISO 8601，每次请求校验 |

索引：`idx_sessions_expires(expires_at)`、`idx_sessions_user(user_id)`

### `calendars`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT | |
| color | TEXT | `#hex`，默认 `#3b82f6` |
| source_url | TEXT? | ICS 订阅地址 |
| source_type | TEXT | `manual`、`ics_import`、`ics_subscription` |
| owner_id | TEXT | 创建者 UUID |
| created_at / updated_at | TEXT | ISO 8601 |
| last_modified | INTEGER | epoch 毫秒 |

索引：`idx_calendars_owner(owner_id)`

### `calendar_members`

| 列 | 类型 | 说明 |
|---|---|---|
| calendar_id | TEXT FK→calendars | 级联删除 |
| user_id | TEXT FK→users | 级联删除 |
| role | TEXT | `viewer`、`editor`、`admin` |
| sort_order | INTEGER | 显示顺序 |

唯一约束 `(calendar_id, user_id)`。索引：`idx_calendar_members_user(user_id)`

### `events`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| calendar_id | TEXT FK→calendars | 级联删除 |
| title | TEXT | |
| description | TEXT? | |
| start_at / end_at | TEXT | ISO 8601 |
| all_day | INTEGER | 0/1 |
| rrule | TEXT? | RFC 5545 RRULE |
| color | TEXT? | 事件级别颜色覆盖 |
| location | TEXT? | |
| parent_id | TEXT? | 自引用，重复事件归属 |
| original_date | TEXT? | 事件发生日期 |
| deleted | INTEGER | 0/1 软删除 |
| raw_ics | TEXT? | 原始 ICS 来源 |
| created_at / updated_at | TEXT | ISO 8601 |
| last_modified | INTEGER | epoch 毫秒 |

索引：`idx_events_calendar_time(calendar_id, start_at, end_at)`、
`idx_events_calendar_modified(calendar_id, last_modified)`、
`idx_events_parent(parent_id)`、`idx_events_deleted(deleted)`

### `event_overrides`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| parent_id | TEXT FK→events | 级联删除 |
| original_date | TEXT | 被覆盖实例的日期 |
| override_start / override_end | TEXT? | ISO 8601 |
| override_title | TEXT? | |
| deleted | INTEGER | 0/1 |
| last_modified | INTEGER | epoch 毫秒 |

唯一索引：`idx_overrides_parent_date(parent_id, original_date)`

### `user_settings`

| 列 | 类型 | 说明 |
|---|---|---|
| user_id | TEXT PK FK→users | 级联删除 |
| language | TEXT | `zh-CN` 或 `en`，默认 `zh-CN` |
| first_day_of_week | INTEGER | 0-6，默认 1（周一） |
| show_lunar_calendar | INTEGER | 0/1 |

### `sync_sequence`

| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 自增，用作同步游标 |
| table_name | TEXT | `calendars`、`events` 等 |
| record_id | TEXT | 变更记录 UUID |
| op | TEXT | `created`、`updated`、`deleted` |
| synced_at | TEXT | ISO 8601 |

### `deleted_log`

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| table_name | TEXT | |
| record_id | TEXT | 已删除记录 UUID |
| deleted_at | TEXT | ISO 8601 |
| last_modified | INTEGER | epoch 毫秒 |

索引：`idx_deleted_log_modified(last_modified)`、`idx_deleted_log_table(table_name, record_id)`

## 核心依赖

| 包 | 用途 |
|---|---|
| `github.com/go-chi/chi/v5` | HTTP 路由（标准 `http.Handler` 接口） |
| `github.com/emersion/go-ical` | ICS 解析/序列化（CalDAV + 导入导出） |
| `modernc.org/sqlite` | 纯 Go SQLite 驱动 |
| `github.com/google/uuid` | UUIDv4 生成 |
| `golang.org/x/crypto` | PBKDF2 密码哈希 |
| `@tanstack/react-query` | 前端数据获取与缓存 |
| `@phosphor-icons/react` | 图标库 |
| `Tailwind CSS` | 样式工具 |

### 前端

前端采用 React 19 + Vite 6，**不使用 FullCalendar**。
月视图通过 `MonthGrid.tsx` 组件实现（CSS Grid 7×6 格），
支持农历显示、事件渲染、跨天事件展开、搜索跳转、暗色模式。
与 CalDAV / REST API 分别交互，切换月中仅重新获取数据，
无 FullCalendar 内部开销。

### CalDAV 同步

服务端实现 RFC 4791 CalDAV 协议子集，支持 DAVx5 Android 客户端双向同步。
PROPFIND/REPORT/GET/PUT/DELETE/MKCALENDAR 等 HTTP 方法由 `internal/caldav/`
处理，`middleware.CaldavAuth` 校验 Basic 认证。

CalDAV 路由注册在 `/dav/` 前缀下，REST API 在 `/api/` 下，二者独立工作。
事件 ID 由 ICS UID 或 URL 文件名决定（不含随机 UUID），确保 PUT/DELETE
与 PROPFIND 返回的 href 一致。

### 日志系统

全局结构化日志由 `internal/logger/` 提供：`slog.TextHandler` 输出到 stderr，
同时写入 2000 行环形缓冲区。三级 API：`logger.Info()`、`logger.Error()`、
`logger.Debug()`。`GET /api/logs?n=500&level=error` 返回 JSON 格式日志，
前端设置页面提供查看、过滤、导出功能。

所有 handler 入口均打 DEBUG，成功打 INFO，失败打 ERROR。详情见 `docs/log.md`。

## 迁移系统

SQL 迁移文件位于 `cmd/server/migrations/`，通过 `//go:embed` 嵌入。
启动时按分号分割并逐条执行。所有 DDL 使用 `IF NOT EXISTS` / `IF EXISTS` 保证幂等。

新增迁移以编号文件追加（`00002_xxx.sql` 等）。

## 备份策略

`POST /api/backup` 执行 `PRAGMA wal_checkpoint(TRUNCATE)` 将 WAL 写入主文件，
然后以 UTC 时间戳命名复制到 `backups/`。恢复时覆盖文件并提示重启。
