package backup_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"calendar/internal/auth"
	"calendar/internal/backup"
	"calendar/internal/db"
	"calendar/internal/middleware"
)

func setupBackup(t *testing.T) chi.Router {
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

	r := chi.NewRouter()
	auth.RegisterRoutes(r)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		auth.RegisterProtectedRoutes(r)
		backup.RegisterRoutes(r)
	})
	return r
}

func TestBackupAuthRequired(t *testing.T) {
	r := setupBackup(t)
	req := httptest.NewRequest("POST", "/api/backup", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 401 {
		t.Errorf("expected 401 got %d", w.Code)
	}
}

func TestBackupPathTraversalBlocked(t *testing.T) {
	r := setupBackup(t)
	// Login
	req1 := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(
		`{"username":"testuser","password":"testpass"}`,
	))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)
	var sid string
	for _, c := range w1.Result().Cookies() {
		if c.Name == "session_token" {
			sid = c.Value
		}
	}
	if sid == "" {
		t.Fatal("login failed")
	}

	req2 := httptest.NewRequest("GET", "/api/backup/download/../../../etc/passwd", nil)
	req2.AddCookie(&http.Cookie{Name: "session_token", Value: sid})
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != 404 {
		t.Errorf("expected 404 (chi normalizes path), got %d", w2.Code)
	}
}
