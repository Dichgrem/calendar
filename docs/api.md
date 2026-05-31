# API Reference

## Authentication

All endpoints except `/api/auth/status` and `/api/auth/register` require a valid session cookie.

### Check Status

```
GET /api/auth/status

Response: { "ok": true, "data": { "registered": boolean } }
```

### Register

```
POST /api/auth/register
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

Response: 201 { "ok": true, "data": { "userId": number } }
```

### Login

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}

Response: 200 { "ok": true, "data": { "userId": number } }
```

### Current User

```
GET /api/auth/me

Response: 200 { "ok": true, "data": { "userId": number } }
```

### Change Password

```
POST /api/auth/change-password
Content-Type: application/json

{
  "oldPassword": "string",
  "newPassword": "string"
}

Response: 200 { "ok": true, "data": null }
```

### Logout

```
POST /api/auth/logout
```

## Calendars

### List

```
GET /api/calendars
```

### Detail

```
GET /api/calendars/:id
```

### Create

```
POST /api/calendars
Content-Type: application/json

{
  "name": "string",
  "color": "#hex"
}
```

### Update

```
PATCH /api/calendars/:id
Content-Type: application/json

{
  "name": "string",
  "color": "#hex"
}
```

### Delete

```
DELETE /api/calendars/:id
```

## Events

### List

```
GET /api/calendars/:calendarId/events?start=ISO&end=ISO
```

### Detail

```
GET /api/events/:id
```

### Create

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

### Update

```
PATCH /api/events/:id
```

### Delete (soft)

```
DELETE /api/events/:id
```

### Create Override

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

### Preview

```
POST /api/ics/preview
Content-Type: application/json

{
  "content": "ICS file content"
}
```

### Fetch URL

```
POST /api/ics/fetch-url
Content-Type: application/json

{
  "url": "https://example.com/calendar.ics"
}
```

### Import

```
POST /api/ics/import
Content-Type: application/json

{
  "content": "ICS content",
  "calendarName": "Calendar Name",
  "color": "#hex",
  "selectedUids": ["uid1", "uid2"],
  "overwrite": false
}
```

### Export

```
GET /api/calendars/:calendarId/ics/export
```

## Settings

### Get

```
GET /api/settings
```

### Update

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

## Backup

### Create

```
POST /api/backup
```

### List

```
GET /api/backups
```

### Download

```
GET /api/backup/download/:filename
```

### Restore

```
POST /api/backup/restore
Content-Type: application/json

{
  "filename": "string"
}
```

## Sync

### Pull

```
GET /api/sync/pull?last_pulled_seq=N
```

### Push

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
