package caldav_test

import (
	"encoding/base64"
	"encoding/xml"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"calendar/internal/auth"
	"calendar/internal/caldav"
	"calendar/internal/db"
	"calendar/internal/middleware"
)

func setupCalDAV(t *testing.T) chi.Router {
	t.Helper()
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS calendars (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6',
			source_url TEXT, source_type TEXT NOT NULL DEFAULT 'manual',
			owner_id TEXT NOT NULL, created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL, last_modified INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS calendar_members (
			calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			role TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS events (
			id TEXT PRIMARY KEY, calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
			title TEXT NOT NULL, description TEXT, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
			all_day INTEGER NOT NULL DEFAULT 0, rrule TEXT, color TEXT, location TEXT,
			parent_id TEXT, original_date TEXT, deleted INTEGER NOT NULL DEFAULT 0,
			raw_ics TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_modified INTEGER NOT NULL)`,
	} {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("create table: %v", err)
		}
	}

	// Create a test user with known password
	passwordHash, err := auth.MakePasswordHash("testpass")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	db.DB.Exec(`INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
		VALUES ('user-1', 'testuser', ?, '2026-01-01T00:00:00Z')`, passwordHash)

	// Create a calendar for the user
	db.DB.Exec(`INSERT OR IGNORE INTO calendars (id, name, color, source_type, owner_id, created_at, updated_at, last_modified)
		VALUES ('cal-1', 'Test Calendar', '#3b82f6', 'manual', 'user-1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)`)
	db.DB.Exec(`INSERT OR IGNORE INTO calendar_members (calendar_id, user_id, role) VALUES ('cal-1', 'user-1', 'admin')`)

	r := chi.NewRouter()
	// Register CalDAV HTTP methods
	chi.RegisterMethod("PROPFIND")
	chi.RegisterMethod("REPORT")
	chi.RegisterMethod("MKCALENDAR")
	r.Use(middleware.CaldavAuth)
	caldav.RegisterRoutes(r)
	return r
}

func basicAuth(user, pass string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(user+":"+pass))
}

func TestCaldavOptions(t *testing.T) {
	r := setupCalDAV(t)
	req := httptest.NewRequest("OPTIONS", "/dav/", nil)
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("expected 200 got %d", w.Code)
	}
	if !strings.Contains(w.Header().Get("DAV"), "calendar-access") {
		t.Errorf("missing calendar-access in DAV header: %s", w.Header().Get("DAV"))
	}
}

func TestCaldavOptionsUnauthorized(t *testing.T) {
	r := setupCalDAV(t)
	req := httptest.NewRequest("OPTIONS", "/dav/", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 401 {
		t.Errorf("expected 401 got %d", w.Code)
	}
	if w.Header().Get("WWW-Authenticate") == "" {
		t.Error("missing WWW-Authenticate header on 401")
	}
}

func TestCaldavPropfindRoot(t *testing.T) {
	r := setupCalDAV(t)
	req := httptest.NewRequest("PROPFIND", "/dav/", nil)
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 207 {
		t.Errorf("expected 207 got %d: %s", w.Code, w.Body.String())
	}
}

func TestCaldavPropfindCalendars(t *testing.T) {
	r := setupCalDAV(t)
	req := httptest.NewRequest("PROPFIND", "/dav/calendars/", strings.NewReader(
		`<propfind xmlns="DAV:"><prop><displayname/><resourcetype/></prop></propfind>`))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 207 {
		t.Errorf("expected 207 got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "Test Calendar") {
		t.Errorf("response missing calendar name: %s", body)
	}
	if !strings.Contains(body, "displayname") {
		t.Errorf("response missing displayname prop: %s", body)
	}
}

func TestCaldavPropfindEvents(t *testing.T) {
	r := setupCalDAV(t)
	// Insert an event
	db.DB.Exec(`INSERT INTO events (id, calendar_id, title, start_at, end_at, created_at, updated_at, last_modified)
		VALUES ('evt-1', 'cal-1', 'Test Event', '2026-06-09T10:00:00Z', '2026-06-09T11:00:00Z',
		'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)`)

	req := httptest.NewRequest("PROPFIND", "/dav/calendars/cal-1/", strings.NewReader(
		`<propfind xmlns="DAV:"><prop><getetag/><calendar-data xmlns="urn:ietf:params:xml:ns:caldav"/></prop></propfind>`))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 207 {
		t.Errorf("expected 207 got %d: %s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, "Test Event") {
		t.Errorf("response missing event: %s", body)
	}
}

func TestCaldavPutNewEvent(t *testing.T) {
	r := setupCalDAV(t)
	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-uid-001
DTSTART:20260620T100000Z
DTEND:20260620T110000Z
SUMMARY:New Event
END:VEVENT
END:VCALENDAR`
	req := httptest.NewRequest("PUT", "/dav/calendars/cal-1/test-uid-001.ics", strings.NewReader(ics))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	req.Header.Set("Content-Type", "text/calendar")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 204 {
		t.Errorf("expected 204 got %d: %s", w.Code, w.Body.String())
	}

	// Verify event exists in DB (event is stored with a generated UUID, not the ICS UID)
	var count int
	db.DB.QueryRow("SELECT COUNT(*) FROM events WHERE calendar_id=?", "cal-1").Scan(&count)
	if count == 0 {
		t.Fatal("event not in DB")
	}
	var title string
	db.DB.QueryRow("SELECT title FROM events WHERE calendar_id=?", "cal-1").Scan(&title)
	if title != "New Event" {
		t.Errorf("title=%q want 'New Event'", title)
	}
}

func TestCaldavPutUpdateEvent(t *testing.T) {
	r := setupCalDAV(t)
	// Pre-insert event
	db.DB.Exec(`INSERT INTO events (id, calendar_id, title, start_at, end_at, created_at, updated_at, last_modified)
		VALUES ('evt-update', 'cal-1', 'Old Title', '2026-06-09T10:00:00Z', '2026-06-09T11:00:00Z',
		'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)`)

	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-update
DTSTART:20260620T120000Z
DTEND:20260620T130000Z
SUMMARY:Updated Title
END:VEVENT
END:VCALENDAR`
	req := httptest.NewRequest("PUT", "/dav/calendars/cal-1/evt-update.ics", strings.NewReader(ics))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 204 {
		t.Errorf("expected 204 got %d: %s", w.Code, w.Body.String())
	}

	var title string
	db.DB.QueryRow("SELECT title FROM events WHERE id='evt-update'").Scan(&title)
	if title != "Updated Title" {
		t.Errorf("title=%q want 'Updated Title'", title)
	}
}

func TestCaldavPutInvalidICS(t *testing.T) {
	r := setupCalDAV(t)
	req := httptest.NewRequest("PUT", "/dav/calendars/cal-1/bad.ics", strings.NewReader("not ics data"))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Errorf("expected 400 got %d: %s", w.Code, w.Body.String())
	}
}

func TestCaldavPutNoVEvent(t *testing.T) {
	r := setupCalDAV(t)
	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
SUMMARY:Not an event
END:VTODO
END:VCALENDAR`
	req := httptest.NewRequest("PUT", "/dav/calendars/cal-1/todo.ics", strings.NewReader(ics))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Errorf("expected 400 got %d: %s", w.Code, w.Body.String())
	}
}

func TestCaldavPutUnauthorized(t *testing.T) {
	r := setupCalDAV(t)
	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:x
DTSTART:20260620T100000Z
DTEND:20260620T110000Z
SUMMARY:Test
END:VEVENT
END:VCALENDAR`
	req := httptest.NewRequest("PUT", "/dav/calendars/cal-1/evt.ics", strings.NewReader(ics))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 401 {
		t.Errorf("expected 401 got %d", w.Code)
	}
}

func TestCaldavDeleteEvent(t *testing.T) {
	r := setupCalDAV(t)
	db.DB.Exec(`INSERT INTO events (id, calendar_id, title, start_at, end_at, deleted, created_at, updated_at, last_modified)
		VALUES ('evt-del', 'cal-1', 'Delete Me', '2026-06-09T10:00:00Z', '2026-06-09T11:00:00Z', 0,
		'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)`)

	req := httptest.NewRequest("DELETE", "/dav/calendars/cal-1/evt-del.ics", nil)
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 204 {
		t.Errorf("expected 204 got %d: %s", w.Code, w.Body.String())
	}

	var deleted int
	db.DB.QueryRow("SELECT deleted FROM events WHERE id='evt-del'").Scan(&deleted)
	if deleted != 1 {
		t.Errorf("event not soft-deleted, deleted=%d", deleted)
	}
}

func TestCaldavDeleteNotFound(t *testing.T) {
	r := setupCalDAV(t)
	req := httptest.NewRequest("DELETE", "/dav/calendars/cal-1/nonexistent.ics", nil)
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 404 {
		t.Errorf("expected 404 got %d", w.Code)
	}
}

func TestCaldavGetEvent(t *testing.T) {
	r := setupCalDAV(t)
	db.DB.Exec(`INSERT INTO events (id, calendar_id, title, start_at, end_at, created_at, updated_at, last_modified)
		VALUES ('evt-get', 'cal-1', 'GET Event', '2026-06-09T10:00:00Z', '2026-06-09T11:00:00Z',
		'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)`)

	req := httptest.NewRequest("GET", "/dav/calendars/cal-1/evt-get.ics", nil)
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("expected 200 got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "GET Event") {
		t.Errorf("response missing event: %s", body)
	}
	if !strings.Contains(body, "BEGIN:VCALENDAR") {
		t.Errorf("response not ICS: %s", body)
	}
}

func TestCaldavReport(t *testing.T) {
	r := setupCalDAV(t)
	db.DB.Exec(`INSERT INTO events (id, calendar_id, title, start_at, end_at, created_at, updated_at, last_modified)
		VALUES ('evt-rpt', 'cal-1', 'Report Event', '2026-06-09T10:00:00Z', '2026-06-09T11:00:00Z',
		'2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1)`)

	body := `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter>
</C:calendar-query>`
	req := httptest.NewRequest("REPORT", "/dav/calendars/cal-1/", strings.NewReader(body))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 207 {
		t.Errorf("expected 207 got %d: %s", w.Code, w.Body.String())
	}
	bodyStr := w.Body.String()
	if !strings.Contains(bodyStr, "Report Event") {
		t.Errorf("response missing event in REPORT: %s", bodyStr)
	}
}

func TestCaldavMkcalendar(t *testing.T) {
	r := setupCalDAV(t)
	mkcalBody := `<?xml version="1.0" encoding="UTF-8"?>
<C:mkcalendar xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:D="DAV:">
  <D:set>
    <D:prop>
      <D:displayname>New API Calendar</D:displayname>
    </D:prop>
  </D:set>
</C:mkcalendar>`
	req := httptest.NewRequest("MKCALENDAR", "/dav/", strings.NewReader(mkcalBody))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 201 {
		t.Errorf("expected 201 got %d: %s", w.Code, w.Body.String())
	}
	if loc := w.Header().Get("Location"); !strings.Contains(loc, "/dav/calendars/") {
		t.Errorf("missing Location header: %s", loc)
	}
}

// Test that PUT returns 500 on DB error instead of silently returning 204.
// This is a regression test for the bug where db.Exec errors were ignored.
func TestCaldavPutDbErrorReturns500(t *testing.T) {
	r := setupCalDAV(t)

	// Drop events table to force DB error
	db.DB.Exec("DROP TABLE events")

	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-error
DTSTART:20260620T100000Z
DTEND:20260620T110000Z
SUMMARY:Should Fail
END:VEVENT
END:VCALENDAR`
	req := httptest.NewRequest("PUT", "/dav/calendars/cal-1/test-error.ics", strings.NewReader(ics))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 500 {
		t.Errorf("expected 500 on DB error, got %d", w.Code)
	}
}

// XML namespace types needed for PROPFIND response parsing
type msRoot struct {
	XMLName  xml.Name   `xml:"multistatus"`
	Response []msResp   `xml:"response"`
}
type msResp struct {
	Href string `xml:"href"`
	PropStat []msPropStat `xml:"propstat"`
}
type msPropStat struct {
	Status string `xml:"status"`
	Prop   msProp `xml:"prop"`
}
type msProp struct {
	Displayname string `xml:"displayname"`
}

func TestPropfindResponseIsValidXML(t *testing.T) {
	r := setupCalDAV(t)
	req := httptest.NewRequest("PROPFIND", "/dav/calendars/", strings.NewReader(
		`<propfind xmlns="DAV:"><prop><displayname/></prop></propfind>`))
	req.Header.Set("Authorization", basicAuth("testuser", "testpass"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 207 {
		t.Fatalf("expected 207 got %d", w.Code)
	}

	var multi msRoot
	if err := xml.Unmarshal(w.Body.Bytes(), &multi); err != nil {
		t.Fatalf("invalid XML response: %v", err)
	}
	if len(multi.Response) == 0 {
		t.Error("expected at least one response element")
	}
}
