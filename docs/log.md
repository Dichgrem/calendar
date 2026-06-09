# 服务端日志目录

> 所有日志通过 `log/slog` 统一输出，同时写入：
> - **stderr**（终端查看）
> - **内存环形缓冲区**（2000 行，通过 `GET /api/logs` 或设置页面查看）
>
> 级别：`DEBUG`（入口/细节）`INFO`（成功/摘要）`ERROR`（失败/异常）`FATAL`（致命退出）

---

## 1. 启动与生命周期 [server]

| 操作 | 级别 | 消息 | 说明 |
|------|------|------|------|
| 数据库迁移 | INFO | `Migrations complete` | 迁移脚本执行完毕 |
| 清理测试数据 | INFO | `Cleanup events: %v` | 启动时删除空日期事件 |
| 服务器启动 | INFO | `Server starting on http://localhost:3000` | HTTP 监听开始 |
| 服务器停止 | INFO | `Server stopped` | 正常退出 |
| 接收信号 | INFO | `Received signal %v, shutting down gracefully...` | SIGTERM/SIGINT |
| 关闭错误 | INFO | `Shutdown error: %v` | graceful shutdown 超时 |
| 数据库打开失败 | FATAL | `Database open failed: %v` | 进程退出 |
| 迁移失败 | FATAL | `Migration failed: %v` | 进程退出 |
| 静态文件缺失 | FATAL | `Static files not embedded: %v` | 未 `pnpm build` |
| 监听失败 | FATAL | `Server error: %v` | 端口被占等，进程退出 |

---

## 2. 认证 [auth]

| API | 级别 | 消息 |
|-----|------|------|
| `POST /api/auth/register` | DEBUG | `[auth] POST /api/auth/register` |
| 注册失败 | ERROR | `[auth] register user=%q error: %v` |
| 注册成功 | INFO | `[auth] register user=%q success` |
| `POST /api/auth/login` | DEBUG | `[auth] POST /api/auth/login` |
| 登录密码错误 | INFO | `[auth] login user=%q invalid credentials` |
| 登录成功 | INFO | `[auth] login user=%q success` |
| `POST /api/auth/logout` | DEBUG | `[auth] POST /api/auth/logout` |
| `POST /api/auth/change-password` | DEBUG | `[auth] POST /api/auth/change-password user=%s` |
| 旧密码不匹配 | INFO | `[auth] change-password user=%s old-password mismatch` |
| 密码修改 DB 错误 | ERROR | `[auth] change-password user=%s db error: %v` |
| 密码修改成功 | INFO | `[auth] change-password user=%s success` |
| `POST /api/auth/change-username` | DEBUG | `[auth] POST /api/auth/change-username user=%s` |
| 用户名修改错误 | ERROR | `[auth] change-username user=%s to=%q error: %v` |
| 用户名修改成功 | INFO | `[auth] change-username user=%s to=%q success` |

---

## 3. 日历管理 [calendar]

| API | 级别 | 消息 |
|-----|------|------|
| `POST /api/calendars` | DEBUG | `[calendar] POST user=%s` |
| 创建失败 | ERROR | `[calendar] create name=%q error: %v` |
| `PATCH /api/calendars/{id}` | DEBUG | `[calendar] PATCH id=%s user=%s` |
| 编辑提交失败 | ERROR | `[calendar] update id=%s commit error: %v` |
| 编辑成功 | INFO | `[calendar] update id=%s success` |
| `DELETE /api/calendars/{id}` | DEBUG | `[calendar] DELETE id=%s user=%s` |
| 删除 DB 错误 | ERROR | `[calendar] delete id=%s error: %v` |
| 删除 ID 不存在 | INFO | `[calendar] delete id=%s not found` |
| 删除成功 | INFO | `[calendar] delete id=%s success` |

---

## 4. 事件管理 [event]

| API | 级别 | 消息 |
|-----|------|------|
| `POST /api/calendars/{id}/events` | DEBUG | `[event] POST cal=%s user=%s` |
| 创建失败 | ERROR | `[event] create title=%q error: %v` |
| 创建成功 | INFO | `[event] create id=%s title=%q start=%s` |
| `PATCH /api/events/{id}` | DEBUG | `[event] PATCH id=%s user=%s` |
| 编辑提交失败 | ERROR | `[event] update id=%s commit error: %v` |
| 编辑成功 | INFO | `[event] update id=%s success` |
| `DELETE /api/events/{id}` | DEBUG | `[event] DELETE id=%s user=%s` |
| 删除 DB 错误 | ERROR | `[event] delete id=%s error: %v` |
| 删除成功 | INFO | `[event] delete id=%s success` |

