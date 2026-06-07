package event

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/middleware"
	"calendar/internal/validate"
)

// RegisterRoutes adds event routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Get("/api/calendars/{calendarId}/events", handleList)
	r.Get("/api/events/{id}", handleGet)
	r.Post("/api/calendars/{calendarId}/events", handleCreate)
	r.Patch("/api/events/{id}", handleUpdate)
	r.Delete("/api/events/{id}", handleDelete)
	r.Post("/api/events/{id}/override", handleOverride)
}

type Event struct {
	ID           string  `json:"id"`
	CalendarID   string  `json:"calendarId"`
	Title        string  `json:"title"`
	Description  *string `json:"description"`
	StartAt      string  `json:"startAt"`
	EndAt        string  `json:"endAt"`
	AllDay       bool    `json:"allDay"`
	RRule        *string `json:"rrule"`
	Color        *string `json:"color"`
	Location     *string `json:"location"`
	ParentID     *string `json:"parentId"`
	OriginalDate *string `json:"originalDate"`
	Deleted      bool    `json:"deleted"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
	LastModified int64   `json:"lastModified"`
}

func handleList(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	calendarID := chi.URLParam(r, "calendarId")
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")

	if start == "" || end == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("start and end query params required"))
		return
	}

	if !perm.IsMember(calendarID) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Access denied"))
		return
	}

	// Overlap query: start_at <= end AND end_at >= start, plus all RRULE events.
	rows, err := db.DB.Query(`
		SELECT id, calendar_id, title, description, start_at, end_at,
		       all_day, rrule, color, location, parent_id, original_date,
		       deleted, created_at, updated_at, last_modified
		FROM events
		WHERE calendar_id = ?
		  AND deleted = 0
		  AND (rrule IS NOT NULL OR (start_at <= ? AND end_at >= ?))
	`, calendarID, end, start)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer rows.Close()

	events := []Event{}
	for rows.Next() {
		var e Event
		var allDayInt int
		if err := rows.Scan(
			&e.ID, &e.CalendarID, &e.Title, &e.Description,
			&e.StartAt, &e.EndAt, &allDayInt, &e.RRule,
			&e.Color, &e.Location, &e.ParentID, &e.OriginalDate,
			&e.Deleted, &e.CreatedAt, &e.UpdatedAt, &e.LastModified,
		); err != nil {
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}
		e.AllDay = allDayInt != 0
		events = append(events, e)
	}

	middleware.JSONResponse(w, 200, events)
}

func handleGet(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	eventID := chi.URLParam(r, "id")

	e, err := getEvent(eventID, perm.UserID)
	if err == sql.ErrNoRows {
		middleware.JSONResponse(w, 404, apperror.NotFound("Event not found"))
		return
	}
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 200, e)
}

type createRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	StartAt     string  `json:"startAt"`
	EndAt       string  `json:"endAt"`
	AllDay      *bool   `json:"allDay,omitempty"`
	RRule       *string `json:"rrule,omitempty"`
	Color       *string `json:"color,omitempty"`
	Location    *string `json:"location,omitempty"`
}

func handleCreate(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	calendarID := chi.URLParam(r, "calendarId")

	if !perm.IsMember(calendarID) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Access denied"))
		return
	}

	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	if req.Title == "" || len(req.Title) > 500 {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Title is required (max 500 chars)"))
		return
	}
	if req.StartAt == "" || req.EndAt == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("startAt and endAt are required"))
		return
	}
	if req.Color != nil && !validate.HexColor(*req.Color) {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid color format"))
		return
	}

	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()
	allDay := false
	if req.AllDay != nil {
		allDay = *req.AllDay
	}

	allDayInt := boolToInt(allDay)

	_, err := db.DB.Exec(`
		INSERT INTO events (id, calendar_id, title, description, start_at, end_at,
		                    all_day, rrule, color, location, created_at, updated_at, last_modified)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, calendarID, req.Title, req.Description, req.StartAt, req.EndAt,
		allDayInt, req.RRule, req.Color, req.Location, now, now, lmod)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	e, err := getEvent(id, perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	middleware.JSONResponse(w, 201, e)
}

type updateRequest struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	StartAt     *string `json:"startAt,omitempty"`
	EndAt       *string `json:"endAt,omitempty"`
	AllDay      *bool   `json:"allDay,omitempty"`
	RRule       *string `json:"rrule,omitempty"`
	Color       *string `json:"color,omitempty"`
	Location    *string `json:"location,omitempty"`
	Deleted     *bool   `json:"deleted,omitempty"`
}

