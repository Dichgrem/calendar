package caldav

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"calendar/internal/db"
	"calendar/internal/logger"
)

func handlePropfindRoot(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	scheme := requestScheme(r)
	p := prop{
		ResourceType:         &resourceType{Collection: &struct{}{}},
		CurrentUserPrincipal: &hrefEl{Href: "/dav/"},
		CalendarHomeSet:      &hrefEl{Href: fmt.Sprintf("%s://%s/dav/calendars/", scheme, host)},
	}
	ps := propStat{Status: "HTTP/1.1 200 OK", Prop: p}
	resp := response{Href: "/dav/", PropStat: []propStat{ps}}
	ms := multiStatus{Responses: []response{resp}}
	writeXML(w, ms)
}

func handlePropfindCalendars(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromReq(r)
	logger.Info("[caldav] PROPFIND calendars user=%s", userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	rows, err := db.DB.Query(`
		SELECT c.id, c.name, c.last_modified
		FROM calendars c INNER JOIN calendar_members cm ON c.id = cm.calendar_id
		WHERE cm.user_id = ? ORDER BY cm.sort_order`, userID)
	if err != nil {
		http.Error(w, "Internal Server Error", 500)
		return
	}
	defer func() { _ = rows.Close() }()

	var rs []response
	for rows.Next() {
		var id, name string
		var lmod int64
		if rows.Scan(&id, &name, &lmod) != nil {
			continue
		}
		rs = append(rs, response{
			Href: fmt.Sprintf("/dav/calendars/%s/", id),
			PropStat: []propStat{{Status: "HTTP/1.1 200 OK", Prop: prop{
				ResourceType: &resourceType{Collection: &struct{}{}, Calendar: &struct{}{}},
				DisplayName:  name,
				GetETag:      fmt.Sprintf(`"%d"`, lmod),
			}}},
		})
	}
	if rs == nil {
		rs = []response{}
	}
	writeXML(w, multiStatus{Responses: rs})
}

func handlePropfindEvents(w http.ResponseWriter, r *http.Request, calendarID string) {
	userID := userIDFromReq(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var count int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM calendar_members WHERE calendar_id=? AND user_id=?", calendarID, userID).Scan(&count); err != nil {
		logger.Error("[caldav] PROPFIND calendar-members scan error: %v", err)
	}
	if count == 0 {
		http.Error(w, "Not Found", 404)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, title, description, start_at, end_at, all_day, rrule, location, created_at, updated_at, last_modified
		FROM events WHERE calendar_id = ? AND deleted = 0`, calendarID)
	if err != nil {
		http.Error(w, "Internal Server Error", 500)
		return
	}
	defer func() { _ = rows.Close() }()

	var rs []response
	for rows.Next() {
		var id, title, startAt, endAt, createdAt, updatedAt string
		var desc, rrule, loc *string
		var allDay int
		var lmod int64
		if rows.Scan(&id, &title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt, &updatedAt, &lmod) != nil {
			continue
		}

		icalCal := buildCal(title, desc, rrule, loc, startAt, endAt, id, createdAt)
		icsContent := serializeCal(icalCal)

		rs = append(
			rs, response{
				Href: fmt.Sprintf("/dav/calendars/%s/%s.ics", calendarID, id),
				PropStat: []propStat{{Status: "HTTP/1.1 200 OK", Prop: prop{
					DisplayName:      title,
					GetContentType:   "text/calendar; charset=utf-8",
					GetContentLength: int64(len(icsContent)),
					GetETag:          fmt.Sprintf(`"%d"`, lmod),
					GetLastModified:  updatedAt,
					CalendarData:     &calendarData{Content: icsContent},
					ResourceType:     &resourceType{},
				}}},
			},
		)
	}
	if rs == nil {
		rs = []response{}
	}
	logger.Info("[caldav] PROPFIND events cal=%s count=%d", calendarID, len(rs))
	writeXML(w, multiStatus{Responses: rs})
}

func handlePropfindSingle(w http.ResponseWriter, r *http.Request, calendarID, filename string) {
	userID := userIDFromReq(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	eventID := strings.TrimSuffix(filename, ".ics")

	var title, startAt, endAt, createdAt, updatedAt string
	var desc, rrule, loc *string
	var allDay int
	var lmod int64
	err := db.DB.QueryRow(
		`
		SELECT e.title, e.description, e.start_at, e.end_at, e.all_day, e.rrule, e.location, e.created_at, e.updated_at, e.last_modified
		FROM events e INNER JOIN calendar_members cm ON e.calendar_id = cm.calendar_id
		WHERE e.id = ? AND cm.user_id = ? AND e.deleted = 0`, eventID, userID,
	).Scan(&title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt, &updatedAt, &lmod)
	if err != nil {
		writeXML(w, multiStatus{Responses: []response{}})
		return
	}

	icalCal := buildCal(title, desc, rrule, loc, startAt, endAt, eventID, createdAt)
	icsContent := serializeCal(icalCal)

	writeXML(w, multiStatus{Responses: []response{{
		Href: fmt.Sprintf("/dav/calendars/%s/%s.ics", calendarID, eventID),
		PropStat: []propStat{{Status: "HTTP/1.1 200 OK", Prop: prop{
			DisplayName:      title,
			GetContentType:   "text/calendar; charset=utf-8",
			GetContentLength: int64(len(icsContent)),
			GetETag:          fmt.Sprintf(`"%d"`, lmod),
			CalendarData:     &calendarData{Content: icsContent},
		}}},
	}}})
}

func handlePropfind(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/dav/calendars/" || path == "/dav/calendars" {
		handlePropfindCalendars(w, r)
		return
	}
	calID, fn := parseCalPath(path)
	if fn == "" || strings.HasSuffix(path, "/") {
		handlePropfindEvents(w, r, calID)
		return
	}
	handlePropfindSingle(w, r, calID, fn)
}

func handleReport(w http.ResponseWriter, r *http.Request) {
	calID, _ := parseCalPath(r.URL.Path)
	logger.Info("[caldav] REPORT cal=%s", calID)
	handlePropfindEvents(w, r, calID)
}

func handleGetEvent(w http.ResponseWriter, r *http.Request) {
	_, filename := parseCalPath(r.URL.Path)
	userID := userIDFromReq(r)
	logger.Info("[caldav] GET event=%s user=%s", filename, userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	eventID := strings.TrimSuffix(filename, ".ics")

	var title, startAt, endAt, createdAt string
	var desc, rrule, loc *string
	var allDay int
	err := db.DB.QueryRow(
		`
		SELECT e.title, e.description, e.start_at, e.end_at, e.all_day, e.rrule, e.location, e.created_at
		FROM events e INNER JOIN calendar_members cm ON e.calendar_id = cm.calendar_id
		WHERE e.id = ? AND cm.user_id = ? AND e.deleted = 0`, eventID, userID,
	).Scan(&title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt)
	if err != nil {
		http.Error(w, "Not Found", 404)
		return
	}

	icalCal := buildCal(title, desc, rrule, loc, startAt, endAt, eventID, createdAt)
	icsContent := serializeCal(icalCal)
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("ETag", fmt.Sprintf(`"%s-%d"`, eventID, time.Now().Unix()))
	w.WriteHeader(200)
	if _, err := w.Write([]byte(icsContent)); err != nil {
		logger.Error("[caldav] GET write error: %v", err)
	}
}
