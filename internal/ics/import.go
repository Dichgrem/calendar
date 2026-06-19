package ics

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	ical "github.com/emersion/go-ical"
	"github.com/google/uuid"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/util"
)

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
	logger.Debug("[ics] POST import user=%s", perm.UserID)

	r.Body = http.MaxBytesReader(w, r.Body, maxICSBodyBytes)
	var req importRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.Content == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("content is required"))
		return
	}

	icalCal, err := parseIcsContent(req.Content)
	if err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to parse ICS"))
		return
	}

	events := extractEvents(icalCal)
	if len(events) > maxICSEvents {
		middleware.JSONResponse(w, 413, apperror.BadRequest("Too many events: limit is 5000"))
		return
	}

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
	defer func() { _ = tx.Rollback() }()

	if req.CalendarID != "" {
		if !perm.RequireRole(req.CalendarID, "editor") {
			middleware.JSONResponse(w, 403, apperror.Forbidden("Editor role required"))
			return
		}
		calendarID = req.CalendarID
	} else {
		name := req.CalendarName
		if name == "" {
			name = util.ComponentProp(icalCal.Component, ical.PropName)
		}
		if name == "" {
			name = propText(icalCal.Component, "X-WR-CALNAME")
		}
		if name == "" {
			name = "Imported Calendar"
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

	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	rawVEvents := extractVEventsByUID(req.Content)

	for _, ev := range events {
		uid := util.ComponentProp(ev, ical.PropUID)
		if uid == "" {
			uid = uuid.New().String()
		}
		if !selected[uid] {
			continue
		}

		eventID := uuid.New().String()
		title := util.ComponentProp(ev, ical.PropSummary)
		startAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeStart))
		endAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeEnd))

		rawICS := rawVEvents[uid]
		if rawICS == "" {
			rawICS = serializeEvent(ev)
		}

		desc := util.ComponentProp(ev, ical.PropDescription)
		rruleVal := util.ComponentProp(ev, ical.PropRecurrenceRule)
		loc := util.ComponentProp(ev, ical.PropLocation)

		allDay := 0
		if !strings.Contains(startAt, "T") && !strings.Contains(endAt, "T") {
			allDay = 1
		}

		_, err := tx.Exec(`
			INSERT INTO events (id, calendar_id, title, description, start_at, end_at,
			                    all_day, rrule, color, location, created_at, updated_at, last_modified, raw_ics)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, eventID, calendarID, title, util.StrOrNil(desc), startAt, endAt,
			allDay, util.StrOrNil(rruleVal), nil, util.StrOrNil(loc), now, now, lmod, rawICS)
		if err != nil {
			middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
			return
		}
	}

	if err := tx.Commit(); err != nil {
		logger.Error("[ics] import commit error: %v", err)
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}

	logger.Info("[ics] import cal=%s events=%d", calendarID, len(events))
	middleware.JSONResponse(w, 201, map[string]string{"calendarId": calendarID})
}

// extractVEventsByUID returns a map of UID → raw VEVENT block from ICS content.
func extractVEventsByUID(content string) map[string]string {
	result := make(map[string]string)
	parts := strings.Split(content, "BEGIN:VEVENT")
	for _, part := range parts[1:] {
		endIdx := strings.Index(part, "END:VEVENT")
		if endIdx < 0 {
			continue
		}
		block := "BEGIN:VEVENT" + part[:endIdx+len("END:VEVENT")]
		uidStart := strings.Index(block, "UID:")
		if uidStart < 0 {
			continue
		}
		uidEnd := strings.Index(block[uidStart:], "\r")
		if uidEnd < 0 {
			uidEnd = strings.Index(block[uidStart:], "\n")
		}
		if uidEnd < 0 {
			continue
		}
		uid := strings.TrimSpace(block[uidStart+4 : uidStart+uidEnd])
		if uid != "" {
			result[uid] = block
		}
	}
	return result
}
