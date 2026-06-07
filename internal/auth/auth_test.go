package auth_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"calendar/internal/auth"
	"calendar/internal/db"
	"calendar/internal/middleware"
)

func setupTestDB(t *testing.T) {
	t.Helper()
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	// Create tables
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
		`CREATE TABLE IF NOT EXISTS event_overrides (
			id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			original_date TEXT NOT NULL, override_start TEXT, override_end TEXT,
			override_title TEXT, deleted INTEGER NOT NULL DEFAULT 0, last_modified INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS user_settings (
			user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			language TEXT NOT NULL DEFAULT 'zh-CN', first_day_of_week INTEGER NOT NULL DEFAULT 1,
			show_event_time INTEGER NOT NULL DEFAULT 0, date_format TEXT NOT NULL DEFAULT 'zh',
			show_lunar_calendar INTEGER NOT NULL DEFAULT 1)`,
	} {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("create table: %v\n%s", err, stmt)
		}
	}
	t.Cleanup(func() {
		db.Close()
	})
}

func newRouter() chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.ErrorHandler)
	auth.RegisterRoutes(r)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		auth.RegisterProtectedRoutes(r)
	})
	return r
}

func postJSON(url string, body interface{}) *http.Request {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func readJSON[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return v
}

type apiResponse struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func TestAuthStatus_NoUsers(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	req := httptest.NewRequest("GET", "/api/auth/status", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	resp := readJSON[apiResponse](t, w.Result())
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var data map[string]bool
	json.Unmarshal(resp.Data, &data)
	if data["registered"] != false {
		t.Fatal("expected registered=false")
	}
}

func TestAuthRegisterAndLogin(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	// Register
	req := postJSON("/api/auth/register", map[string]string{
		"username": "alice",
		"password": "secret1234",
	})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 201 {
		t.Fatalf("register: expected 201, got %d, body=%s", w.Code, w.Body.String())
	}

	// Check cookie
	cookies := w.Result().Cookies()
	var sessionCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == "session_token" {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("no session_token cookie set")
	}

	// Me
	req2 := httptest.NewRequest("GET", "/api/auth/me", nil)
	req2.AddCookie(sessionCookie)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	resp2 := readJSON[apiResponse](t, w2.Result())
	if w2.Code != 200 {
		t.Fatalf("me: expected 200, got %d, body=%s", w2.Code, w2.Body.String())
	}
	var meData map[string]string
	json.Unmarshal(resp2.Data, &meData)
	if meData["username"] != "alice" {
		t.Fatalf("expected username=alice, got %s", meData["username"])
	}

	// Logout
	req3 := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req3.AddCookie(sessionCookie)
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != 200 {
		t.Fatalf("logout: expected 200, got %d", w3.Code)
	}

	// Me after logout should fail
	req4 := httptest.NewRequest("GET", "/api/auth/me", nil)
	req4.AddCookie(sessionCookie)
	w4 := httptest.NewRecorder()
	r.ServeHTTP(w4, req4)
	if w4.Code != 401 {
		t.Fatalf("me after logout: expected 401, got %d", w4.Code)
	}

	// Login
	req5 := postJSON("/api/auth/login", map[string]string{
		"username": "alice",
		"password": "secret1234",
	})
	w5 := httptest.NewRecorder()
	r.ServeHTTP(w5, req5)

	resp5 := readJSON[apiResponse](t, w5.Result())
	if w5.Code != 200 {
		t.Fatalf("login: expected 200, got %d, body=%s", w5.Code, w5.Body.String())
	}
	var loginData map[string]string
	json.Unmarshal(resp5.Data, &loginData)
	if loginData["sessionId"] == "" {
		t.Fatal("expected sessionId in login response")
	}
}

func TestAuthDoubleRegister(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	// First register
	w := httptest.NewRecorder()
	r.ServeHTTP(w, postJSON("/api/auth/register", map[string]string{
		"username": "bob", "password": "pass1234",
	}))
	if w.Code != 201 {
		t.Fatalf("first register: expected 201, got %d", w.Code)
	}

	// Second register
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, postJSON("/api/auth/register", map[string]string{
		"username": "charlie", "password": "pass5678",
	}))
	if w2.Code != 403 {
		t.Fatalf("second register: expected 403, got %d", w2.Code)
	}
}

func TestAuthLoginInvalidCredentials(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	// Register first
	w := httptest.NewRecorder()
	r.ServeHTTP(w, postJSON("/api/auth/register", map[string]string{
		"username": "dave", "password": "rightpass",
	}))

	// Wrong password
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, postJSON("/api/auth/login", map[string]string{
		"username": "dave", "password": "wrongpass",
	}))
	if w2.Code != 401 {
		t.Fatalf("wrong password: expected 401, got %d", w2.Code)
	}
}