func handleUpdate(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	eventID := chi.URLParam(r, "id")

	e, err := getEvent(eventID, perm.UserID)
	if err == sql.ErrNoRows {
		middleware.JSONResponse(w, 404, apperror.NotFound("Event not found"))
		return
	}
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	_ = e // used for future role checks

	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	if req.Title != nil && (*req.Title == "" || len(*req.Title) > 500) {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid title"))
		return
	}
	if req.Color != nil && !validate.HexColor(*req.Color) {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid color format"))
		return
	}

	// Build a single UPDATE with all changed columns in a transaction.
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	tx, err := db.DB.Begin()
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer tx.Rollback()

	if req.Title != nil {
		tx.Exec("UPDATE events SET title = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.Title, now, lmod, eventID)
	}
	if req.Description != nil {
		tx.Exec("UPDATE events SET description = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.Description, now, lmod, eventID)
	}
	if req.StartAt != nil {
		tx.Exec("UPDATE events SET start_at = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.StartAt, now, lmod, eventID)
	}
	if req.EndAt != nil {
		tx.Exec("UPDATE events SET end_at = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.EndAt, now, lmod, eventID)
	}
	if req.AllDay != nil {
		tx.Exec("UPDATE events SET all_day = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			boolToInt(*req.AllDay), now, lmod, eventID)
	}
	if req.RRule != nil {
		tx.Exec("UPDATE events SET rrule = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.RRule, now, lmod, eventID)
	}
	if req.Color != nil {
		tx.Exec("UPDATE events SET color = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.Color, now, lmod, eventID)
	}
	if req.Location != nil {
		tx.Exec("UPDATE events SET location = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.Location, now, lmod, eventID)
	}
	if req.Deleted != nil {
		tx.Exec("UPDATE events SET deleted = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			boolToInt(*req.Deleted), now, lmod, eventID)
	}

	if err := tx.Commit(); err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	e, err = getEvent(eventID, perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 200, e)
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	eventID := chi.URLParam(r, "id")

	_, err := getEvent(eventID, perm.UserID)
	if err == sql.ErrNoRows {
		middleware.JSONResponse(w, 404, apperror.NotFound("Event not found"))
		return
	}
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	_, err = db.DB.Exec(
		"UPDATE events SET deleted = 1, updated_at = ?, last_modified = ? WHERE id = ?",
		now, lmod, eventID,
	)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 200, nil)
}

type overrideRequest struct {
	OriginalDate  string  `json:"originalDate"`
	OverrideStart *string `json:"overrideStart,omitempty"`
	OverrideEnd   *string `json:"overrideEnd,omitempty"`
	OverrideTitle *string `json:"overrideTitle,omitempty"`
	Deleted       *bool   `json:"deleted,omitempty"`
}

func handleOverride(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	parentID := chi.URLParam(r, "id")

	// Check access
	_, err := getEvent(parentID, perm.UserID)
	if err == sql.ErrNoRows {
		middleware.JSONResponse(w, 404, apperror.NotFound("Event not found"))
		return
	}
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	var req overrideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.OriginalDate == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("originalDate is required"))
		return
	}

	lmod := time.Now().UnixMilli()
	deleted := false
	if req.Deleted != nil {
		deleted = *req.Deleted
	}

	deletedInt := boolToInt(deleted)

	// Check existing
	var existingID string
	err = db.DB.QueryRow(
		"SELECT id FROM event_overrides WHERE parent_id = ? AND original_date = ?",
		parentID, req.OriginalDate,
	).Scan(&existingID)

	var overrideID string
	if err == nil {
		overrideID = existingID
	} else {
		overrideID = uuid.New().String()
	}

	_, err = db.DB.Exec(`
		INSERT INTO event_overrides (id, parent_id, original_date, override_start, override_end, override_title, deleted, last_modified)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(parent_id, original_date) DO UPDATE SET
			override_start = excluded.override_start,
			override_end = excluded.override_end,
			override_title = excluded.override_title,
			deleted = excluded.deleted,
			last_modified = excluded.last_modified
	`, overrideID, parentID, req.OriginalDate, req.OverrideStart, req.OverrideEnd, req.OverrideTitle, deletedInt, lmod)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 201, nil)
}

// helpers

func getEvent(eventID, userID string) (*Event, error) {
	var e Event
	var allDayInt int
	err := db.DB.QueryRow(`
		SELECT e.id, e.calendar_id, e.title, e.description, e.start_at, e.end_at,
		       e.all_day, e.rrule, e.color, e.location, e.parent_id, e.original_date,
		       e.deleted, e.created_at, e.updated_at, e.last_modified
		FROM events e
		INNER JOIN calendar_members cm ON e.calendar_id = cm.calendar_id
		WHERE e.id = ? AND cm.user_id = ?
	`, eventID, userID).Scan(
		&e.ID, &e.CalendarID, &e.Title, &e.Description,
		&e.StartAt, &e.EndAt, &allDayInt, &e.RRule,
		&e.Color, &e.Location, &e.ParentID, &e.OriginalDate,
		&e.Deleted, &e.CreatedAt, &e.UpdatedAt, &e.LastModified,
	)
	if err != nil {
		return nil, err
	}
	e.AllDay = allDayInt != 0
	return &e, nil
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
