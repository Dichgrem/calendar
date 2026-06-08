package caldav

import (
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"calendar/internal/db"
	"calendar/internal/ics"
	"calendar/internal/middleware"
)

func getCaldavUser(r *http.Request) string {
	p := middleware.GetPermission(r)
	if p == nil {
		return ""
	}
	return p.UserID
}

// handlePropfindRoot returns principal and calendar-home-set for DAV root.
func handlePropfindRoot(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}

	ms := MultiStatus{
		Responses: []Response{
			{
				Href: "/dav/",
				PropStat: []PropStat{{
					Status: "HTTP/1.1 200 OK",
					Prop: Prop{
						ResourceType: &ResourceType{Collection: &struct{}{}},
						CurrentUserPrincipal: &Href{Inner: "/dav/"},
						CalendarHomeSet:      &Href{Inner: fmt.Sprintf("%s://%s/dav/calendars/", scheme, host)},
					},
				}},
			},
		},
	}

	writeMultistatus(w, ms)
}

// handlePropfind dispatches to calendar list or event list based on path
func handlePropfind(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	// /dav/calendars/ - list all calendars
	if path == "/dav/calendars/" || path == "/dav/calendars" {
		handlePropfindCalendars(w, r)
		return
	}

	// /dav/calendars/:id/ - list events in calendar
	calendarID, filename := parseCalPath(path)
	if filename == "" || strings.HasSuffix(path, "/") {
		handlePropfindEvents(w, r, calendarID)
		return
	}
	// Single event
	handlePropfindSingleEvent(w, r, calendarID, filename)
}