func TestAuthChangePassword(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	// Register
	w := httptest.NewRecorder()
	r.ServeHTTP(w, postJSON("/api/auth/register", map[string]string{
		"username": "eve", "password": "oldpass1",
	}))
	cookies := w.Result().Cookies()

	// Change password
	body, _ := json.Marshal(map[string]string{
		"oldPassword": "oldpass1",
		"newPassword": "newpass99",
	})
	req := httptest.NewRequest("POST", "/api/auth/change-password", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req)
	if w2.Code != 200 {
		t.Fatalf("change password: expected 200, got %d, body=%s", w2.Code, w2.Body.String())
	}

	// Old password should not work anymore
	req3 := postJSON("/api/auth/login", map[string]string{
		"username": "eve", "password": "oldpass1",
	})
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != 401 {
		t.Fatalf("old password after change: expected 401, got %d", w3.Code)
	}

	// New password should work
	req4 := postJSON("/api/auth/login", map[string]string{
		"username": "eve", "password": "newpass99",
	})
	w4 := httptest.NewRecorder()
	r.ServeHTTP(w4, req4)
	if w4.Code != 200 {
		t.Fatalf("new password: expected 200, got %d, body=%s", w4.Code, w4.Body.String())
	}
}

func TestAuthChangeUsername(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	w := httptest.NewRecorder()
	r.ServeHTTP(w, postJSON("/api/auth/register", map[string]string{
		"username": "frank", "password": "pass1234",
	}))
	cookies := w.Result().Cookies()

	body, _ := json.Marshal(map[string]string{"username": "franklin"})
	req := httptest.NewRequest("POST", "/api/auth/change-username", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req)
	if w2.Code != 200 {
		t.Fatalf("change username: expected 200, got %d", w2.Code)
	}

	// Me should show new username
	req3 := httptest.NewRequest("GET", "/api/auth/me", nil)
	for _, c := range cookies {
		req3.AddCookie(c)
	}
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	resp := readJSON[apiResponse](t, w3.Result())
	var data map[string]string
	json.Unmarshal(resp.Data, &data)
	if data["username"] != "franklin" {
		t.Fatalf("expected username=franklin, got %s", data["username"])
	}
}

func TestAuthToken(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	w := httptest.NewRecorder()
	r.ServeHTTP(w, postJSON("/api/auth/register", map[string]string{
		"username": "grace", "password": "pass1234",
	}))
	cookies := w.Result().Cookies()

	req := httptest.NewRequest("GET", "/api/auth/token", nil)
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req)
	if w2.Code != 200 {
		t.Fatalf("token: expected 200, got %d", w2.Code)
	}
	resp := readJSON[apiResponse](t, w2.Result())
	var data map[string]string
	json.Unmarshal(resp.Data, &data)
	if data["token"] == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestAuthBearerToken(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	w := httptest.NewRecorder()
	r.ServeHTTP(w, postJSON("/api/auth/register", map[string]string{
		"username": "heidi", "password": "pass1234",
	}))

	// Get token
	req := httptest.NewRequest("GET", "/api/auth/token", nil)
	for _, c := range w.Result().Cookies() {
		req.AddCookie(c)
	}
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req)
	resp := readJSON[apiResponse](t, w2.Result())
	var data map[string]string
	json.Unmarshal(resp.Data, &data)
	token := data["token"]

	// Use token via Authorization header
	req3 := httptest.NewRequest("GET", "/api/auth/me", nil)
	req3.Header.Set("Authorization", "Bearer "+token)
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, req3)
	if w3.Code != 200 {
		t.Fatalf("me with bearer: expected 200, got %d", w3.Code)
	}
}

func TestAuthValidation(t *testing.T) {
	setupTestDB(t)
	r := newRouter()

	tests := []struct {
		name     string
		body     map[string]string
		wantCode int
	}{
		{"empty username", map[string]string{"username": "", "password": "pass1234"}, 400},
		{"short password", map[string]string{"username": "test", "password": "ab"}, 400},
		{"long username", map[string]string{"username": string(make([]byte, 101)), "password": "pass1234"}, 400},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, postJSON("/api/auth/register", tt.body))
			if w.Code != tt.wantCode {
				t.Errorf("expected %d, got %d", tt.wantCode, w.Code)
			}
		})
	}
}
