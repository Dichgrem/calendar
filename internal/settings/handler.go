package settings

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
)

// RegisterRoutes adds settings routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Get("/api/settings", handleGet)
	r.Patch("/api/settings", handleUpdate)
}

type UserSettings struct {
	UserID              string `json:"userId"`
	AutoBackupCalendars string `json:"autoBackupCalendars,omitempty"`
	AutoBackupInterval  int    `json:"autoBackupInterval,omitempty"`
}

func handleGet(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)

	settings, err := getSettings(perm.UserID)
	if err != nil {
		// No settings row yet — return defaults
		middleware.JSONResponse(w, 200, &UserSettings{UserID: perm.UserID})
		return
	}

	middleware.JSONResponse(w, 200, settings)
}

type updateRequest struct {
	AutoBackupCalendars *string `json:"autoBackupCalendars,omitempty"`
	AutoBackupInterval  *int    `json:"autoBackupInterval,omitempty"`
}

func handleUpdate(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	logger.Debug("[settings] PATCH /api/settings user=%s", perm.UserID)

	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}

	backupCals := ""
	backupInterval := 0
	existing, err := getSettings(perm.UserID)
	if err == nil {
		backupCals = existing.AutoBackupCalendars
		backupInterval = existing.AutoBackupInterval
	}
	if req.AutoBackupCalendars != nil {
		backupCals = *req.AutoBackupCalendars
	}
	if req.AutoBackupInterval != nil {
		backupInterval = *req.AutoBackupInterval
	}

	_, err = db.DB.Exec(
		`INSERT INTO user_settings (user_id, auto_backup_calendars, auto_backup_interval_min)
		 VALUES (?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		     auto_backup_calendars = excluded.auto_backup_calendars,
		     auto_backup_interval_min = excluded.auto_backup_interval_min`,
		perm.UserID, backupCals, backupInterval,
	)
	if err != nil {
		logger.Error("[settings] upsert user=%s error: %v", perm.UserID, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	settings, err := getSettings(perm.UserID)
	if err != nil {
		logger.Error("[settings] get after update user=%s error: %v", perm.UserID, err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	logger.Info("[settings] update user=%s success", perm.UserID)
	middleware.JSONResponse(w, 200, settings)
}

func getSettings(userID string) (*UserSettings, error) {
	var s UserSettings
	err := db.DB.QueryRow(
		`SELECT user_id, COALESCE(auto_backup_calendars,''), COALESCE(auto_backup_interval_min,0)
		 FROM user_settings WHERE user_id = ?`,
		userID,
	).Scan(&s.UserID, &s.AutoBackupCalendars, &s.AutoBackupInterval)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
