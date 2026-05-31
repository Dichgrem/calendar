# API 参考

## 认证

除 `/api/auth/status` 和 `/api/auth/register` 外，所有接口需要有效 session cookie。

### 检查状态

```
GET /api/auth/status

响应: { "ok": true, "data": { "registered": boolean } }
```

### 注册

```
POST /api/auth/register
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

响应: 201 { "ok": true, "data": { "userId": number } }
```

### 登录

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

响应: 200 { "ok": true, "data": { "userId": number } }
```

### 当前用户

```
GET /api/auth/me

响应: 200 { "ok": true, "data": { "userId": number } }
```

### 修改密码

```
POST /api/auth/change-password
Content-Type: application/json

{
  "oldPassword": "string",
  "newPassword": "string"
}

响应: 200 { "ok": true, "data": null }
```

### 登出

```
POST /api/auth/logout
```

## 日历

### 列表

```
GET /api/calendars
```

### 详情

```
GET /api/calendars/:id
```

### 创建

```
POST /api/calendars
Content-Type: application/json

{
  "name": "string",
  "color": "#hex"
}
```

### 更新

```
PATCH /api/calendars/:id
Content-Type: application/json

{
  "name": "string",
  "color": "#hex"
}
```

### 删除

```
DELETE /api/calendars/:id
```

## 事件

### 列表

```
GET /api/calendars/:calendarId/events?start=ISO&end=ISO
```

### 详情

```
GET /api/events/:id
```

### 创建

```
POST /api/calendars/:calendarId/events
Content-Type: application/json

{
  "title": "string",
  "startAt": "ISO",
  "endAt": "ISO",
  "allDay": false,
  "description": "string?",
  "location": "string?",
  "rrule": "string?"
}
```

### 更新

```
PATCH /api/events/:id
```

### 删除（软删除）

```
DELETE /api/events/:id
```

### 创建覆盖

```
POST /api/events/:id/override
Content-Type: application/json

{
  "originalDate": "ISO",
  "startAt": "ISO",
  "endAt": "ISO"
}
```

## ICS

### 预览

```
POST /api/ics/preview
Content-Type: application/json

{
  "content": "ICS文件内容"
}
```

### 远程获取

```
POST /api/ics/fetch-url
Content-Type: application/json

{
  "url": "https://example.com/calendar.ics"
}
```

### 导入

```
POST /api/ics/import
Content-Type: application/json

{
  "content": "ICS内容",
  "calendarName": "日历名",
  "color": "#hex",
  "selectedUids": ["uid1", "uid2"],
  "overwrite": false
}
```

### 导出

```
GET /api/calendars/:calendarId/ics/export
```

## 设置

### 获取

```
GET /api/settings
```

### 更新

```
PATCH /api/settings
Content-Type: application/json

{
  "language": "zh-CN",
  "firstDayOfWeek": 0,
  "showEventTime": true,
  "dateFormat": "zh",
  "showLunarCalendar": false
}
```

## 备份

### 创建

```
POST /api/backup
```

### 列表

```
GET /api/backups
```

### 下载

```
GET /api/backup/download/:filename
```

### 恢复

```
POST /api/backup/restore
Content-Type: application/json

{
  "filename": "string"
}
```

## 同步

### 拉取

```
GET /api/sync/pull?last_pulled_seq=N
```

### 推送

```
POST /api/sync/push
Content-Type: application/json

{
  "changes": {
    "calendars": { "created": [...], "updated": [...], "deleted": [...] },
    "events": { "created": [...], "updated": [...], "deleted": [...] }
  },
  "last_pulled_seq": 0
}
```
