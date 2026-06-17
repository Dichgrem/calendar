package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"calendar/internal/db"
)

func TestResolveSessionEmpty(t *testing.T) {
	perm, sid := resolveSession("")
	if perm != nil || sid != "" {
		t.Error("empty session should return nil")
	}
}

func TestResolveSessionVirtual(t *testing.T) {
	_ = db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON")
	t.Cleanup(func() {
		_ = db.DB.Close()
		db.DB = nil
	})

	_, _ = db.DB.Exec(`CREATE TABLE IF NOT EXISTS calendar_members (
		calendar_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
		PRIMARY KEY (calendar_id, user_id))`)

	perm, sid := resolveSession("u:test-user-1")
	if perm == nil {
		t.Fatal("virtual session should resolve")
	}
	if perm.UserID != "test-user-1" {
		t.Errorf("userID: %s", perm.UserID)
	}
	if sid != "u:test-user-1" {
		t.Errorf("session id: %s", sid)
	}
}

func TestLoadRolesEmpty(t *testing.T) {
	_ = db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON")
	t.Cleanup(func() {
		_ = db.DB.Close()
		db.DB = nil
	})

	_, _ = db.DB.Exec(`CREATE TABLE IF NOT EXISTS calendar_members (
		calendar_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
		PRIMARY KEY (calendar_id, user_id))`)

	roles, err := loadRoles("no-such-user")
	if err != nil {
		t.Fatalf("loadRoles: %v", err)
	}
	if len(roles) != 0 {
		t.Errorf("empty roles expected, got %d", len(roles))
	}
}

func TestPermissionContextIsMember(t *testing.T) {
	p := &PermissionContext{
		UserID: "u-1",
		Roles:  map[string]string{"cal-1": "admin", "cal-2": "viewer"},
	}
	if !p.IsMember("cal-1") {
		t.Error("should be member of cal-1")
	}
	if p.IsMember("cal-3") {
		t.Error("should not be member of cal-3")
	}
}

func TestPermissionContextRequireRole(t *testing.T) {
	p := &PermissionContext{
		Roles: map[string]string{"cal-1": "admin", "cal-2": "viewer"},
	}
	if !p.RequireRole("cal-1", "editor") {
		t.Error("admin >= editor")
	}
	if p.RequireRole("cal-2", "editor") {
		t.Error("viewer < editor")
	}
	if p.RequireRole("cal-3", "viewer") {
		t.Error("not a member")
	}
}

func TestRoleGte(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"admin", "admin", true},
		{"admin", "editor", true},
		{"admin", "viewer", true},
		{"editor", "admin", false},
		{"editor", "editor", true},
		{"editor", "viewer", true},
		{"viewer", "admin", false},
		{"viewer", "editor", false},
		{"viewer", "viewer", true},
	}
	for _, tc := range tests {
		if got := RoleGte(tc.a, tc.b); got != tc.want {
			t.Errorf("RoleGte(%s, %s) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestRequireAuthValidSession(t *testing.T) {
	handler := RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer valid-token")

	_ = db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON")
	t.Cleanup(func() {
		_ = db.DB.Close()
		db.DB = nil
	})

	_, _ = db.DB.Exec(`CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)`)
	_, _ = db.DB.Exec(`CREATE TABLE IF NOT EXISTS calendar_members (
		calendar_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
		PRIMARY KEY (calendar_id, user_id))`)
	_, _ = db.DB.Exec(`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL,
		created_at TEXT NOT NULL)`)
	_, _ = db.DB.Exec(`INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
		VALUES ('u-1', 'test', 'x', '2026-01-01T00:00:00Z')`)
	_, _ = db.DB.Exec(`INSERT OR IGNORE INTO sessions (id, user_id, expires_at)
		VALUES ('valid-token', 'u-1', '2099-01-01T00:00:00Z')`)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestRequireAuthNoSession(t *testing.T) {
	handler := RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestGetPermissionNil(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	if p := GetPermission(req); p != nil {
		t.Error("no context should return nil")
	}
}

func TestGetPermissionSet(t *testing.T) {
	perm := &PermissionContext{UserID: "u-1"}
	ctx := context.WithValue(context.Background(), PermissionCtxKey, perm)
	req := httptest.NewRequest("GET", "/", nil).WithContext(ctx)
	if p := GetPermission(req); p == nil || p.UserID != "u-1" {
		t.Error("should find permission in context")
	}
}
