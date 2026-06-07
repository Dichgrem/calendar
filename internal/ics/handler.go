package ics

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/middleware"
)

// RegisterRoutes adds ICS import/export routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Post("/api/ics/preview", handlePreview)
	r.Post("/api/ics/fetch-url", handleFetchURL)
	r.Post("/api/ics/import", handleImport)
	r.Get("/api/calendars/{calendarId}/ics/export", handleExport)
}

// PreviewItem is one parsed VEVENT in preview response.
type PreviewItem struct {
	Type     string `json:"type"`
	UID      string `json:"uid"`
	Title    string `json:"title"`
	StartAt  string `json:"startAt"`
	EndAt    string `json:"endAt"`
	RRule    string `json:"rrule"`
	Selected bool   `json:"selected"`
}

type previewResponse struct {
	Name       string        `json:"name"`
	EventCount int           `json:"eventCount"`
	TimeSpan   *timeSpanData `json:"timeSpan"`
	Items      []PreviewItem `json:"items"`
}

type timeSpanData struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func handlePreview(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.Content == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("content is required"))
		return
	}

	result, err := ParseIcs(req.Content)
	if err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to parse ICS: "+err.Error()))
		return
	}

	items := make([]PreviewItem, 0, len(result.Events))
	var earliest, latest string
	for _, e := range result.Events {
		item := PreviewItem{
			Type:     "event",
			UID:      e.UID,
			Title:    e.Title,
			StartAt:  e.StartAt,
			EndAt:    e.EndAt,
			RRule:    e.RRule,
			Selected: true,
		}
		items = append(items, item)

		if e.StartAt != "" {
			if earliest == "" || e.StartAt < earliest {
				earliest = e.StartAt
			}
		}
		if e.EndAt != "" {
			if latest == "" || e.EndAt > latest {
				latest = e.EndAt
			}
		}
	}

	resp := previewResponse{
		Name:       result.Name,
		EventCount: len(result.Events),
		Items:      items,
	}
	if earliest != "" || latest != "" {
		resp.TimeSpan = &timeSpanData{From: earliest, To: latest}
	}

	middleware.JSONResponse(w, 200, resp)
}

func handleFetchURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.URL == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("url is required"))
		return
	}

	content, err := FetchIcsFromURL(req.URL)
	if err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to fetch: "+err.Error()))
		return
	}

	result, err := ParseIcs(content)
	if err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to parse ICS: "+err.Error()))
		return
	}

	items := make([]PreviewItem, 0, len(result.Events))
	var earliest, latest string
	for _, e := range result.Events {
		items = append(items, PreviewItem{
			Type:     "event",
			UID:      e.UID,
			Title:    e.Title,
			StartAt:  e.StartAt,
			EndAt:    e.EndAt,
			RRule:    e.RRule,
			Selected: true,
		})
		if e.StartAt != "" && (earliest == "" || e.StartAt < earliest) {
			earliest = e.StartAt
		}
		if e.EndAt != "" && (latest == "" || e.EndAt > latest) {
			latest = e.EndAt
		}
	}

	preview := previewResponse{
		Name:       result.Name,
		EventCount: len(result.Events),
		Items:      items,
	}
	if earliest != "" || latest != "" {
		preview.TimeSpan = &timeSpanData{From: earliest, To: latest}
	}

	middleware.JSONResponse(w, 200, map[string]interface{}{
		"preview": preview,
		"content": content,
	})
}

type importRequest struct {
	Content      string   `json:"content"`
	CalendarID   string   `json:"calendarId"`
	CalendarName string   `json:"calendarName"`
	Color        string   `json:"color"`
	SourceURL    string   `json:"sourceUrl"`
	SelectedUIDs []string `json:"selectedUids"`
	Overwrite    bool     `json:"overwrite"`
}

func handleImport(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)

	var req importRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.Content == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("content is required"))
		return
	}

	result, err := ParseIcs(req.Content)
	if err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to parse ICS"))
		return
	}

	// Build selected set for fast lookup
	selected := make(map[string]bool, len(req.SelectedUIDs))
	for _, uid := range req.SelectedUIDs {
		selected[uid] = true
	}

	var calendarID string

	tx, err := db.DB.Begin()
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer tx.Rollback()

	if req.CalendarID != "" {
		// Import into existing calendar
		if !perm.IsMember(req.CalendarID) {
			middleware.JSONResponse(w, 403, apperror.Forbidden("Access denied"))
			return
		}
		calendarID = req.CalendarID
	} else {
		// Create new calendar
		name := req.CalendarName
		if name == "" {
			name = result.Name
		}
		color := req.Color
		if color == "" {
			color = "#3b82f6"
		}
		sourceType := "ics_import"
		sourceURL := ""
		if req.SourceURL != "" {
			sourceType = "ics_subscription"
			sourceURL = req.SourceURL
		}

		calID := uuid.New().String()
		now := time.Now().UTC().Format(time.RFC3339)
		lmod := time.Now().UnixMilli()

		if _, err := tx.Exec(
			`INSERT INTO calendars (id, name, color, source_url, source_type, owner_id, created_at, updated_at, last_modified)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			calID, name, color, sourceURL, sourceType, perm.UserID, now, now, lmod,
		); err != nil {
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}
		if _, err := tx.Exec(
			"INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)",
			calID, perm.UserID, "admin",
		); err != nil {
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}

		calendarID = calID
	}

	// Import events
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	for _, e := range result.Events {
		if !selected[e.UID] {
			continue
		}

		eventID := uuid.New().String()

		allDay := 0
		// Detect all-day: date string length exactly 10 chars (YYYY-MM-DD)
		if len(e.StartAt) == 10 && len(e.EndAt) == 10 {
			allDay = 1
		}

		_, err := tx.Exec(`
			INSERT INTO events (id, calendar_id, title, description, start_at, end_at,
			                    all_day, rrule, color, location, created_at, updated_at, last_modified, raw_ics)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, eventID, calendarID, e.Title, strOrNil(e.Description), e.StartAt, e.EndAt,
			allDay, strOrNil(e.RRule), nil, strOrNil(e.Location), now, now, lmod, req.Content)
		if err != nil {
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}
	}

	if err := tx.Commit(); err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 201, map[string]string{"calendarId": calendarID})
}

func handleExport(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	calendarID := chi.URLParam(r, "calendarId")

	if !perm.IsMember(calendarID) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Access denied"))
		return
	}

	// Get calendar name
	var calName string
	db.DB.QueryRow("SELECT name FROM calendars WHERE id = ?", calendarID).Scan(&calName)

	// Get events (non-deleted)
	rows, err := db.DB.Query(`
		SELECT id, title, description, start_at, end_at, all_day, rrule, location, created_at, updated_at
		FROM events WHERE calendar_id = ? AND deleted = 0
	`, calendarID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer rows.Close()

	var events []IcsEvent
	for rows.Next() {
		var id, title, startAt, endAt, createdAt, updatedAt string
		var desc, rrule, loc *string
		var allDay int
		if err := rows.Scan(&id, &title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt, &updatedAt); err != nil {
			continue
		}

		e := IcsEvent{
			UID:     id + "@calendar",
			Title:   title,
			StartAt: startAt,
			EndAt:   endAt,
			DTStamp: createdAt,
		}
		if desc != nil {
			e.Description = *desc
		}
		if rrule != nil {
			e.RRule = *rrule
		}
		if loc != nil {
			e.Location = *loc
		}
		events = append(events, e)
	}

	icsContent := SerializeCalendar(calName, events)

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"calendar.ics\"")
	w.WriteHeader(200)
	w.Write([]byte(icsContent))
}

func strOrNil(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
