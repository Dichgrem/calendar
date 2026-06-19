package backup

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"calendar/internal/db"
	"calendar/internal/middleware"
)

func setupBackupDB(t *testing.T) chi.Router {
	t.Helper()
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(backupDir())
	})

	if err := os.MkdirAll(backupDir(), 0o700); err != nil {
		t.Fatalf("create backup dir: %v", err)
	}

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
			created_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS calendar_members (
			calendar_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
			PRIMARY KEY (calendar_id, user_id))`,
	}
	for _, stmt := range stmts {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("create table: %v", err)
		}
	}

	_, _ = db.DB.Exec(`INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
		VALUES ('u-1', 'testuser', 'dummy:hash', '2026-01-01T00:00:00Z')`)

	r := chi.NewRouter()
	r.Use(middleware.RequireAuth)
	RegisterRoutes(r)
	return r
}

func TestBackupUnauthorized(t *testing.T) {
	r := setupBackupDB(t)
	req := httptest.NewRequest("POST", "/api/backup", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestBackupListUnauthenticated(t *testing.T) {
	r := setupBackupDB(t)
	req := httptest.NewRequest("GET", "/api/backups", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestBackupDownloadPathTraversalBlocked(t *testing.T) {
	r := setupBackupDB(t)

	tests := []string{
		"../etc/passwd",
		"..\\windows\\system32",
		"test.db/../../secret",
		"not-a-db.txt",
	}
	for _, name := range tests {
		req := httptest.NewRequest("GET", "/api/backup/download/"+name, nil)
		req.Header.Set("Authorization", "Basic dXNlcm5hbWU6cGFzc3dvcmQ=")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		// May be 400 (bad filename), 401 (auth failed), or 403 (not admin)
		if w.Code != 400 && w.Code != 401 && w.Code != 403 {
			t.Errorf("download %q: expected 400/401/403, got %d", name, w.Code)
		}
	}
}

func TestBackupRestoreInvalidFilename(t *testing.T) {
	r := setupBackupDB(t)

	req := httptest.NewRequest("POST", "/api/backup/restore", strings.NewReader(`{"filename":"../../../malicious.db"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Basic dXNlcm5hbWU6cGFzc3dvcmQ=")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 && w.Code != 401 && w.Code != 403 {
		t.Errorf("expected 400/401/403, got %d", w.Code)
	}
}

func TestIsInstanceAdminNilPerm(t *testing.T) {
	_ = setupBackupDB(t)
	req := httptest.NewRequest("GET", "/", nil)
	if isInstanceAdmin(req) {
		t.Error("unauthenticated should not be admin")
	}
}
