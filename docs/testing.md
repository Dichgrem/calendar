# Testing

No automated test suite yet. Shell-based API tests and a manual test plan below.

## API Tests (`just test-*` recipes)

Requires a test server running in another terminal:

```bash
# Terminal 1: start test server
just test-run

# Terminal 2: run tests
just test-all        # all tests
just test-full       # full integration test
just test-login      # individual test
```

Tests use `curl` + `jq` with cookie-based auth (credentials: `admin` / `admin123`).

## Test Plan

### Authentication

- [ ] First visit → `auth/status` returns `registered: false`
- [ ] Register → returns 201, sets session cookie
- [ ] Register again (duplicate) → returns 403
- [ ] Login with correct password → returns 200, sets session cookie
- [ ] Login with wrong password → returns 401
- [ ] Access protected endpoint without cookie → returns error

### Session

- [ ] Authenticated cookie → accepted on all protected endpoints
- [ ] No cookie → rejected on protected endpoints
- [ ] Logout → cookie invalidated, subsequent requests rejected
- [ ] Change password → old password verified, new password set

### Calendars

- [ ] `GET /api/calendars` → returns calendar list
- [ ] `POST /api/calendars` → creates calendar with name and color
- [ ] `GET /api/calendars/:id` → returns calendar detail
- [ ] `PATCH /api/calendars/:id` → updates name/color
- [ ] `DELETE /api/calendars/:id` → removes calendar
- [ ] Default calendar auto-created on registration

### Events

- [ ] `POST /api/calendars/:cid/events` → creates event with title, dates, description
- [ ] `GET /api/calendars/:cid/events?start=&end=` → returns events in date range
- [ ] `GET /api/events/:id` → returns event detail
- [ ] `PATCH /api/events/:id` → updates event fields
- [ ] `DELETE /api/events/:id` → soft-deletes event
- [ ] Event with RRULE → recurring events parsed correctly

### ICS

- [ ] `POST /api/ics/preview` → parses ICS and returns event preview
- [ ] `POST /api/ics/fetch-url` → fetches remote ICS URL
- [ ] `POST /api/ics/import` → imports events into calendar
- [ ] `GET /api/calendars/:cid/ics/export` → exports calendar as ICS
- [ ] Export preserves VALARM, CATEGORIES, STATUS via raw_ics
- [ ] Import with `overwrite: true` → clears calendar first

### Settings

- [ ] `GET /api/settings` → returns default settings
- [ ] `PATCH /api/settings` → updates language, firstDayOfWeek, showEventTime, dateFormat, showLunarCalendar
- [ ] Settings persist across sessions

### Sync

- [ ] `GET /api/sync/pull?last_pulled_seq=0` → returns all changes
- [ ] `POST /api/sync/push` → pushes local changes
- [ ] Changes include created/updated/deleted tracking

### Backup

- [ ] `POST /api/backup` → creates backup file
- [ ] `GET /api/backups` → lists available backups
- [ ] `GET /api/backup/download/:filename` → downloads backup
- [ ] `POST /api/backup/restore` → restores from backup

### UI

- [ ] Calendar page loads with month view
- [ ] First visit shows registration page
- [ ] Login → redirects to calendar view
- [ ] Create event via FAB button → appears on calendar
- [ ] Click event → edit modal opens
- [ ] Search events → filtered results, click navigates to date
- [ ] Lunar calendar toggle → shows/hides lunar dates
- [ ] Common calendars import → adds holiday calendars
- [ ] ICS import page → file upload and URL tabs work
- [ ] ICS export dialog → multi-select calendars, download
- [ ] Dark mode toggle works
- [ ] Logout → returns to login page
- [ ] Mobile responsive layout

### Platform Adapters

- [ ] Cloudflare Workers: deploy and verify all endpoints
- [ ] Node.js: `just start` and test all endpoints locally
- [ ] Docker: build and test all endpoints
