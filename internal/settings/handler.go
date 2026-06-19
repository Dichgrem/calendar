package settings

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"calendar/internal/apperror"
	"calendar/internal/config"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/util"
)

// RegisterRoutes adds settings routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Get("/api/settings", handleGet)
	r.Patch("/api/settings", handleUpdate)
}

type UserSettings struct {
	UserID              string `json:"userId"`
	Language            string `json:"language"`
	FirstDayOfWeek      int    `json:"firstDayOfWeek"`
	ShowEventTime       bool   `json:"showEventTime"`
	DateFormat          string `json:"dateFormat"`
	ShowLunarCalendar   bool   `json:"showLunarCalendar"`
	AutoBackupCalendars string `json:"autoBackupCalendars,omitempty"`
	AutoBackupInterval  int    `json:"autoBackupInterval,omitempty"`
}

func handleGet(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)

	settings, err := getSettings(perm.UserID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	middleware.JSONResponse(w, 200, settings)
}

type updateRequest struct {
	Language            *string `json:"language,omitempty"`
	FirstDayOfWeek      *int    `json:"firstDayOfWeek,omitempty"`
	ShowEventTime       *bool   `json:"showEventTime,omitempty"`
	DateFormat          *string `json:"dateFormat,omitempty"`
	ShowLunarCalendar   *bool   `json:"showLunarCalendar,omitempty"`
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

	if req.Language != nil && *req.Language != "zh-CN" && *req.Language != "en" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid language"))
		return
	}
	if req.FirstDayOfWeek != nil && (*req.FirstDayOfWeek < 0 || *req.FirstDayOfWeek > 6) {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid firstDayOfWeek (0-6)"))
		return
	}
	if req.DateFormat != nil && len(*req.DateFormat) > 50 {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid dateFormat"))
		return
	}

	cfg := config.Load()

	// Read existing settings from DB; fall back to config defaults for new users.
	existing, err := getSettings(perm.UserID)
	if err != nil {
		// No existing row — use config defaults as base
		lang := cfg.UserDefaults.Language
		fdow := cfg.UserDefaults.FirstDayOfWeek
		showTime := cfg.UserDefaults.ShowEventTime
		df := cfg.UserDefaults.DateFormat
		showLunar := cfg.UserDefaults.ShowLunarCalendar
		backupCals := ""
		backupInterval := 0

		if req.Language != nil {
			lang = *req.Language
		}
		if req.FirstDayOfWeek != nil {
			fdow = *req.FirstDayOfWeek
		}
		if req.ShowEventTime != nil {
			showTime = *req.ShowEventTime
		}
		if req.DateFormat != nil {
			df = *req.DateFormat
		}
		if req.ShowLunarCalendar != nil {
			showLunar = *req.ShowLunarCalendar
		}
		if req.AutoBackupCalendars != nil {
			backupCals = *req.AutoBackupCalendars
		}
		if req.AutoBackupInterval != nil {
			backupInterval = *req.AutoBackupInterval
		}

		_, err := db.DB.Exec(`
			INSERT INTO user_settings (user_id, language, first_day_of_week, show_event_time, date_format, show_lunar_calendar, auto_backup_calendars, auto_backup_interval_min)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, perm.UserID, lang, fdow, util.BoolToInt(showTime), df, util.BoolToInt(showLunar), backupCals, backupInterval)
		if err != nil {
			logger.Error("[settings] insert user=%s error: %v", perm.UserID, err)
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}
	} else {
		// Existing row — patch on top of DB values, only overriding provided fields
		lang := existing.Language
		fdow := existing.FirstDayOfWeek
		showTime := existing.ShowEventTime
		df := existing.DateFormat
		showLunar := existing.ShowLunarCalendar
		backupCals := existing.AutoBackupCalendars
		backupInterval := existing.AutoBackupInterval

		if req.Language != nil {
			lang = *req.Language
		}
		if req.FirstDayOfWeek != nil {
			fdow = *req.FirstDayOfWeek
		}
		if req.ShowEventTime != nil {
			showTime = *req.ShowEventTime
		}
		if req.DateFormat != nil {
			df = *req.DateFormat
		}
		if req.ShowLunarCalendar != nil {
			showLunar = *req.ShowLunarCalendar
		}
		if req.AutoBackupCalendars != nil {
			backupCals = *req.AutoBackupCalendars
		}
		if req.AutoBackupInterval != nil {
			backupInterval = *req.AutoBackupInterval
		}

		_, err := db.DB.Exec(`
			INSERT INTO user_settings (user_id, language, first_day_of_week, show_event_time, date_format, show_lunar_calendar, auto_backup_calendars, auto_backup_interval_min)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id) DO UPDATE SET
				language = excluded.language,
				first_day_of_week = excluded.first_day_of_week,
				show_event_time = excluded.show_event_time,
				date_format = excluded.date_format,
				show_lunar_calendar = excluded.show_lunar_calendar,
				auto_backup_calendars = excluded.auto_backup_calendars,
				auto_backup_interval_min = excluded.auto_backup_interval_min
		`, perm.UserID, lang, fdow, util.BoolToInt(showTime), df, util.BoolToInt(showLunar), backupCals, backupInterval)
		if err != nil {
			logger.Error("[settings] update user=%s error: %v", perm.UserID, err)
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}
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
	var showTimeInt, showLunarInt int
	err := db.DB.QueryRow(
		`SELECT user_id, language, first_day_of_week, show_event_time, date_format,
		        show_lunar_calendar, COALESCE(auto_backup_calendars,''), COALESCE(auto_backup_interval_min,0)
		 FROM user_settings WHERE user_id = ?`,
		userID,
	).Scan(&s.UserID, &s.Language, &s.FirstDayOfWeek, &showTimeInt, &s.DateFormat,
		&showLunarInt, &s.AutoBackupCalendars, &s.AutoBackupInterval)
	if err != nil {
		return nil, err
	}
	s.ShowEventTime = showTimeInt != 0
	s.ShowLunarCalendar = showLunarInt != 0
	return &s, nil
}
