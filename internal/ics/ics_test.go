package ics_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"calendar/internal/auth"
	"calendar/internal/db"
	"calendar/internal/ics"
	"calendar/internal/middleware"
)

func setupICS(t *testing.T) chi.Router {
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

	hash, _ := auth.MakePasswordHash("testpass")
	db.DB.Exec(`INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
		VALUES ('u-1', 'testuser', ?, '2026-01-01T00:00:00Z')`, hash)

	r := chi.NewRouter()
	// Public routes (no auth)
	auth.RegisterRoutes(r)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		auth.RegisterProtectedRoutes(r)
		ics.RegisterRoutes(r)
	})
	return r
}

func loginSession(t *testing.T, r chi.Router) string {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(
		`{"username":"testuser","password":"testpass"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	for _, c := range w.Result().Cookies() {
		if c.Name == "session_token" {
			return c.Value
		}
	}
	t.Fatal("login failed")
	return ""
}

func TestNormalizeICSDate(t *testing.T) {
	cases := []struct{ in, want string }{
		{"20240101", "2024-01-01"},
		{"20240101T090000Z", "2024-01-01T09:00:00Z"},
		{"20240101T090000", "2024-01-01T09:00:00Z"},
		{"2024-01-01", "2024-01-01"},
		{"", ""},
		{" 20240101 ", "2024-01-01"},
	}
	for _, c := range cases {
		got := ics.NormalizeICSDate(c.in)
		if got != c.want {
			t.Errorf("NormalizeICSDate(%q)=%q want %q", c.in, got, c.want)
		}
	}
}

func TestICSImportAndExport(t *testing.T) {
	r := setupICS(t)
	sid := loginSession(t, r)

	icsContent := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-uid-1
DTSTART:20260620T100000Z
DTEND:20260620T110000Z
SUMMARY:Integration Event
END:VEVENT
END:VCALENDAR`

	// Import
	body, _ := json.Marshal(map[string]any{
		"content":      icsContent,
		"calendarName": "Test Cal",
		"color":        "#f59e0b",
		"selectedUids": []string{"test-uid-1"},
	})
	req := httptest.NewRequest("POST", "/api/ics/import", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 201 {
		t.Fatalf("import returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data struct{ CalendarID string } `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	calID := resp.Data.CalendarID
	if calID == "" {
		t.Fatal("no calendarId")
	}

	// Verify event
	var count int
	db.DB.QueryRow("SELECT COUNT(*) FROM events WHERE calendar_id=?", calID).Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 event, got %d", count)
	}
	var startAt string
	db.DB.QueryRow("SELECT start_at FROM events WHERE calendar_id=?", calID).Scan(&startAt)
	if startAt != "2026-06-20T10:00:00Z" {
		t.Errorf("start_at=%q want '2026-06-20T10:00:00Z' (raw YYYYMMDDTHHMMSS was not normalized)", startAt)
	}

	// Export
	req2 := httptest.NewRequest("GET", "/api/calendars/"+calID+"/ics/export", nil)
	req2.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != 200 {
		t.Fatalf("export returned %d", w2.Code)
	}
	bodyStr := w2.Body.String()
	if !strings.Contains(bodyStr, "Integration Event") {
		t.Errorf("export missing event")
	}
	// Regression: DAVx5 rejects events with VALUE=TEXT — must NOT appear.
	if strings.Contains(bodyStr, "VALUE=TEXT") {
		t.Errorf("export contains VALUE=TEXT — DAVx5 will reject these events")
	}
	if !strings.Contains(bodyStr, "BEGIN:VCALENDAR") {
		t.Errorf("not valid ICS")
	}
	// Regression: DAVx5 rejects events with VALUE=TEXT
	if strings.Contains(bodyStr, "VALUE=TEXT") {
		t.Errorf("export contains VALUE=TEXT — DAVx5 will reject these events")
	}
}

func TestICSImportAllDayEvent(t *testing.T) {
	r := setupICS(t)
	sid := loginSession(t, r)

	// All-day event — DATE type, no time
	icsContent := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:allday-test
DTSTART;VALUE=DATE:20260620
DTEND;VALUE=DATE:20260621
SUMMARY:All Day Event
END:VEVENT
END:VCALENDAR`

	body, _ := json.Marshal(map[string]any{
		"content":      icsContent,
		"calendarName": "AllDay Cal",
		"selectedUids": []string{"allday-test"},
	})
	req := httptest.NewRequest("POST", "/api/ics/import", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 201 {
		t.Fatalf("import returned %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Data struct{ CalendarID string } `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)

	var allDay int
	db.DB.QueryRow("SELECT all_day FROM events WHERE calendar_id=?", resp.Data.CalendarID).Scan(&allDay)
	if allDay != 1 {
		t.Errorf("all_day=%d want 1 (all-day event not detected)", allDay)
	}
}

func TestICSPreview(t *testing.T) {
	r := setupICS(t)
	sid := loginSession(t, r)

	body, _ := json.Marshal(map[string]string{
		"content": `BEGIN:VCALENDAR
VERSION:2.0
X-WR-CALNAME:Preview Cal
BEGIN:VEVENT
UID:prev-1
DTSTART:20260701T090000Z
DTEND:20260701T100000Z
SUMMARY:Preview Event
END:VEVENT
END:VCALENDAR`,
	})
	req := httptest.NewRequest("POST", "/api/ics/preview", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("preview returned %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Data struct {
			Name       string `json:"name"`
			EventCount int    `json:"eventCount"`
		} `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Name != "Preview Cal" {
		t.Errorf("name=%q", resp.Data.Name)
	}
	if resp.Data.EventCount != 1 {
		t.Errorf("eventCount=%d", resp.Data.EventCount)
	}
}
