package ics

import (
	"bytes"
	"net/http"
	"strings"

	ical "github.com/emersion/go-ical"
	"github.com/go-chi/chi/v5"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/util"
)

func handleExport(w http.ResponseWriter, r *http.Request) {
	perm := middleware.GetPermission(r)
	calendarID := chi.URLParam(r, "calendarId")
	logger.Debug("[ics] GET export cal=%s user=%s", calendarID, perm.UserID)

	if !perm.IsMember(calendarID) {
		middleware.JSONResponse(w, 403, apperror.Forbidden("Access denied"))
		return
	}

	var calName string
	_ = db.DB.QueryRow("SELECT name FROM calendars WHERE id = ?", calendarID).Scan(&calName)

	rows, err := db.DB.Query(`
		SELECT id, title, description, start_at, end_at, all_day, rrule, location, created_at, updated_at, raw_ics
		FROM events WHERE calendar_id = ? AND deleted = 0
	`, calendarID)
	if err != nil {
		middleware.JSONResponse(w, 500, apperror.Internal("Database error"))
		return
	}
	defer func() { _ = rows.Close() }()

	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"calendar.ics\"")
	w.WriteHeader(200)
	writeTo := func(s string) { _, _ = w.Write([]byte(s)) }

	writeTo("BEGIN:VCALENDAR\r\n")
	writeTo("PRODID:-//Calendar//Go//EN\r\n")
	writeTo("VERSION:2.0\r\n")
	if calName != "" {
		writeTo("NAME:" + calName + "\r\n")
	}

	for rows.Next() {
		var id, title, startAt, endAt, createdAt, updatedAt string
		var desc, rrule, loc, rawIcs *string
		var allDay int
		if rows.Scan(&id, &title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt, &updatedAt, &rawIcs) != nil {
			continue
		}

		if rawIcs != nil && *rawIcs != "" {
			block := extractVEventText(*rawIcs)
			if block != "" {
				writeTo(block + "\r\n")
			}
		} else {
			evComp := ical.NewEvent()
			evComp.Props.SetText(ical.PropUID, id)
			evComp.Props.SetText(ical.PropSummary, title)
			if desc != nil {
				evComp.Props.SetText(ical.PropDescription, *desc)
			}
			util.SetDateProp(evComp.Props, ical.PropDateTimeStart, startAt)
			util.SetDateProp(evComp.Props, ical.PropDateTimeEnd, endAt)
			if rrule != nil {
				evComp.Props.SetText(ical.PropRecurrenceRule, *rrule)
			}
			if loc != nil {
				evComp.Props.SetText(ical.PropLocation, *loc)
			}
			util.SetDateProp(evComp.Props, ical.PropDateTimeStamp, createdAt)
			tmpCal := ical.NewCalendar()
			tmpCal.Props.SetText(ical.PropProductID, "-//Calendar//Go//EN")
			tmpCal.Props.SetText(ical.PropVersion, "2.0")
			tmpCal.Children = append(tmpCal.Children, evComp.Component)
			var eb bytes.Buffer
			_ = ical.NewEncoder(&eb).Encode(tmpCal)
			enc := eb.String()
			if first := strings.Index(enc, "BEGIN:VEVENT"); first >= 0 {
				if last := strings.LastIndex(enc, "END:VEVENT"); last >= 0 {
					writeTo(enc[first:last+len("END:VEVENT")] + "\r\n")
				}
			}
		}
	}

	writeTo("END:VCALENDAR\r\n")
}

// extractVEventText returns the raw VEVENT block from a raw_ics string.
func extractVEventText(raw string) string {
	start := strings.Index(raw, "BEGIN:VEVENT")
	end := strings.LastIndex(raw, "END:VEVENT")
	if start < 0 || end < 0 {
		return ""
	}
	return raw[start : end+len("END:VEVENT")]
}
