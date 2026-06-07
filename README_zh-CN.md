# Calendar

自托管日历应用，Go 后端 + React 前端，单二进制部署。

## 快速开始

```bash
# 前端构建
pnpm install && pnpm --filter @calendar/web build

# Go 构建 & 启动
go build -o server ./cmd/server/ && ./server
```

浏览器访问 `http://localhost:3000`。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `DATABASE_URL` | `./data/calendar.db` | SQLite 文件路径 |
| `SECURE_COOKIES` | `false` | 生产环境设 `true` |
| `USER_DEFAULT_LANGUAGE` | `zh-CN` | 默认语言 |
| `USER_DEFAULT_FIRST_DAY_OF_WEEK` | `1` | 周起始日 (0=周日) |
| `USER_DEFAULT_DATE_FORMAT` | `zh` | 日期格式 |
| `USER_DEFAULT_SHOW_EVENT_TIME` | `false` | 显示事件时间 |
| `USER_DEFAULT_SHOW_LUNAR_CALENDAR` | `true` | 显示农历 |

## 常用命令

```bash
just dev          # 启动开发服务器
just test         # 运行测试
just build        # 构建前端 + Go 二进制
just docker-build # 构建 Docker 镜像
just docker-up    # Docker Compose 启动
```

## 项目结构

```
calendar/
├── cmd/server/main.go       # 入口
├── internal/
│   ├── auth/                # 认证 + 会话
│   ├── calendar/            # 日历 CRUD
│   ├── event/               # 事件 CRUD + override
│   ├── settings/            # 用户设置
│   ├── middleware/          # 会话/角色/错误处理
│   ├── config/              # 环境变量
│   ├── db/                  # SQLite
│   ├── apperror/            # 错误类型
│   └── validate/            # 验证辅助
├── web/                     # React SPA
├── mobile/                  # Android WebView 壳
├── go.mod
├── Justfile
└── Dockerfile
```

## 技术栈

- **后端**: Go + Chi + modernc.org/sqlite
- **前端**: React 19 + Vite + TanStack Query + Tailwind CSS
- **部署**: 单二进制 (< 15MiB)，go:embed 嵌入前端静态文件
