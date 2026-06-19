package settings_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"calendar/internal/auth"
	"calendar/internal/db"
	"calendar/internal/middleware"
	"calendar/internal/settings"
)

func setupSettings(t *testing.T) (chi.Router, string) {
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
		`CREATE TABLE IF NOT EXISTS user_settings (
			user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			language TEXT NOT NULL DEFAULT 'zh-CN',
			first_day_of_week INTEGER NOT NULL DEFAULT 0,
			show_event_time INTEGER NOT NULL DEFAULT 1,
			date_format TEXT NOT NULL DEFAULT 'yyyy-MM-dd',
			show_lunar_calendar INTEGER NOT NULL DEFAULT 0,
			auto_backup_calendars TEXT DEFAULT '',
			auto_backup_interval_min INTEGER DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS calendar_members (
			calendar_id TEXT NOT NULL, user_id TEXT NOT NULL,
			role TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
	} {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("create table: %v", err)
		}
	}
	hash, _ := auth.MakePasswordHash("testpass")
	_, _ = db.DB.Exec(`INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
		VALUES ('u-1', 'testuser', ?, '2026-01-01T00:00:00Z')`, hash)
	// Ensure settings row exists for the test user
	_, _ = db.DB.Exec(`INSERT OR IGNORE INTO user_settings (user_id, language, first_day_of_week, show_event_time, date_format, show_lunar_calendar)
		VALUES ('u-1', 'zh-CN', 0, 1, 'yyyy-MM-dd', 0)`)

	r := chi.NewRouter()
	auth.RegisterRoutes(r)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		settings.RegisterRoutes(r)
	})

	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(
		`{"username":"testuser","password":"testpass"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	for _, c := range w.Result().Cookies() {
		if c.Name == "session_token" {
			return r, c.Value
		}
	}
	t.Fatal("login failed")
	return r, ""
}

func TestSettingsGet(t *testing.T) {
	r, sid := setupSettings(t)
	req := httptest.NewRequest("GET", "/api/settings", nil)
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("expected 200 got %d", w.Code)
	}
}

func TestSettingsUpdate(t *testing.T) {
	r, sid := setupSettings(t)
	req := httptest.NewRequest("PATCH", "/api/settings", strings.NewReader(
		`{"language":"en","showLunarCalendar":true}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200 got %d: %s", w.Code, w.Body.String())
	}
}

func TestSettingsValidation(t *testing.T) {
	r, sid := setupSettings(t)
	req := httptest.NewRequest("PATCH", "/api/settings", strings.NewReader(
		`{"language":"fr","firstDayOfWeek":9}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Errorf("expected 400 for invalid language, got %d", w.Code)
	}
}
