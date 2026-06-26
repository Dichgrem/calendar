# 开发指南

## 环境要求

- Go 1.25+
- Node.js 22+
- pnpm 11
- （可选）启用了 flakes 的 Nix

## 初始化

```bash
# JS 依赖
pnpm install

# 构建前端（go:embed 需要）
pnpm --filter @calendar/web build
cp -r web/dist cmd/server/dist

# Go 依赖
go mod download
```

Nix 用户：`nix develop` 提供 go、gopls、sqlite、nodejs、pnpm、biome。

## 日常开发

```bash
go run ./cmd/server/                   # 启动服务
pnpm --filter @calendar/web dev        # 前端 HMR (localhost:5173)
just dev                               # 预构建前端 + 启动后端
```

## 运行测试

```bash
go test ./... -count=1                 # Go 单元测试（12 包 ~140+ 测试）
go test ./... -race -count=1           # 带竞态检测
go test -cover -p 1 ./internal/...     # 覆盖率报告
pnpm test                              # 前端测试
```

覆盖率：总体 ~58%。config/validate 100%，logger 93%，settings 71%，
caldav 70%，calendar/event/auth ~65%，middleware 63%，ics 52%，
sync 42%，backup 6%。
主 bundle ~228KB（无 FullCalendar）。

## 代码质量

```bash
go fmt ./...                           # 格式化
go vet ./...                           # 静态检查
pnpm lint                              # 前端 typecheck
pnpm biome format --write web/         # 前端格式化
```

## 部署

### Docker

```bash
docker compose up --build -d
```

### 手动构建

```bash
pnpm install && pnpm --filter @calendar/web build
cp -r web/dist cmd/server/dist
go build -ldflags="-s -w" -o server ./cmd/server/
./server
```

### 反向代理（Nginx）

```nginx
server {
    listen 443 ssl;
    server_name calendar.example.com;
    ssl_certificate     /etc/ssl/calendar.pem;
    ssl_certificate_key /etc/ssl/calendar.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

HTTPS 环境下设置 `SECURE_COOKIES=true`。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务端口 |
| `DATABASE_URL` | `./data/calendar.db` | SQLite 文件路径 |
| `SECURE_COOKIES` | `false` | HTTPS 时设为 `true` |

## 添加迁移

在 `cmd/server/migrations/` 中创建 SQL 文件（如 `00002_auto_backup.sql`）：

```sql
-- 00002_add_index.sql
CREATE INDEX IF NOT EXISTS idx_events_title ON events(title);
```

启动时自动按文件名顺序执行未应用过的迁移，已执行的记录在 `schema_versions` 表中。
所有语句使用 `IF NOT EXISTS` / `IF EXISTS` 保证幂等。
通过 `//go:embed migrations/*.sql` 嵌入，启动时执行。
所有语句使用 `IF NOT EXISTS` / `IF EXISTS`。

## 添加新端点

1. 在 `internal/<domain>/handler.go` 中创建 handler
2. 在 `RegisterRoutes` 中注册路由
3. 在 `cmd/server/main.go` 中 import 并调用 `RegisterRoutes`

Handler 模式：

```go
func handleSomething(w http.ResponseWriter, r *http.Request) {
    // 1. 解析请求
    var req someRequest
    json.NewDecoder(r.Body).Decode(&req)
    // 2. 校验
    // 3. 数据库查询
    // 4. 响应
    middleware.JSONResponse(w, 200, result)
}
```

成功：`middleware.JSONResponse(w, status, data)`，
错误：`middleware.WriteAppError(w, err)`。

## 日志

使用 `internal/logger` 包的统一日志接口：

```go
import "calendar/internal/logger"

logger.Debug("[module] entry user=%s", userID)     // 调试入口
logger.Info("[module] action id=%s success", id)   // 操作成功
logger.Error("[module] action error: %v", err)      // 操作失败
logger.Fatal("fatal reason: %v", err)               // 致命错误（退出进程）
```

日志通过 `slog.TextHandler` 同时输出到 stderr 和 2000 行环形缓冲区。
前端设置页面可查看/过滤/导出日志（仅限管理员），生产环境通过 `GET /api/logs` 查询。
详细清单见 `docs/log.md`。

测试文件（`*_test.go`）放入对应包目录。测试模式：

```go
func TestCaldavPutNewEvent(t *testing.T) {
    // 1. 初始化 :memory: SQLite + chi router
    // 2. 创建测试用户 + 日历
    // 3. 构造 httptest.NewRequest + 发请求
    // 4. 断言 status + DB 状态
}
```

## 时间处理

### 存储原则

**UTC 存储，边界转换。** 所有事件时间以 `"2026-06-25T08:00:00Z"` 格式存于 SQLite。
只在两个边界做转换：用户输入/显示（前端 `new Date()`），ICS 导入/导出（`normalizeICSDate`）。

### 完整数据流

| 操作 | 转换 | 关键文件 |
|---|---|---|
| 前端创建/编辑 | `new Date(local)` → `toISOString()` → UTC Z | `EventEditor.tsx:122` |
| 前端编辑回显 | `new Date(utcZ)` → `toLocalInput()` → 本地 | `EventEditor.tsx:62` |
| 前端网格/搜索 | `new Date(utcZ)` 自动本地化 | `MonthGrid.tsx:69`, `SearchDropdown.tsx:101` |
| ICS 导出 | `SetDateProp` → `DTSTART:YYYYMMDDTHHMMSSZ` | `caldav.go:99`, `convert.go:SetDateProp` |
| ICS/CalDAV 导入（有 Z） | `normalizeICSDate` → UTC Z | `date.go`, `put.go:64`, `import.go:142` |
| ICS/CalDAV 导入（有 TZID） | `NormalizeICSDateWithTZID` → UTC 偏移 → UTC Z | `put.go:59-64`, `import.go:137-141` |

### 边界情况防护

| 情况 | 防护 |
|---|---|
### 边界情况数据库审计

| # | 边界情况 | DB 数量 | 状态 |
|---|---|---|---|
| 1 | 零时长 `startAt == endAt` | 3 → 0（已修） | ✅ `+1h` 三处防护 + migration |
| 2 | `.000Z` 毫秒后缀 | 1 → 0 | ✅ `toLocalInput` strip |
| 3 | 无 Z 后缀 timed 事件 | 0 | ✅ |
| 4 | `startAt > endAt` | 0 | ✅ |
| 5 | 全天/非全天格式混合 | 0 | ✅ |

### 测试验证清单

| # | 测试项 | 预期结果 |
|---|---|---|
| 1 | 前端创建事件 6月25日 16:00 | DB `start_at` = `"2026-06-25T08:00:00Z"` |
| 2 | 前端编辑该事件 | 输入框显示 6月25日 16:00（不偏移） |
| 3 | 不改时间直接保存 | DB 不变 |
| 4 | CalDAV PROPFIND | `DTSTART:20260625T080000Z` |
| 5 | Android 同步后编辑回写 | DB 不变 |
| 6 | Android 本地新建同步 | DB 正确 UTC |
| 7 | 手动导入 `TZID=Asia/Shanghai` | DB UTC 正确 |
| 8 | 服务器导出 ICS | `DTSTART:...Z` |
| 9 | 非全天不设结束时间 | `+1h` |
| 10 | 编辑 `.000Z` 事件 | 时间正常显示 |
