package caldav

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"time"

	ical "github.com/emersion/go-ical"
	"github.com/google/uuid"

	"calendar/internal/db"
	"calendar/internal/ics"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/util"
)

func handlePutEvent(w http.ResponseWriter, r *http.Request) {
	calID, filename := parseCalPath(r.URL.Path)
	userID := userIDFromReq(r)
	perm := middleware.GetPermission(r)
	logger.Info("[caldav] PUT %s user=%s", r.URL.Path, userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if !perm.RequireRole(calID, "editor") {
		logger.Error("[caldav] PUT %s: editor role required", r.URL.Path)
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 10<<20))
	if err != nil {
		logger.Info("[caldav] PUT %s: body too large", r.URL.Path)
		http.Error(w, "Request Entity Too Large", http.StatusRequestEntityTooLarge)
		return
	}
	icalCal, err := ical.NewDecoder(bytes.NewReader(body)).Decode()
	if err != nil || len(icalCal.Children) == 0 {
		logger.Info("[caldav] PUT %s: invalid ICS body", r.URL.Path)
		http.Error(w, "Bad Request: invalid ICS", 400)
		return
	}

	events := calendarEvents(icalCal)
	if len(events) == 0 {
		logger.Info("[caldav] PUT %s: no VEVENT found", r.URL.Path)
		http.Error(w, "Bad Request: no VEVENT", 400)
		return
	}
	ev := events[0]

	evTitle := util.ComponentProp(ev, ical.PropSummary)
	// Extract TZID parameter for timezone-aware conversion
	evDTStart := ev.Props.Get(ical.PropDateTimeStart)
	tzid := ""
	if evDTStart != nil {
		tzid = evDTStart.Params.Get(ical.PropTimezoneID)
	}
	evStartAt := ics.NormalizeICSDateWithTZID(util.ComponentProp(ev, ical.PropDateTimeStart), tzid)
	evEndAt := ics.NormalizeICSDateWithTZID(util.ComponentProp(ev, ical.PropDateTimeEnd), tzid)
	evUID := util.ComponentProp(ev, ical.PropUID)
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	lookupID := strings.TrimSuffix(filename, ".ics")
	if evUID != "" {
		lookupID = evUID
	}
	lookupID = strings.TrimSuffix(lookupID, "@calendar")
	lookupID = strings.TrimSuffix(lookupID, "@calendar@calendar")

	var existingID string
	_ = db.DB.QueryRow("SELECT id FROM events WHERE id=? AND calendar_id=?", lookupID, calID).Scan(&existingID)

	allDay := 0
	if !strings.Contains(evStartAt, "T") {
		allDay = 1
	}

	rawICS := string(body)
	if existingID != "" {
		_, err := db.DB.Exec(`UPDATE events SET title=?, description=?, start_at=?, end_at=?, all_day=?, rrule=?, location=?, raw_ics=?, updated_at=?, last_modified=? WHERE id=?`,
			evTitle, util.StrOrNil(util.ComponentProp(ev, ical.PropDescription)), evStartAt, evEndAt, allDay, util.StrOrNil(util.ComponentProp(ev, ical.PropRecurrenceRule)), util.StrOrNil(util.ComponentProp(ev, ical.PropLocation)), rawICS, now, lmod, existingID)
		if err != nil {
			logger.Error("[caldav] PUT %s UPDATE error: %v", r.URL.Path, err)
			http.Error(w, "Internal Server Error", 500)
			return
		}
		logger.Info("[caldav] PUT %s UPDATED uid=%s title=%q start=%s", r.URL.Path, existingID, evTitle, evStartAt)
	} else {
		id := lookupID
		if _, err := uuid.Parse(lookupID); err != nil {
			id = uuid.New().String()
		}
		_, err := db.DB.Exec(`INSERT INTO events (id, calendar_id, title, description, start_at, end_at, all_day, rrule, location, raw_ics, created_at, updated_at, last_modified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			id, calID, evTitle, util.StrOrNil(util.ComponentProp(ev, ical.PropDescription)), evStartAt, evEndAt, allDay, util.StrOrNil(util.ComponentProp(ev, ical.PropRecurrenceRule)), util.StrOrNil(util.ComponentProp(ev, ical.PropLocation)), rawICS, now, now, lmod)
		if err != nil {
			logger.Error("[caldav] PUT %s INSERT error: %v", r.URL.Path, err)
			http.Error(w, "Internal Server Error", 500)
			return
		}
		logger.Info("[caldav] PUT %s CREATED uid=%s title=%q start=%s", r.URL.Path, lookupID, evTitle, evStartAt)
	}
	w.WriteHeader(204)
}
