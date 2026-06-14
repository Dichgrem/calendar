# API 参考

Base URL: `/api`

所有接口使用 `Content-Type: application/json`。需认证的端点通过
`session_token` cookie 或 `Authorization: Bearer <token>` 头传递会话。

响应格式：

```json
// 成功
{ "ok": true, "data": ... }

// 错误
{ "ok": false, "error": { "code": "STRING", "message": "..." } }
```

错误码：`BAD_REQUEST`（400）、`UNAUTHORIZED`（401）、`FORBIDDEN`（403）、
`NOT_FOUND`（404）、`CONFLICT`（409）、`RATE_LIMITED`（429）、`INTERNAL`（500）。

认证端点受 IP 限流：登录 5 次/分钟，注册 3 次/小时。
超限返回 429。

---

## 认证

### 检查注册状态

```
GET /api/auth/status

→ 200 { "registered": true }
```

### 注册

单用户系统，仅在用户表为空时可注册。

```
POST /api/auth/register
{ "username": "string", "password": "string" }

→ 201 { "userId": "<uuid>" }
   自动设置 session_token cookie，创建"默认日历"和 user_settings。

用户名：1-100 字符。密码：4-200 字符。
注册限流：3 次/小时/IP。
```

### 登录

```
POST /api/auth/login
{ "username": "string", "password": "string" }

→ 200 { "userId": "<uuid>", "sessionId": "<hex>" }
   设置 session_token cookie。
   限流：5 次/分钟/IP。超限返回 429。
```

### 当前用户

```
GET /api/auth/me

→ 200 { "userId": "<uuid>", "username": "string" }
```

### 获取 Token

返回原始 session token，供移动端 Bearer 认证使用。

```
GET /api/auth/token

→ 200 { "token": "<64 hex chars>" }
```

### 修改密码

```
POST /api/auth/change-password
{ "oldPassword": "string", "newPassword": "string" }

→ 200 null
```

### 修改用户名

```
POST /api/auth/change-username
{ "username": "string" }

→ 200 null

用户名：1-50 字符，必须唯一。
```

### 登出

```
POST /api/auth/logout
从 Bearer header 或 cookie 读取 token，删除会话并清除 cookie。

→ 200 null
```

---

## 日历

### 列表

```
GET /api/calendars

→ 200 [ Calendar, ... ]
```

Calendar 结构：

```json
{
  "id": "<uuid>",
  "name": "string",
  "color": "#hex",
  "sourceUrl": "string|null",
  "sourceType": "manual|ics_import|ics_subscription",
  "ownerId": "<uuid>",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "lastModified": 1234567890123
}
```

### 详情

```
GET /api/calendars/:id

→ 200 Calendar
  404
```

### 创建

```
POST /api/calendars
{ "name": "string", "color": "#hex?", "sourceUrl": "string?" }

若有 sourceUrl，sourceType 自动设为 ics_subscription。
自动创建 calendar_members 行（admin 角色）。

→ 201 Calendar
```

### 更新

```
PATCH /api/calendars/:id
{ "name"?: "string", "color"?: "#hex", "sourceUrl"?: "string" }

需要 editor 或更高角色。

→ 200 Calendar
```

### 删除

```
DELETE /api/calendars/:id

需要 admin 角色。硬删除，级联删除事件。

→ 200 null
```

### 排序

```
PATCH /api/calendars/reorder
{ "orderedIds": ["<uuid>", "<uuid>", ...] }

更新 calendar_members 中当前用户的 sort_order。

→ 200 null
```

---

## 事件

### 列表

```
GET /api/calendars/:calendarId/events?start=ISO&end=ISO

返回与 [start, end] 重叠的事件，含所有 rrule 事件。
重叠判定：start_at <= end AND end_at >= start。

→ 200 [ Event, ... ]
```

Event 结构：

```json
{
  "id": "<uuid>",
  "calendarId": "<uuid>",
  "title": "string",
  "description": "string|null",
  "startAt": "ISO8601",
  "endAt": "ISO8601",
  "allDay": false,
  "rrule": "string|null",
  "color": "string|null",
  "location": "string|null",
  "parentId": "string|null",
  "originalDate": "string|null",
  "deleted": false,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "lastModified": 1234567890123
}
```

### 详情

```
GET /api/events/:id

→ 200 Event
  404
```

### 创建

```
POST /api/calendars/:calendarId/events
{
  "title": "string",
  "startAt": "ISO8601",
  "endAt": "ISO8601",
  "allDay"?: false,
  "description"?: "string",
  "location"?: "string",
  "rrule"?: "string",
  "color"?: "#hex"
}

标题：1-500 字符。

→ 201 Event
```

