package calendar

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/validate"
)

// RegisterRoutes adds calendar routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Route("/api/calendars", func(r chi.Router) {
		r.Get("/", handleList)
		r.Post("/", handleCreate)
		r.Get("/{id}", handleGet)
		r.Patch("/{id}", handleUpdate)
		r.Delete("/{id}", handleDelete)
		r.Patch("/reorder", handleReorder)
	})
}

type Calendar struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Color        string  `json:"color"`
	SourceURL    *string `json:"sourceUrl"`
	SourceType   string  `json:"sourceType"`
	OwnerID      string  `json:"ownerId"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
	LastModified int64   `json:"lastModified"`
}

func handleList(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)

	rows, err := db.DB.Query(`
		SELECT c.id, c.name, c.color, c.source_url, c.source_type, c.owner_id,
		       c.created_at, c.updated_at, c.last_modified
		FROM calendars c
		INNER JOIN calendar_members cm ON c.id = cm.calendar_id
		WHERE cm.user_id = ?
		ORDER BY cm.sort_order ASC
	`, perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer rows.Close()

	calendars := []Calendar{}
	for rows.Next() {
		var c Calendar
		if err := rows.Scan(
			&c.ID, &c.Name, &c.Color, &c.SourceURL, &c.SourceType, &c.OwnerID,
			&c.CreatedAt, &c.UpdatedAt, &c.LastModified,
		); err != nil {
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}
		calendars = append(calendars, c)
	}

	middleware.JSONResponse(w, 200, calendars)
}

func handleGet(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	id := chi.URLParam(r, "id")

	c, err := getCalendar(id, perm.UserID)
	if err == sql.ErrNoRows {
		middleware.JSONResponse(w, 404, apperror.NotFound("Calendar not found"))
		return
	}
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 200, c)
}

type createRequest struct {
	Name      string  `json:"name"`
	Color     *string `json:"color,omitempty"`
	SourceURL *string `json:"sourceUrl,omitempty"`
}

func handleCreate(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	logger.Debug("[calendar] POST user=%s", perm.UserID)

	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	if req.Name == "" || len(req.Name) > 200 {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Name is required (max 200 chars)"))
		return
	}
	if req.Color != nil && !validate.HexColor(*req.Color) {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid color format"))
		return
	}

	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()
	color := "#3b82f6"
	if req.Color != nil {
		color = *req.Color
	}

	sourceType := "manual"
	sourceURL := req.SourceURL
	if sourceURL != nil {
		sourceType = "ics_subscription"
	}

	tx, err := db.DB.Begin()
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(
		`INSERT INTO calendars (id, name, color, source_url, source_type, owner_id, created_at, updated_at, last_modified)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, req.Name, color, sourceURL, sourceType, perm.UserID, now, now, lmod,
	)
	if err != nil {
		logger.Error("[calendar] create name=%q error: %v", req.Name, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	_, err = tx.Exec(
		"INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)",
		id, perm.UserID, "admin",
	)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	if err := tx.Commit(); err != nil {
		logger.Error("[calendar] create name=%q commit error: %v", req.Name, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	logger.Info("[calendar] create id=%s name=%q", id, req.Name)
	c, err := getCalendar(id, perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 201, c)
}

type updateRequest struct {
	Name      *string `json:"name,omitempty"`
	Color     *string `json:"color,omitempty"`
	SourceURL *string `json:"sourceUrl,omitempty"`
}

func handleUpdate(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	id := chi.URLParam(r, "id")
	logger.Debug("[calendar] PATCH id=%s user=%s", id, perm.UserID)

	if !perm.RequireRole(id, "editor") {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Access denied"))
		return
	}

	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	if req.Name != nil && (*req.Name == "" || len(*req.Name) > 200) {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid name"))
		return
	}
	if req.Color != nil && !validate.HexColor(*req.Color) {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid color format"))
		return
	}

	// Use a transaction so updates are atomic.
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	tx, err := db.DB.Begin()
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer tx.Rollback()

	if req.Name != nil {
		tx.Exec("UPDATE calendars SET name = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.Name, now, lmod, id)
	}
	if req.Color != nil {
		tx.Exec("UPDATE calendars SET color = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.Color, now, lmod, id)
	}
	if req.SourceURL != nil {
		tx.Exec("UPDATE calendars SET source_url = ?, updated_at = ?, last_modified = ? WHERE id = ?",
			*req.SourceURL, now, lmod, id)
	}

	if err := tx.Commit(); err != nil {
		logger.Error("[calendar] update id=%s commit error: %v", id, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	logger.Info("[calendar] update id=%s success", id)

	c, err := getCalendar(id, perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 200, c)
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	id := chi.URLParam(r, "id")
	logger.Debug("[calendar] DELETE id=%s user=%s", id, perm.UserID)

	if !perm.RequireRole(id, "admin") {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Access denied"))
		return
	}

	res, err := db.DB.Exec("DELETE FROM calendars WHERE id = ?", id)
	if err != nil {
		logger.Error("[calendar] delete id=%s error: %v", id, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		logger.Info("[calendar] delete id=%s not found", id)
		middleware.JSONResponse(w, 404, apperror.NotFound("Calendar not found"))
		return
	}

	logger.Info("[calendar] delete id=%s success", id)
	middleware.JSONResponse(w, 200, nil)
}

type reorderRequest struct {
	OrderedIDs []string `json:"orderedIds"`
}

func handleReorder(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)

	var req reorderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	// Run reorder in a transaction for atomicity.
	tx, err := db.DB.Begin()
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer tx.Rollback()

	for i, calID := range req.OrderedIDs {
		tx.Exec(
			"UPDATE calendar_members SET sort_order = ? WHERE calendar_id = ? AND user_id = ?",
			i, calID, perm.UserID,
		)
	}

	if err := tx.Commit(); err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 200, nil)
}

// helpers

func getCalendar(calendarID, userID string) (*Calendar, error) {
	var c Calendar
	err := db.DB.QueryRow(`
		SELECT c.id, c.name, c.color, c.source_url, c.source_type, c.owner_id,
		       c.created_at, c.updated_at, c.last_modified
		FROM calendars c
		INNER JOIN calendar_members cm ON c.id = cm.calendar_id
		WHERE c.id = ? AND cm.user_id = ?
	`, calendarID, userID).Scan(
		&c.ID, &c.Name, &c.Color, &c.SourceURL, &c.SourceType, &c.OwnerID,
		&c.CreatedAt, &c.UpdatedAt, &c.LastModified,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}