---

## 5. 用户设置 [settings]

| API | 级别 | 消息 |
|-----|------|------|
| `PATCH /api/settings` | DEBUG | `[settings] PATCH /api/settings user=%s` |
| 写入失败 | ERROR | `[settings] update user=%s error: %v` |
| 读取失败 | ERROR | `[settings] get after update user=%s error: %v` |
| 保存成功 | INFO | `[settings] update user=%s success` |

---

## 6. ICS 导入/导出 [ics]

| API | 级别 | 消息 |
|-----|------|------|
| `POST /api/ics/import` | DEBUG | `[ics] POST import user=%s` |
| 事务提交失败 | ERROR | `[ics] import commit error: %v` |
| 导入成功 | INFO | `[ics] import cal=%s events=%d` |
| `GET /api/calendars/{id}/ics/export` | DEBUG | `[ics] GET export cal=%s user=%s` |

---

## 7. 备份/恢复 [backup]

| API | 级别 | 消息 |
|-----|------|------|
| `POST /api/backup` | DEBUG | `[backup] POST create` |
| WAL checkpoint 警告 | ERROR | `backup checkpoint warning: %v` |
| 源文件打开失败 | ERROR | `backup open source: %v` |
| 目标文件创建失败 | ERROR | `backup create dest: %v` |
| 拷贝失败 | ERROR | `backup copy: %v` |
| 备份成功 | INFO | `[backup] created %s` |
| `POST /api/backup/restore` | DEBUG | `[backup] POST restore` |
| 备份文件打开失败 | ERROR | `restore open backup: %v` |
| 数据库文件创建失败 | ERROR | `restore create db: %v` |
| 恢复拷贝失败 | ERROR | `restore copy: %v` |
| 恢复成功 | INFO | `[backup] restore from %s success` |

---

## 8. CalDAV [caldav]

| 操作 | 级别 | 消息 |
|------|------|------|
| 首次注册 MKCALENDAR | INFO | `[caldav] MKCALENDAR user=%s` |
| 日历创建 | INFO | `[caldav] MKCALENDAR created id=%s name=%q` |
| 列出日历 | INFO | `[caldav] PROPFIND calendars user=%s` |
| 列出事件 | INFO | `[caldav] PROPFIND events cal=%s count=%d` |
| REPORT 查询 | INFO | `[caldav] REPORT cal=%s` |
| GET 事件 | INFO | `[caldav] GET event=%s user=%s` |
| PUT 入口 | INFO | `[caldav] PUT %s user=%s` |
| PUT 日历不存在 | ERROR | `[caldav] PUT %s: calendar not found` |
| PUT ICS 无效 | INFO | `[caldav] PUT %s: invalid ICS body` |
| PUT 无 VEVENT | INFO | `[caldav] PUT %s: no VEVENT found` |
| PUT 更新 DB 错误 | ERROR | `[caldav] PUT %s UPDATE error: %v` |
| PUT 更新成功 | INFO | `[caldav] PUT %s UPDATED uid=%s title=%q start=%s` |
| PUT 插入 DB 错误 | ERROR | `[caldav] PUT %s INSERT error: %v` |
| PUT 创建成功 | INFO | `[caldav] PUT %s CREATED uid=%s title=%q start=%s` |
| DELETE 入口 | INFO | `[caldav] DELETE %s cal=%s uid=%s` |
| DELETE 不存在 | INFO | `[caldav] DELETE %s: not found` |

---

## 9. 同步 [sync]

| API | 级别 | 消息 |
|-----|------|------|
| `GET /api/sync/pull` | DEBUG | `[sync] GET pull` |
| `POST /api/sync/push` | DEBUG | `[sync] POST push` |

---

## 10. 中间件 [middleware]

| 场景 | 级别 | 消息 |
|------|------|------|
| panic 恢复 | INFO | `PANIC: %v` |
| 角色加载失败 | INFO | `Failed to load roles: %v`（两处） |

---

## 11. 日志查询 [api]

| API | 级别 | 消息 |
|-----|------|------|
| `GET /api/logs` | DEBUG | `[api] GET /api/logs level=%s n=%d` |

---

## 日志 API

```
GET /api/logs?n=500&level=error
```
需要登录。返回 JSON：
```json
{
  "ok": true,
  "data": {
    "lines": ["time=... level=INFO msg=..."],
    "total": 2000
  }
}
```
- `n`：返回行数（默认 500，上限 2000）
- `level`：过滤级别（`debug`/`info`/`error`），留空返回全部
- 设置页面内建日志查看器，支持过滤、自动刷新、导出 `.log` 文件
