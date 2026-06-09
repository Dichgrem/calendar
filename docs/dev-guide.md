# 开发指南

## 环境要求

- Go 1.25+
- Node.js 22+
- pnpm 9
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
go test ./... -count=1                 # Go 单元测试（9 包 52 测试）
go test ./... -race -count=1           # 带竞态检测
go test ./... -coverprofile=cover.out  # 覆盖率报告
pnpm test                              # 前端测试
```

覆盖范围：auth (63%), calendar (67%), event (67%), caldav (72%), ics (55%),
logger (93%), settings (71%), sync (38%), backup (4%)。

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
| `USER_DEFAULT_LANGUAGE` | `zh-CN` | 默认语言 |
| `USER_DEFAULT_FIRST_DAY_OF_WEEK` | `1` | 0=周日 |
| `USER_DEFAULT_DATE_FORMAT` | `zh` | 日期格式 |
| `USER_DEFAULT_SHOW_EVENT_TIME` | `false` | 显示事件时间 |
| `USER_DEFAULT_SHOW_LUNAR_CALENDAR` | `true` | 启用农历 |

## 添加迁移

在 `cmd/server/migrations/` 中创建 SQL 文件：

```sql
-- 00002_add_index.sql
CREATE INDEX IF NOT EXISTS idx_events_title ON events(title);
```

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
前端设置页面可查看/过滤/导出日志，生产环境通过 `GET /api/logs` 查询。
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