### 更新

```
PATCH /api/events/:id
{ "title"?, "description"?, "startAt"?, "endAt"?, "allDay"?,
  "rrule"?, "color"?, "location"?, "deleted"? }

→ 200 Event
```

### 删除（软删除）

```
DELETE /api/events/:id

设置 deleted=1。事件仍可通过 ID 访问，但不列入列表查询。

→ 200 null
```

### 重复事件例外

```
POST /api/events/:id/override
{
  "originalDate": "YYYY-MM-DD",
  "overrideStart"?: "ISO8601",
  "overrideEnd"?: "ISO8601",
  "overrideTitle"?: "string",
  "deleted"?: false
}

upsert 写入 event_overrides（parent_id + original_date 唯一）。

→ 201 null
```

---

## ICS 导入导出

### 预览

```
POST /api/ics/preview
{ "content": "ICS 文件内容" }

→ 200 {
  "name": "string",
  "eventCount": 2,
  "timeSpan": { "from": "ISO", "to": "ISO" },
  "items": [
    { "type": "event", "uid": "string", "title": "string",
      "startAt": "ISO", "endAt": "ISO", "rrule": "string",
      "selected": true }
  ]
}
```

### 抓取 URL

```
POST /api/ics/fetch-url
{ "url": "https://..." }

从远程抓取 ICS，含 SSRF 防护（阻止私有 IP）。
最大响应 10 MiB，超时 15 秒。

→ 200 { "preview": PreviewResponse, "content": "原始 ICS" }
```

### 导入

```
POST /api/ics/import
{
  "content": "ICS 内容",
  "calendarId"?: "<uuid>",       // 导入到已有日历，或
  "calendarName"?: "string",      // 新建日历
  "color"?: "#hex",
  "sourceUrl"?: "string",
  "selectedUids": ["uid1", "uid2"],
  "overwrite"?: false
}

calendarId 为空则创建新日历。仅导入 selectedUids 中的事件。

→ 201 { "calendarId": "<uuid>" }
```

### 导出

```
GET /api/calendars/:calendarId/ics/export

→ 200 text/calendar（ICS 文件下载）
```

---

## 设置

### 获取

```
GET /api/settings

→ 200 {
  "userId": "<uuid>",
  "language": "zh-CN|en",
  "firstDayOfWeek": 0-6,
  "dateFormat": "zh",
  "showLunarCalendar": true
}
```

### 更新

```
PATCH /api/settings
{
  "language"?: "zh-CN|en",
  "firstDayOfWeek"?: 0-6,
  "dateFormat"?: "string",
  "showLunarCalendar"?: true
}

→ 200 UserSettings
```

### 配置（公开）

```
GET /api/settings/config

→ 200 { "userDefaults": UserSettings }
```

---

## 备份

### 创建

```
POST /api/backup

执行 WAL checkpoint 后复制 db 文件到 backups/ 目录。

→ 201 { "filename": "calendar-2026-01-01T000000Z.db" }
```

### 列表

```
GET /api/backups

→ 200 [ { "filename": "...", "size": 135168, "created": "ISO8601" } ]
```

### 下载

```
GET /api/backup/download/:filename

→ 200 application/octet-stream
```

### 恢复

```
POST /api/backup/restore
{ "filename": "calendar-2026-01-01T000000Z.db" }

覆盖当前数据库。重启后生效。

→ 200 { "message": "Restored. ..." }
```

---

## 同步

### 拉取

```
GET /api/sync/pull?last_pulled_seq=N

返回 sync_sequence 中自 last_pulled_seq 以来的变更 +
deleted_log 中所有已删除记录。

→ 200 {
  "changes": {
    "calendars": {
      "created": [ Calendar ],
      "updated": [ Calendar ],
      "deleted": [ "<id>" ]
    },
    "events": {
      "created": [ Event ],
      "updated": [ Event ],
      "deleted": [ "<id>" ]
    }
  },
  "seq": 0
}
```

### 推送

```
POST /api/sync/push
{ "changes": { ... }, "last_pulled_seq": 0 }

→ 200 { "seq": 0 }
```

---

## 系统

### 健康检查

```
GET /api/health

→ 200 { "status": "ok" }
```

### 服务器日志

```
GET /api/logs?n=500&level=error

需要登录。返回环形缓冲区中的最近日志行。

参数：
- n：返回行数（默认 500，上限 2000）
- level：过滤级别（debug/info/error），留空返回全部

→ 200 { "ok": true, "data": { "lines": ["time=... level=INFO msg=..."], "total": 2000 } }
```
