package sync_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"calendar/internal/auth"
	"calendar/internal/db"
	"calendar/internal/middleware"
	"calendar/internal/sync"
)

func setupSync(t *testing.T) (chi.Router, string) {
	t.Helper()
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS sync_sequence (id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, record_id TEXT, op TEXT, synced_at TEXT)`,
		`CREATE TABLE IF NOT EXISTS deleted_log (table_name TEXT, record_id TEXT)`,
		`CREATE TABLE IF NOT EXISTS calendar_members (
			calendar_id TEXT NOT NULL, user_id TEXT NOT NULL,
			role TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
	} {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("create table: %v", err)
		}
	}
	hash, _ := auth.MakePasswordHash("testpass")
	db.DB.Exec(`INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
		VALUES ('u-1', 'testuser', ?, '2026-01-01T00:00:00Z')`, hash)

	r := chi.NewRouter()
	auth.RegisterRoutes(r)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		sync.RegisterRoutes(r)
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

func TestSyncPull(t *testing.T) {
	r, sid := setupSync(t)
	req := httptest.NewRequest("GET", "/api/sync/pull?last_pulled_seq=0", nil)
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("expected 200 got %d", w.Code)
	}
}

func TestSyncPush(t *testing.T) {
	r, sid := setupSync(t)
	req := httptest.NewRequest("POST", "/api/sync/push", strings.NewReader(
		`{"changes":{},"last_pulled_seq":0}`))
	req.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("expected 200 got %d", w.Code)
	}
}
