package caldav

import (
	"bytes"
	"encoding/xml"
	"fmt"
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
)

func requestScheme(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	if r.Header.Get("X-Forwarded-Proto") == "https" {
		return "https"
	}
	return "http"
}

func userIDFromReq(r *http.Request) string {
	p := middleware.GetPermission(r)
	if p == nil {
		return ""
	}
	return p.UserID
}

// --- PROPFIND handlers ---

func handlePropfindRoot(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	scheme := requestScheme(r)
	ms := multiStatus{Responses: []response{{
		Href: "/dav/",
		PropStat: []propStat{{Status: "HTTP/1.1 200 OK", Prop: prop{
			ResourceType:         &resourceType{Collection: &struct{}{}},
			CurrentUserPrincipal: &hrefEl{Href: "/dav/"},
			CalendarHomeSet:      &hrefEl{Href: fmt.Sprintf("%s://%s/dav/calendars/", scheme, host)},
		}}},
	}}}
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

		rs = append(rs, response{
			Href: fmt.Sprintf("/dav/calendars/%s/%s.ics", calendarID, id),
			PropStat: []propStat{{Status: "HTTP/1.1 200 OK", Prop: prop{
				DisplayName:      title,
				GetContentType:   "text/calendar; charset=utf-8",
				GetContentLength: int64(len(icsContent)),
				GetETag:          fmt.Sprintf(`"%d"`, lmod),
				GetLastModified:  updatedAt,
				CalendarData:     &calendarData{Content: icsContent},
				ResourceType:     &resourceType{},
			}}}},
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
	err := db.DB.QueryRow(`
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

// --- Other DAV handlers ---

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
	err := db.DB.QueryRow(`
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

func handlePutEvent(w http.ResponseWriter, r *http.Request) {
	calID, filename := parseCalPath(r.URL.Path)
	userID := userIDFromReq(r)
	logger.Info("[caldav] PUT %s user=%s", r.URL.Path, userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var count int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM calendar_members WHERE calendar_id=? AND user_id=?", calID, userID).Scan(&count); err != nil {
		logger.Error("[caldav] DELETE calendar-members scan error: %v", err)
	}
	if count == 0 {
		logger.Error("[caldav] PUT %s: calendar not found", r.URL.Path)
		http.Error(w, "Not Found", 404)
		return
	}

	body, _ := io.ReadAll(r.Body)
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

	evTitle := compProp(ev, ical.PropSummary)
	evStartAt := ics.NormalizeICSDate(compProp(ev, ical.PropDateTimeStart))
	evEndAt := ics.NormalizeICSDate(compProp(ev, ical.PropDateTimeEnd))
	evUID := compProp(ev, ical.PropUID)
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	lookupID := strings.TrimSuffix(filename, ".ics")
	if evUID != "" {
		lookupID = evUID
	}
	// DAVx5 may have cached old ICS with "@calendar" UID suffix.
	// Strip it so the lookup matches the DB id (a clean UUID).
	lookupID = strings.TrimSuffix(lookupID, "@calendar")
	lookupID = strings.TrimSuffix(lookupID, "@calendar@calendar")

	var existingID string
	_ = db.DB.QueryRow("SELECT id FROM events WHERE id=? AND calendar_id=?", lookupID, calID).Scan(&existingID)

	allDay := 0
	if !strings.Contains(evStartAt, "T") {
		allDay = 1
	}

	if existingID != "" {
		_, err := db.DB.Exec(`UPDATE events SET title=?, description=?, start_at=?, end_at=?, all_day=?, rrule=?, location=?, updated_at=?, last_modified=? WHERE id=?`,
			evTitle, strOrNil(compProp(ev, ical.PropDescription)), evStartAt, evEndAt, allDay, strOrNil(compProp(ev, ical.PropRecurrenceRule)), strOrNil(compProp(ev, ical.PropLocation)), now, lmod, existingID)
		if err != nil {
			logger.Error("[caldav] PUT %s UPDATE error: %v", r.URL.Path, err)
			http.Error(w, "Internal Server Error", 500)
			return
		}
		logger.Info("[caldav] PUT %s UPDATED uid=%s title=%q start=%s", r.URL.Path, existingID, evTitle, evStartAt)
	} else {
		// Use server-generated UUID if client-provided ID is not a valid UUID
		id := lookupID
		if _, err := uuid.Parse(lookupID); err != nil {
			id = uuid.New().String()
		}
		_, err := db.DB.Exec(`INSERT INTO events (id, calendar_id, title, description, start_at, end_at, all_day, rrule, location, created_at, updated_at, last_modified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
			id, calID, evTitle, strOrNil(compProp(ev, ical.PropDescription)), evStartAt, evEndAt, allDay, strOrNil(compProp(ev, ical.PropRecurrenceRule)), strOrNil(compProp(ev, ical.PropLocation)), now, now, lmod)
		if err != nil {
			logger.Error("[caldav] PUT %s INSERT error: %v", r.URL.Path, err)
			http.Error(w, "Internal Server Error", 500)
			return
		}
		logger.Info("[caldav] PUT %s CREATED uid=%s title=%q start=%s", r.URL.Path, lookupID, evTitle, evStartAt)
	}
	w.WriteHeader(204)
}

func handleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	calID, filename := parseCalPath(r.URL.Path)
	eventID := strings.TrimSuffix(filename, ".ics")
	userID := userIDFromReq(r)
	logger.Info("[caldav] DELETE %s cal=%s uid=%s user=%s", r.URL.Path, calID, eventID, userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var count int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM calendar_members WHERE calendar_id=? AND user_id=?", calID, userID).Scan(&count); err != nil || count == 0 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	res, _ := db.DB.Exec(`UPDATE events SET deleted=1, updated_at=?, last_modified=? WHERE id=? AND calendar_id=?`,
		time.Now().UTC().Format(time.RFC3339), time.Now().UnixMilli(), eventID, calID)
	affected, _ := res.RowsAffected()
	if affected == 0 {
		logger.Info("[caldav] DELETE %s: not found", r.URL.Path)
		http.Error(w, "Not Found", 404)
		return
	}
	w.WriteHeader(204)
}

func handleMkcalendar(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromReq(r)
	logger.Info("[caldav] MKCALENDAR user=%s", userID)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	name := "New Calendar"
	color := "#3b82f6"
	body, _ := io.ReadAll(r.Body)
	type mkcalS struct {
		Set struct {
			Prop struct {
				DisplayName string `xml:"displayname"`
				Color       string `xml:"calendar-color"`
			} `xml:"prop"`
		} `xml:"set"`
	}
	var req mkcalS
	if xml.Unmarshal(body, &req) == nil {
		if req.Set.Prop.DisplayName != "" {
			name = req.Set.Prop.DisplayName
		}
		if req.Set.Prop.Color != "" {
			color = req.Set.Prop.Color
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
	defer func() { _ = tx.Rollback() }()
	_, _ = tx.Exec(`INSERT INTO calendars (id, name, color, source_type, owner_id, created_at, updated_at, last_modified) VALUES (?,?,?,?,?,?,?,?)`, id, name, color, "manual", userID, now, now, lmod)
	_, _ = tx.Exec(`INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?,?,?)`, id, userID, "admin")
	if tx.Commit() != nil {
		http.Error(w, "Internal Server Error", 500)
		return
	}

	host := r.Host
	scheme := requestScheme(r)
	w.Header().Set("Location", fmt.Sprintf("%s://%s/dav/calendars/%s/", scheme, host, id))
	logger.Info("[caldav] MKCALENDAR created id=%s name=%q", id, name)
	w.WriteHeader(201)
}

// --- XML types (no XMLName conflicts) ---

type multiStatus struct {
	XMLName   xml.Name   `xml:"DAV: multistatus"`
	Responses []response `xml:"response"`
}
type response struct {
	Href     string     `xml:"href"`
	PropStat []propStat `xml:"propstat"`
}
type propStat struct {
	Prop   prop   `xml:"prop"`
	Status string `xml:"status"`
}
type prop struct {
	ResourceType     *resourceType `xml:"resourcetype,omitempty"`
	DisplayName      string        `xml:"displayname,omitempty"`
	GetContentType   string        `xml:"getcontenttype,omitempty"`
	GetETag          string        `xml:"getetag,omitempty"`
	GetContentLength int64         `xml:"getcontentlength,omitempty"`
	GetLastModified  string        `xml:"getlastmodified,omitempty"`

	CurrentUserPrincipal *hrefEl       `xml:"current-user-principal,omitempty"`
	CalendarHomeSet      *hrefEl       `xml:"urn:ietf:params:xml:ns:caldav calendar-home-set,omitempty"`
	CalendarData         *calendarData `xml:"urn:ietf:params:xml:ns:caldav calendar-data,omitempty"`
}
type resourceType struct {
	Collection *struct{} `xml:"collection,omitempty"`
	Calendar   *struct{} `xml:"urn:ietf:params:xml:ns:caldav calendar,omitempty"`
}
type hrefEl struct {
	Href string `xml:"DAV: href"`
}
type calendarData struct {
	Content string `xml:",chardata"`
}

// --- helpers ---

func parseCalPath(path string) (calID, fn string) {
	t := strings.TrimPrefix(path, "/dav/calendars/")
	parts := strings.SplitN(t, "/", 2)
	if len(parts) > 0 {
		calID = strings.TrimSuffix(parts[0], "/")
	}
	if len(parts) > 1 && parts[1] != "" {
		fn = parts[1]
	}
	return
}

func buildCal(title string, desc, rrule, loc *string, startAt, endAt, uid, dtstamp string) *ical.Calendar {
	cal := ical.NewCalendar()
	cal.Props.SetText(ical.PropProductID, "-//Calendar//Go//EN")
	cal.Props.SetText(ical.PropVersion, "2.0")
	ev := ical.NewEvent()
	ev.Props.SetText(ical.PropUID, uid)
	ev.Props.SetText(ical.PropSummary, title)
	if desc != nil {
		ev.Props.SetText(ical.PropDescription, *desc)
	}
	if rrule != nil {
		ev.Props.SetText(ical.PropRecurrenceRule, *rrule)
	}
	if loc != nil {
		ev.Props.SetText(ical.PropLocation, *loc)
	}
	setDateProp(ev.Props, ical.PropDateTimeStart, startAt)
	setDateProp(ev.Props, ical.PropDateTimeEnd, endAt)
	if dtstamp != "" {
		setDateProp(ev.Props, ical.PropDateTimeStamp, dtstamp)
	}
	cal.Children = append(cal.Children, ev.Component)
	return cal
}

// setDateProp sets a date property, auto-detecting all-day vs datetime.
func setDateProp(props ical.Props, name, value string) {
	if value == "" {
		return
	}
	// ICS raw date: YYYYMMDD
	if len(value) == 8 {
		t, err := time.Parse("20060102", value)
		if err != nil {
			props.SetText(name, value)
			return
		}
		props.SetDate(name, t)
		return
	}
	// ICS raw datetime: YYYYMMDDTHHMMSS[Z] — PUT/Fossify store these
	if len(value) == 15 || len(value) == 16 {
		s := value[0:4] + "-" + value[4:6] + "-" + value[6:8] + "T" +
			value[9:11] + ":" + value[11:13] + ":" + value[13:15]
		if len(value) == 16 && value[15] == 'Z' {
			s += "Z"
		}
		// Try with Z first, then without
		t, err := time.Parse(time.RFC3339, s+"Z")
		if err != nil {
			t, err = time.Parse("2006-01-02T15:04:05", s)
		}
		if err != nil {
			props.SetText(name, value)
			return
		}
		props.SetDateTime(name, t)
		return
	}
	// ISO date: YYYY-MM-DD
	if len(value) == 10 {
		t, _ := time.Parse("2006-01-02", value)
		props.SetDate(name, t)
	} else {
		t, err := time.Parse(time.RFC3339, value)
		if err != nil {
			t, err = time.Parse("2006-01-02T15:04:05Z", value)
		}
		if err != nil {
			t, _ = time.Parse("2006-01-02T15:04:05", value)
		}
		if t.IsZero() {
			props.SetText(name, value)
			return
		}
		props.SetDateTime(name, t)
	}
}

func serializeCal(cal *ical.Calendar) string {
	var buf bytes.Buffer
	if err := ical.NewEncoder(&buf).Encode(cal); err != nil {
		logger.Error("[caldav] PROPFIND encode error: %v", err)
	}
	return buf.String()
}

func calendarEvents(cal *ical.Calendar) []*ical.Component {
	var evs []*ical.Component
	for _, c := range cal.Children {
		if c.Name == ical.CompEvent {
			evs = append(evs, c)
		}
	}
	return evs
}

func compProp(c *ical.Component, name string) string {
	s, _ := c.Props.Text(name)
	if s == "" {
		vals := c.Props.Values(name)
		if len(vals) > 0 && vals[0].Value != "" {
			return vals[0].Value
		}
	}
	return s
}

func writeXML(w http.ResponseWriter, ms multiStatus) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(207)
	if _, err := w.Write([]byte(xml.Header)); err != nil {
		logger.Error("[caldav] PROPFIND write header error: %v", err)
		return
	}
	b, _ := xml.MarshalIndent(ms, "", "  ")
	if _, err := w.Write(b); err != nil {
		logger.Error("[caldav] PROPFIND write body error: %v", err)
	}
}

func strOrNil(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
