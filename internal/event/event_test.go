package event_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	ev "calendar/internal/event"
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
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_overrides_parent_date ON event_overrides(parent_id, original_date)`,
		`CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY NOT NULL, language TEXT NOT NULL DEFAULT 'zh-CN', first_day_of_week INTEGER NOT NULL DEFAULT 1, show_event_time INTEGER NOT NULL DEFAULT 0, date_format TEXT NOT NULL DEFAULT 'zh', show_lunar_calendar INTEGER NOT NULL DEFAULT 1)`,
	} {
		if _, err := db.DB.Exec(stmt); err != nil {
			t.Fatalf("create table: %v\n%s", err, stmt)
		}
	}

	userID := "ev-test-user"
	db.DB.Exec("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
		userID, "test", "dummy", "2026-01-01T00:00:00Z")
	db.DB.Exec("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
		"ev-session", userID, "2099-01-01T00:00:00Z")

	// Create a default calendar
	calID := "ev-test-cal"
	db.DB.Exec("INSERT INTO calendars (id, name, color, owner_id, created_at, updated_at, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?)",
		calID, "Default", "#3b82f6", userID, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", 0)
	db.DB.Exec("INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)",
		calID, userID, "admin")

	r := chi.NewRouter()
	r.Use(middleware.ErrorHandler)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		ev.RegisterRoutes(r)
	})

	t.Cleanup(func() { db.Close() })
	return r, calID
}

func authReq(method, url string, body interface{}) *http.Request {
	var req *http.Request
	if body != nil {
		b, _ := json.Marshal(body)
		req = httptest.NewRequest(method, url, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, url, nil)
	}
	req.Header.Set("Authorization", "Bearer ev-session")
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

func TestCreateAndListEvents(t *testing.T) {
	r, calID := setupDB(t)

	// Create
	w := httptest.NewRecorder()
	r.ServeHTTP(w, authReq("POST", "/api/calendars/"+calID+"/events", map[string]interface{}{
		"title":   "Meeting",
		"startAt": "2026-06-08T09:00:00Z",
		"endAt":   "2026-06-08T10:00:00Z",
	}))
	if w.Code != 201 {
		t.Fatalf("create: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	// List - should include the event
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authReq("GET", "/api/calendars/"+calID+"/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z", nil))
	if w2.Code != 200 {
		t.Fatalf("list: expected 200, got %d", w2.Code)
	}

	var resp apiResp
	json.NewDecoder(w2.Body).Decode(&resp)
	var events []map[string]interface{}
	json.Unmarshal(resp.Data, &events)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
}

func TestEventOverlapQuery(t *testing.T) {
	r, calID := setupDB(t)

	// Event from 09:00 to 11:00 on June 8
	w := httptest.NewRecorder()
	r.ServeHTTP(w, authReq("POST", "/api/calendars/"+calID+"/events", map[string]interface{}{
		"title":   "Long Meeting",
		"startAt": "2026-06-08T09:00:00Z",
		"endAt":   "2026-06-08T11:00:00Z",
	}))

	// Query with range 10:00-10:30 — should include overlapping event
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authReq("GET", "/api/calendars/"+calID+"/events?start=2026-06-08T10:00:00Z&end=2026-06-08T10:30:00Z", nil))
	var resp apiResp
	json.NewDecoder(w2.Body).Decode(&resp)
	var events []map[string]interface{}
	json.Unmarshal(resp.Data, &events)
	if len(events) < 1 {
		t.Fatal("overlap query should include overlapping event")
	}

	// Query outside range — should NOT include
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, authReq("GET", "/api/calendars/"+calID+"/events?start=2026-06-09T00:00:00Z&end=2026-06-09T23:59:59Z", nil))
	json.NewDecoder(w3.Body).Decode(&resp)
	json.Unmarshal(resp.Data, &events)
	if len(events) != 0 {
		t.Fatal("non-overlap query should not include event")
	}
}

func TestUpdateEvent(t *testing.T) {
	r, calID := setupDB(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, authReq("POST", "/api/calendars/"+calID+"/events", map[string]interface{}{
		"title":   "Old Title",
		"startAt": "2026-06-08T09:00:00Z",
		"endAt":   "2026-06-08T10:00:00Z",
	}))
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	var ev map[string]interface{}
	json.Unmarshal(resp.Data, &ev)
	evID := ev["id"].(string)

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authReq("PATCH", "/api/events/"+evID, map[string]string{
		"title": "New Title",
	}))
	if w2.Code != 200 {
		t.Fatalf("update: expected 200, got %d: %s", w2.Code, w2.Body.String())
	}

	json.NewDecoder(w2.Body).Decode(&resp)
	json.Unmarshal(resp.Data, &ev)
	if ev["title"] != "New Title" {
		t.Fatalf("expected New Title, got %v", ev["title"])
	}
}

func TestDeleteEvent(t *testing.T) {
	r, calID := setupDB(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, authReq("POST", "/api/calendars/"+calID+"/events", map[string]interface{}{
		"title":   "ToDelete",
		"startAt": "2026-06-08T09:00:00Z",
		"endAt":   "2026-06-08T10:00:00Z",
	}))
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	var ev map[string]interface{}
	json.Unmarshal(resp.Data, &ev)
	evID := ev["id"].(string)

	// Soft delete
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authReq("DELETE", "/api/events/"+evID, nil))
	if w2.Code != 200 {
		t.Fatalf("delete: expected 200, got %d", w2.Code)
	}

	// Should not appear in list
	w3 := httptest.NewRecorder()
	r.ServeHTTP(w3, authReq("GET", "/api/calendars/"+calID+"/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z", nil))
	json.NewDecoder(w3.Body).Decode(&resp)
	var events []map[string]interface{}
	json.Unmarshal(resp.Data, &events)
	if len(events) != 0 {
		t.Fatal("deleted event should not appear in list")
	}

	// But should still be accessible by ID
	w4 := httptest.NewRecorder()
	r.ServeHTTP(w4, authReq("GET", "/api/events/"+evID, nil))
	if w4.Code != 200 {
		t.Fatalf("get deleted event: expected 200, got %d", w4.Code)
	}
}

func TestEventOverride(t *testing.T) {
	r, calID := setupDB(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, authReq("POST", "/api/calendars/"+calID+"/events", map[string]interface{}{
		"title":   "Recurring",
		"startAt": "2026-06-08T09:00:00Z",
		"endAt":   "2026-06-08T10:00:00Z",
		"rrule":   "FREQ=WEEKLY",
	}))
	var resp apiResp
	json.NewDecoder(w.Body).Decode(&resp)
	var ev map[string]interface{}
	json.Unmarshal(resp.Data, &ev)
	evID := ev["id"].(string)

	// Create override
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, authReq("POST", "/api/events/"+evID+"/override", map[string]interface{}{
		"originalDate":  "2026-06-15",
		"overrideTitle": "Special Edition",
	}))
	if w2.Code != 201 {
		t.Fatalf("override: expected 201, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestEventValidation(t *testing.T) {
	r, calID := setupDB(t)

	tests := []struct {
		name string
		body map[string]interface{}
		code int
	}{
		{"empty title", map[string]interface{}{"title": "", "startAt": "2026-06-08T09:00:00Z", "endAt": "2026-06-08T10:00:00Z"}, 400},
		{"missing startAt", map[string]interface{}{"title": "Test", "endAt": "2026-06-08T10:00:00Z"}, 400},
		{"missing endAt", map[string]interface{}{"title": "Test", "startAt": "2026-06-08T10:00:00Z"}, 400},
		{"invalid color", map[string]interface{}{"title": "Test", "startAt": "2026-06-08T09:00:00Z", "endAt": "2026-06-08T10:00:00Z", "color": "purple"}, 400},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r.ServeHTTP(w, authReq("POST", "/api/calendars/"+calID+"/events", tt.body))
			if w.Code != tt.code {
				t.Errorf("expected %d, got %d: %s", tt.code, w.Code, w.Body.String())
			}
		})
	}
}

func TestEventNotFound(t *testing.T) {
	r, _ := setupDB(t)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, authReq("GET", "/api/events/nonexistent", nil))
	if w.Code != 404 {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
