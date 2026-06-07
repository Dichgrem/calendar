package calendar_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	cal "calendar/internal/calendar"
	"calendar/internal/db"
	"calendar/internal/middleware"
)

func setupDB(t *testing.T) (chi.Router, string) {
	t.Helper()
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS calendars (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, source_url TEXT, source_type TEXT NOT NULL DEFAULT 'manual', owner_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_modified INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS calendar_members (calendar_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, calendar_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, start_at TEXT NOT NULL, end_at TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0, rrule TEXT, color TEXT, location TEXT, parent_id TEXT, original_date TEXT, deleted INTEGER NOT NULL DEFAULT 0, raw_ics TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_modified INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS event_overrides (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, original_date TEXT NOT NULL, override_start TEXT, override_end TEXT, override_title TEXT, deleted INTEGER NOT NULL DEFAULT 0, last_modified INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY NOT NULL, language TEXT NOT NULL DEFAULT 'zh-CN', first_day_of_week INTEGER NOT NULL DEFAULT 1, show_event_time INTEGER NOT NULL DEFAULT 0, date_format TEXT NOT NULL DEFAULT 'zh', show_lunar_calendar INTEGER NOT NULL DEFAULT 1)`,
	} {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("create table: %v", err)
		}
	}

	// Create a user with session
	userID := "test-user-id"
	db.DB.Exec("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
		userID, "test", "dummy", "2026-01-01T00:00:00Z")
	db.DB.Exec("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
		"test-session", userID, "2099-01-01T00:00:00Z")

	r := chi.NewRouter()
	r.Use(middleware.ErrorHandler)

	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		cal.RegisterRoutes(r)
	})

	t.Cleanup(func() { db.Close() })
	return r, userID
}

func authRequest(method, url string, body interface{}) *http.Request {
	var req *http.Request
	if body != nil {
		b, _ := json.Marshal(body)
		req = httptest.NewRequest(method, url, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, url, nil)
	}
	req.Header.Set("Authorization", "Bearer test-session")
	return req
}

type apiResp struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func decodeResp[T any](t *testing.T, body json.RawMessage) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(body, &v); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return v
}

func TestCreateAndListCalendars(t *testing.T) {
	r, _ := setupDB(t)

	// Create
	w := httptest.NewRecorder()
	r.ServeHTTP(w, authRequest("POST", "/api/calendars", map[string]string{
		"name":  "Work",
		"color": "#ef4444",
	}))
	if w.Code != 201 {
		t.Fatalf("create: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// List
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authRequest("GET", "/api/calendars", nil))
	if w2.Code != 200 {
		t.Fatalf("list: expected 200, got %d", w2.Code)
	}

	var resp apiResp
	json.NewDecoder(w2.Body).Decode(&resp)
	var cals []map[string]interface{}
	json.Unmarshal(resp.Data, &cals)
	if len(cals) != 1 {
		t.Fatalf("expected 1 calendar, got %d", len(cals))
	}
	if cals[0]["name"] != "Work" {
		t.Fatalf("expected Work, got %v", cals[0]["name"])
	}
}

func TestCreateCalendarValidation(t *testing.T) {
	r, _ := setupDB(t)

	tests := []struct {
		name string
		body map[string]string
		code int
	}{
		{"empty name", map[string]string{"name": ""}, 400},
		{"long name", map[string]string{"name": string(make([]byte, 201))}, 400},
		{"invalid color", map[string]string{"name": "test", "color": "red"}, 400},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, authRequest("POST", "/api/calendars", tt.body))
			if w.Code != tt.code {
				t.Errorf("expected %d, got %d: %s", tt.code, w.Code, w.Body.String())
			}
		})
	}
}

func TestGetCalendar(t *testing.T) {
	r, _ := setupDB(t)

	// Create
	w := httptest.NewRecorder()
	r.ServeHTTP(w, authRequest("POST", "/api/calendars", map[string]string{"name": "Personal"}))

	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	var cal map[string]interface{}
	json.Unmarshal(resp.Data, &cal)
	id := cal["id"].(string)

	// Get
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authRequest("GET", "/api/calendars/"+id, nil))
	if w2.Code != 200 {
		t.Fatalf("get: expected 200, got %d", w2.Code)
	}

	// Get non-existent
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, authRequest("GET", "/api/calendars/nonexistent", nil))
	if w3.Code != 404 {
		t.Fatalf("get missing: expected 404, got %d", w3.Code)
	}
}

func TestUpdateCalendar(t *testing.T) {
	r, _ := setupDB(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, authRequest("POST", "/api/calendars", map[string]string{"name": "Old"}))
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	var cal map[string]interface{}
	json.Unmarshal(resp.Data, &cal)
	id := cal["id"].(string)

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authRequest("PATCH", "/api/calendars/"+id, map[string]string{
		"name": "New Name",
	}))
	if w2.Code != 200 {
		t.Fatalf("update: expected 200, got %d: %s", w2.Code, w2.Body.String())
	}

	// Verify
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, authRequest("GET", "/api/calendars/"+id, nil))
	json.NewDecoder(w3.Body).Decode(&resp)
	json.Unmarshal(resp.Data, &cal)
	if cal["name"] != "New Name" {
		t.Fatalf("expected New Name, got %v", cal["name"])
	}
}

func TestDeleteCalendar(t *testing.T) {
	r, _ := setupDB(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, authRequest("POST", "/api/calendars", map[string]string{"name": "ToDelete"}))
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	var cal map[string]interface{}
	json.Unmarshal(resp.Data, &cal)
	id := cal["id"].(string)

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authRequest("DELETE", "/api/calendars/"+id, nil))
	if w2.Code != 200 {
		t.Fatalf("delete: expected 200, got %d", w2.Code)
	}

	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, authRequest("GET", "/api/calendars/"+id, nil))
	if w3.Code != 404 {
		t.Fatalf("after delete: expected 404, got %d", w3.Code)
	}
}

func TestReorderCalendars(t *testing.T) {
	r, _ := setupDB(t)

	var ids []string
	for _, name := range []string{"A", "B", "C"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, authRequest("POST", "/api/calendars", map[string]string{"name": name}))
		var resp apiResp
		json.NewDecoder(w.Body).Decode(&resp)
		var cal map[string]interface{}
		json.Unmarshal(resp.Data, &cal)
		ids = append(ids, cal["id"].(string))
	}

	// Reverse order
	reqBody := map[string][]string{"orderedIds": {ids[2], ids[1], ids[0]}}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, authRequest("PATCH", "/api/calendars/reorder", reqBody))
	if w.Code != 200 {
		t.Fatalf("reorder: expected 200, got %d", w.Code)
	}

	// Verify order
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authRequest("GET", "/api/calendars", nil))
	var resp apiResp
	json.NewDecoder(w2.Body).Decode(&resp)
	var cals []map[string]interface{}
	json.Unmarshal(resp.Data, &cals)
	if cals[0]["id"] != ids[2] {
		t.Fatalf("expected first to be %s, got %s", ids[2], cals[0]["id"])
	}
}

func TestUnauthenticatedAccess(t *testing.T) {
	r, _ := setupDB(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/calendars", nil))
	if w.Code != 401 {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