func handlePropfindCalendars(w http.ResponseWriter, r *http.Request) {
	userID := getCaldavUser(r)
	if userID == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	rows, err := db.DB.Query(`
		SELECT c.id, c.name, c.color, c.created_at, c.updated_at, c.last_modified
		FROM calendars c
		INNER JOIN calendar_members cm ON c.id = cm.calendar_id
		WHERE cm.user_id = ? ORDER BY cm.sort_order`, userID)
	if err != nil {
		log.Printf("caldav list calendars: %v", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	defer rows.Close()

	var responses []Response
	for rows.Next() {
		var id, name, color, createdAt, updatedAt string
		var lastModified int64
		if rows.Scan(&id, &name, &color, &createdAt, &updatedAt, &lastModified) != nil {
			continue
		}

		responses = append(responses, Response{
			Href: fmt.Sprintf("/dav/calendars/%s/", id),
			PropStat: []PropStat{{
				Status: "HTTP/1.1 200 OK",
				Prop: Prop{
					ResourceType: &ResourceType{
						Collection: &struct{}{},
						Calendar:   &struct{}{},
					},
					DisplayName: name,
					GetETag:     fmt.Sprintf(`"%d"`, lastModified),
				},
			}},
		})
	}

	ms := MultiStatus{Responses: responses}
	if ms.Responses == nil {
		ms.Responses = []Response{}
	}
	writeMultistatus(w, ms)
}

// handlePropfindEvents lists all events in a calendar (non-deleted, with ICS data).
func handlePropfindEvents(w http.ResponseWriter, r *http.Request, calendarID string) {
	userID := getCaldavUser(r)
	if userID == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var count int
	db.DB.QueryRow("SELECT COUNT(*) FROM calendar_members WHERE calendar_id = ? AND user_id = ?",
		calendarID, userID).Scan(&count)
	if count == 0 {
		http.Error(w, "Not Found", 404)
		return
	}

	rows, err := db.DB.Query(`
		SELECT id, title, description, start_at, end_at, all_day, rrule, location,
		       created_at, updated_at, last_modified, deleted
		FROM events WHERE calendar_id = ? AND deleted = 0`, calendarID)
	if err != nil {
		log.Printf("caldav list events: %v", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}
	defer rows.Close()

	var responses []Response
	for rows.Next() {
		var id, title, startAt, endAt, createdAt, updatedAt string
		var desc, rrule, loc *string
		var allDay, deleted int
		var lastModified int64
		if rows.Scan(&id, &title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt, &updatedAt, &lastModified, &deleted) != nil {
			continue
		}

		ev := buildIcsEvent(id, title, desc, startAt, endAt, rrule, loc, createdAt)
		icsContent := ics.SerializeCalendar("", []ics.IcsEvent{ev})

		responses = append(responses, Response{
			Href: fmt.Sprintf("/dav/calendars/%s/%s.ics", calendarID, id),
			PropStat: []PropStat{{
				Status: "HTTP/1.1 200 OK",
				Prop: Prop{
					DisplayName:     title,
					GetContentType:  "text/calendar; charset=utf-8",
					GetContentLength: int64(len(icsContent)),
					GetETag:          fmt.Sprintf(`"%d"`, lastModified),
					GetLastModified:  updatedAt,
					CalendarData:     &CalendarData{Content: icsContent},
					ResourceType:     &ResourceType{},
				},
			}},
		})
	}

	ms := MultiStatus{Responses: responses}
	if ms.Responses == nil {
		ms.Responses = []Response{}
	}
	writeMultistatus(w, ms)
}

func handlePropfindSingleEvent(w http.ResponseWriter, r *http.Request, calendarID, filename string) {
	userID := getCaldavUser(r)
	if userID == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	eventID := strings.TrimSuffix(filename, ".ics")

	var title, startAt, endAt, createdAt, updatedAt string
	var desc, rrule, loc *string
	var allDay int
	var lastModified int64
	err := db.DB.QueryRow(`
		SELECT e.title, e.description, e.start_at, e.end_at, e.all_day, e.rrule, e.location,
		       e.created_at, e.updated_at, e.last_modified
		FROM events e
		INNER JOIN calendar_members cm ON e.calendar_id = cm.calendar_id
		WHERE e.id = ? AND cm.user_id = ? AND e.deleted = 0`,
		eventID, userID,
	).Scan(&title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt, &updatedAt, &lastModified)
	if err != nil {
		writeMultistatus(w, MultiStatus{Responses: []Response{}})
		return
	}

	ev := buildIcsEvent(eventID, title, desc, startAt, endAt, rrule, loc, createdAt)
	icsContent := ics.SerializeCalendar("", []ics.IcsEvent{ev})

	ms := MultiStatus{
		Responses: []Response{{
			Href: fmt.Sprintf("/dav/calendars/%s/%s.ics", calendarID, eventID),
			PropStat: []PropStat{{
				Status: "HTTP/1.1 200 OK",
				Prop: Prop{
					DisplayName:     title,
					GetContentType:  "text/calendar; charset=utf-8",
					GetContentLength: int64(len(icsContent)),
					GetETag:          fmt.Sprintf(`"%d"`, lastModified),
					CalendarData:     &CalendarData{Content: icsContent},
				},
			}},
		}},
	}
	writeMultistatus(w, ms)
}

// handleReport handles calendar-query REPORT requests.
func handleReport(w http.ResponseWriter, r *http.Request) {
	calendarID, _ := parseCalPath(r.URL.Path)
	handlePropfindEvents(w, r, calendarID)
}

// handleGetEvent returns a single event as ICS
func handleGetEvent(w http.ResponseWriter, r *http.Request) {
	_, filename := parseCalPath(r.URL.Path)
	userID := getCaldavUser(r)
	if userID == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	eventID := strings.TrimSuffix(filename, ".ics")

	var title, startAt, endAt, createdAt string
	var desc, rrule, loc *string
	var allDay int
	err := db.DB.QueryRow(`
		SELECT e.title, e.description, e.start_at, e.end_at, e.all_day, e.rrule, e.location, e.created_at
		FROM events e
		INNER JOIN calendar_members cm ON e.calendar_id = cm.calendar_id
		WHERE e.id = ? AND cm.user_id = ? AND e.deleted = 0`,
		eventID, userID,
	).Scan(&title, &desc, &startAt, &endAt, &allDay, &rrule, &loc, &createdAt)
	if err != nil {
		http.Error(w, "Not Found", 404)
		return
	}

	ev := buildIcsEvent(eventID, title, desc, startAt, endAt, rrule, loc, createdAt)
	icsContent := ics.SerializeCalendar("event", []ics.IcsEvent{ev})
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("ETag", fmt.Sprintf(`"%s-%d"`, eventID, time.Now().Unix()))
	w.WriteHeader(200)
	w.Write([]byte(icsContent))
}

// handlePutEvent creates or updates an event from ICS content
func handlePutEvent(w http.ResponseWriter, r *http.Request) {
	calendarID, filename := parseCalPath(r.URL.Path)
	userID := getCaldavUser(r)
	if userID == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	var count int
	db.DB.QueryRow("SELECT COUNT(*) FROM calendar_members WHERE calendar_id = ? AND user_id = ?",
		calendarID, userID).Scan(&count)
	if count == 0 {
		http.Error(w, "Not Found", 404)
		return
	}

	body, _ := io.ReadAll(r.Body)
	result, err := ics.ParseIcs(string(body))
	if err != nil || len(result.Events) == 0 {
		http.Error(w, "Bad Request: invalid ICS", 400)
		return
	}

	event := result.Events[0]
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	// Look up by the filename UID or the ICS UID
	lookupID := strings.TrimSuffix(filename, ".ics")
	if event.UID != "" {
		lookupID = event.UID
	}

	var existingID string
	db.DB.QueryRow("SELECT id FROM events WHERE id = ? AND calendar_id = ?", lookupID, calendarID).Scan(&existingID)
	if existingID == "" && event.UID != "" {
		db.DB.QueryRow("SELECT id FROM events WHERE id = ? AND calendar_id = ?", event.UID, calendarID).Scan(&existingID)
	}

	allDay := 0
	if len(event.StartAt) == 10 {
		allDay = 1
	}

	if existingID != "" {
		db.DB.Exec(`
			UPDATE events SET title=?, description=?, start_at=?, end_at=?, all_day=?, rrule=?,
			       location=?, updated_at=?, last_modified=?
			WHERE id=?`, event.Title, strOrNil(event.Description), event.StartAt, event.EndAt,
			allDay, strOrNil(event.RRule), strOrNil(event.Location), now, lmod, existingID)
		w.WriteHeader(204)
	} else {
		id := uuid.New().String()
		_, err := db.DB.Exec(`
			INSERT INTO events (id, calendar_id, title, description, start_at, end_at, all_day, rrule,
			                    location, created_at, updated_at, last_modified)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
			id, calendarID, event.Title, strOrNil(event.Description), event.StartAt, event.EndAt,
			allDay, strOrNil(event.RRule), strOrNil(event.Location), now, now, lmod)
		if err != nil {
			log.Printf("caldav PUT create: %v", err)
			http.Error(w, "Internal Server Error", 500)
			return
		}
		w.Header().Set("ETag", fmt.Sprintf(`"%s-%d"`, id, lmod))
		w.WriteHeader(201)
	}
}

// handleDeleteEvent soft-deletes an event
func handleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	calendarID, filename := parseCalPath(r.URL.Path)
	eventID := strings.TrimSuffix(filename, ".ics")

	result, err := db.DB.Exec(`
		UPDATE events SET deleted=1, updated_at=?, last_modified=?
		WHERE id=? AND calendar_id=?`, time.Now().UTC().Format(time.RFC3339), time.Now().UnixMilli(),
		eventID, calendarID)
	if err != nil {
		http.Error(w, "Internal Server Error", 500)
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		http.Error(w, "Not Found", 404)
		return
	}
	w.WriteHeader(204)
}

// handleMkcalendar creates a new calendar
func handleMkcalendar(w http.ResponseWriter, r *http.Request) {
	userID := getCaldavUser(r)
	if userID == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	calendarName := "New Calendar"
	calendarColor := "#3b82f6"

	// Try to parse XML body
	body, _ := io.ReadAll(r.Body)
	type mkcalSet struct {
		Prop struct {
			DisplayName string `xml:"displayname"`
			Color       string `xml:"calendar-color"`
		} `xml:"prop"`
	}
	type mkcalReq struct {
		Set mkcalSet `xml:"set"`
	}
	var req mkcalReq
	if err := xml.Unmarshal(body, &req); err == nil {
		if req.Set.Prop.DisplayName != "" {
			calendarName = req.Set.Prop.DisplayName
		}
		if req.Set.Prop.Color != "" {
			calendarColor = req.Set.Prop.Color
		}
	}

	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	tx, err := db.DB.Begin()
	if err != nil {
		http.Error(w, "Internal Server Error", 500)
		return
	}
	defer tx.Rollback()

	tx.Exec(`INSERT INTO calendars (id, name, color, source_type, owner_id, created_at, updated_at, last_modified) VALUES (?,?,?,?,?,?,?,?)`,
		id, calendarName, calendarColor, "manual", userID, now, now, lmod)
	tx.Exec(`INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?,?,?)`,
		id, userID, "admin")

	if err := tx.Commit(); err != nil {
		log.Printf("caldav MKCALENDAR: %v", err)
		http.Error(w, "Internal Server Error", 500)
		return
	}

	host := r.Host
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	w.Header().Set("Location", fmt.Sprintf("%s://%s/dav/calendars/%s/", scheme, host, id))
	w.WriteHeader(201)
}

// helpers

func parseCalPath(path string) (calendarID, filename string) {
	trimmed := strings.TrimPrefix(path, "/dav/calendars/")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) > 0 {
		calendarID = strings.TrimSuffix(parts[0], "/")
	}
	if len(parts) > 1 && parts[1] != "" {
		filename = parts[1]
	}
	return
}

func buildIcsEvent(id, title string, desc *string, startAt, endAt string, rrule, loc *string, createdAt string) ics.IcsEvent {
	ev := ics.IcsEvent{
		UID:     id + "@calendar",
		Title:   title,
		StartAt: startAt,
		EndAt:   endAt,
		DTStamp: createdAt,
	}
	if desc != nil {
		ev.Description = *desc
	}
	if rrule != nil {
		ev.RRule = *rrule
	}
	if loc != nil {
		ev.Location = *loc
	}
	return ev
}

func writeMultistatus(w http.ResponseWriter, ms MultiStatus) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(207)
	w.Write([]byte(xml.Header))
	enc := xml.NewEncoder(w)
	enc.Indent("", "  ")
	enc.Encode(ms)
}

func strOrNil(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
