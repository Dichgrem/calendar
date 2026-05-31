# 项目结构

## 概览

```
calendar/
├── packages/
│   ├── server/              # 后端 (Hono + Drizzle + SQLite)
│   └── web/                 # 前端 (React 19 + Vite + FullCalendar)
├── docs/                    # 文档
├── biome.json               # 代码格式化
├── flake.nix                # Nix 开发环境
├── Justfile                 # 任务命令
└── turbo.json               # Turborepo 配置
```

## 服务端 (`packages/server/`)

```
server/
├── src/
│   ├── auth/
│   │   ├── auth.routes.ts   # 登录/注册/登出/修改密码接口
│   │   ├── auth.service.ts  # scrypt 密码哈希、会话管理
│   │   ├── middleware.ts     # 会话验证（httpOnly cookie，30 天有效期）
│   │   └── permissions.query.ts  # RBAC 查询级权限注入
│   ├── db/
│   │   ├── client.ts        # SQLite (better-sqlite3, WAL 模式) / D1 连接
│   │   └── schema.ts        # Drizzle 表定义（9 张表）
│   ├── routes/
│   │   ├── calendars.ts     # 日历 CRUD
│   │   ├── events.ts        # 事件 CRUD + 覆盖
│   │   ├── ics.ts           # ICS 导入/导出/预览
│   │   └── settings.ts      # 用户设置 + 备份/恢复
│   ├── services/
│   │   ├── calendar.service.ts
│   │   ├── event.service.ts
│   │   ├── ics.service.ts   # 自研 ICS 解析器 + 序列化器（RFC 5545）
│   │   └── settings.service.ts
│   ├── sync/
│   │   ├── routes.ts        # /sync/pull + /sync/push
│   │   └── sync.service.ts  # WatermelonDB 风格 pull/push 同步协议
│   ├── index.ts             # Node.js 入口
│   ├── worker.ts            # Cloudflare Workers 入口
│   └── types.ts             # 共享类型
├── drizzle/                 # 数据库迁移
├── wrangler.toml            # Cloudflare 配置
└── package.json
```

### 关键设计

- **单用户认证**：首次访问自动注册。scrypt 密码哈希，30 天 httpOnly cookie 会话。
- **RBAC 权限**：日历级 viewer/editor/admin 角色，查询时通过 LEFT JOIN 自动过滤。
- **软删除**：事件标记 `deleted=true`，不物理删除。
- **同步协议**：基于 `sync_sequence` 的 pull/push，LWW 冲突解决（基于 `last_modified` 时间戳），事务写入。
- **ICS 解析器**：自研（无第三方 ICS 库）。存储 `raw_ics` 保留额外 VEVENT 属性（VALARM, CATEGORIES, STATUS），确保导入导出保真。
- **双数据库**：本地开发/Docker 使用 SQLite（better-sqlite3）；Cloudflare Workers 生产环境使用 D1（`initD1Db()`）。

## 前端 (`packages/web/`)

```
web/
├── src/
│   ├── components/
│   │   ├── CalendarView.tsx  # FullCalendar 月视图 + 农历 + 搜索 + FAB
│   │   ├── EventEditor.tsx   # 双模式事件创建/编辑弹窗
│   │   ├── Layout.tsx        # 顶部导航栏 + Portal 插槽系统
│   │   ├── ColorSwatchPicker.tsx
│   │   ├── RequireAuth.tsx   # 路由守卫
│   │   └── ui/
│   │       ├── button.tsx    # CVA 按钮组件（default/outline/ghost × default/sm/icon）
│   │       └── modal.tsx     # 模态框组件
│   ├── hooks/
│   │   ├── use-auth.ts       # 认证状态
│   │   ├── use-calendars.ts  # 日历列表查询
│   │   ├── use-events.ts     # 多日历并行事件查询
│   │   ├── use-i18n.ts       # 中英文翻译
│   │   └── use-settings.ts   # 用户偏好设置
│   ├── lib/
│   │   ├── api.ts            # 类型安全的 fetch 封装
│   │   ├── colors.ts         # 日历颜色调色板（12 色）
│   │   ├── date-format.ts    # Java 风格日期格式
│   │   ├── lunar.ts          # 农历转换（chinese-days）
│   │   └── utils.ts          # cn() 工具函数
│   ├── pages/
│   │   ├── CalendarPage.tsx
│   │   ├── ImportPage.tsx    # ICS 导入预览（文件 + URL 标签页）
│   │   ├── LoginPage.tsx     # 认证（首次注册，后续登录）
│   │   └── SettingsPage.tsx  # 设置 + 日历管理
│   ├── types.ts
│   ├── main.tsx              # 入口：BrowserRouter + QueryClient
│   └── index.css
└── package.json
```

### 关键设计

- **Portal 插槽系统**：`Layout` 提供 `TopBarCtx`，`CalendarView` 通过 `createPortal` 将日期导航和日历切换按钮注入导航栏。
- **多日历并行查询**：`useEvents` 对每个可见日历发起独立查询，通过 TanStack Query `combine` 合并结果。
- **双模式 EventEditor**：联合类型 `EditMode | CreateMode` 实现创建/编辑共用同一组件。
- **Vite 代理**：开发时 `/api` 请求代理到 `localhost:3000`。

## 数据库 Schema

### 表

| 表名 | 用途 |
|------|------|
| `users` | 用户账号（单用户） |
| `sessions` | 认证会话 token + 过期时间 |
| `calendars` | 日历容器（名称、颜色、来源类型、所有者） |
| `calendar_members` | 用户-日历关联 + 角色（viewer/editor/admin） |
| `events` | 事件数据，含 RRULE 支持、软删除、`raw_ics` 字段 |
| `event_overrides` | 重复事件的单次覆盖 |
| `deleted_log` | 删除墓碑表（同步用） |
| `sync_sequence` | 变更序列号（同步用） |
| `user_settings` | 用户偏好（语言、每周首日、显示事件时间、日期格式、显示农历） |

### 关键字段

**events**
- `raw_ics` — 保留原始 ICS VEVENT，确保导入导出保真
- `calendar_id` — 关联日历表
- `deleted` — 软删除标记

**user_settings**
- `show_lunar_calendar` — 农历显示开关
- `date_format` — 自定义日期格式
- `show_event_time` — 时间显示开关

## 同步协议

WatermelonDB 风格的 pull/push 同步：

1. 客户端发送 `last_pulled_seq`（上次已知序列号）
2. 服务端返回该序列号之后的所有变更（created/updated/deleted）
3. 客户端合并并推送本地变更
4. 冲突解决：Last-Writer-Wins（基于 `last_modified` 时间戳）
5. 原子性：push 操作在数据库事务中执行

## ICS 处理

自研解析器（非第三方 ICS 库），支持：
- VEVENT 解析（SUMMARY, DTSTART, DTEND, DESCRIPTION, LOCATION, RRULE）
- 序列化：RFC 5545 合规（75 字符行折叠、`Z` 后缀 UTC 时间、`CALSCALE:GREGORIAN`）
- 导入模式：追加 / 覆盖（先清空日历再导入）
- 预览：解析后事件列表，支持逐项选择
- 远程获取：SSRF 防护（`isPrivateHost()`）
- 日期限制：1970-01-01 之前的日期自动 clamp，确保兼容性

## 部署目标

- **Docker**：Node.js 容器 + SQLite 文件卷挂载
- **Cloudflare Workers**：Hono 原生支持，通过 `initD1Db()` 连接 D1 数据库
