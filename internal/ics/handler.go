package ics

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	ical "github.com/emersion/go-ical"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"calendar/internal/apperror"
	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/util"
)

const (
	maxICSBodyBytes = 10 << 20 // 10 MB
	maxICSEvents    = 5000
)

// RegisterRoutes adds ICS import/export routes to a chi router.
func RegisterRoutes(r chi.Router) {
	r.Post("/api/ics/preview", handlePreview)
	r.Post("/api/ics/fetch-url", handleFetchURL)
	r.Post("/api/ics/import", handleImport)
	r.Get("/api/calendars/{calendarId}/ics/export", handleExport)
}

type PreviewItem struct {
	Type     string `json:"type"`
	UID      string `json:"uid"`
	Title    string `json:"title"`
	StartAt  string `json:"startAt"`
	EndAt    string `json:"endAt"`
	RRule    string `json:"rrule"`
	Selected bool   `json:"selected"`
}

type previewResponse struct {
	Name       string        `json:"name"`
	EventCount int           `json:"eventCount"`
	TimeSpan   *timeSpanData `json:"timeSpan"`
	Items      []PreviewItem `json:"items"`
}

type timeSpanData struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func parseIcsContent(content string) (*ical.Calendar, error) {
	return ical.NewDecoder(strings.NewReader(content)).Decode()
}

func extractEvents(cal *ical.Calendar) []*ical.Component {
	var events []*ical.Component
	for _, c := range cal.Children {
		if c.Name == ical.CompEvent {
			events = append(events, c)
		}
	}
	return events
}

func capEvents(events []*ical.Component) []*ical.Component {
	if len(events) > maxICSEvents {
		return events[:maxICSEvents]
	}
	return events
}

// NormalizeICSDate converts ICS raw datetime to ISO 8601 for storage.
// Handles: "20240101" → "2024-01-01", "20240101T090000Z" → "2024-01-01T09:00:00Z"
func NormalizeICSDate(raw string) string {
	return normalizeICSDate(raw)
}

// normalizeICSDate converts ICS raw datetime to ISO 8601 for storage.
// All timed values are stored with Z suffix (UTC) per CalDAV best practice.
func normalizeICSDate(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) == 8 {
		// DATE: YYYYMMDD → YYYY-MM-DD
		return raw[0:4] + "-" + raw[4:6] + "-" + raw[6:8]
	}
	if len(raw) >= 15 {
		// DATE-TIME: YYYYMMDDTHHMMSS[Z] → YYYY-MM-DDTHH:MM:SSZ
		result := raw[0:4] + "-" + raw[4:6] + "-" + raw[6:8] + "T" +
			raw[9:11] + ":" + raw[11:13] + ":" + raw[13:15]
		if len(raw) == 16 && raw[15] == 'Z' {
			result += "Z"
		} else {
			result += "Z" // floating time → UTC
		}
		return result
	}
	return raw
}

func handlePreview(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxICSBodyBytes)
	var req struct {
		Content string `json:"content"`
	}
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
		logger.Error("[ics] preview parse error: %v", err)
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to parse ICS"))
		return
	}

	// Calendar name from X-WR-CALNAME or NAME
	calName := util.ComponentProp(icalCal.Component, ical.PropName)
	if calName == "" {
		calName = propText(icalCal.Component, "X-WR-CALNAME")
	}
	if calName == "" {
		calName = "Imported Calendar"
	}

	events := capEvents(extractEvents(icalCal))
	items := make([]PreviewItem, 0, len(events))
	var earliest, latest string
	for _, ev := range events {
		uid := util.ComponentProp(ev, ical.PropUID)
		title := util.ComponentProp(ev, ical.PropSummary)
		startAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeStart))
		endAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeEnd))
		rruleVal := util.ComponentProp(ev, ical.PropRecurrenceRule)

		items = append(items, PreviewItem{
			Type:     "event",
			UID:      uid,
			Title:    title,
			StartAt:  startAt,
			EndAt:    endAt,
			RRule:    rruleVal,
			Selected: true,
		})

		if startAt != "" && (earliest == "" || startAt < earliest) {
			earliest = startAt
		}
		if endAt != "" && (latest == "" || endAt > latest) {
			latest = endAt
		}
	}

	resp := previewResponse{
		Name:       calName,
		EventCount: len(events),
		Items:      items,
	}
	if earliest != "" || latest != "" {
		resp.TimeSpan = &timeSpanData{From: earliest, To: latest}
	}

	middleware.JSONResponse(w, 200, resp)
}

func handleFetchURL(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxICSBodyBytes)
	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.JSONResponse(w, 400, apperror.BadRequest("Invalid JSON"))
		return
	}
	if req.URL == "" {
		middleware.JSONResponse(w, 400, apperror.BadRequest("url is required"))
		return
	}

	content, err := fetchIcsFromURL(req.URL)
	if err != nil {
		logger.Error("[ics] fetch-url error: %v", err)
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to fetch ICS"))
		return
	}

	icalCal, err := parseIcsContent(content)
	if err != nil {
		logger.Error("[ics] fetch-url parse error: %v", err)
		middleware.JSONResponse(w, 400, apperror.BadRequest("Failed to parse ICS"))
		return
	}

	calName := util.ComponentProp(icalCal.Component, ical.PropName)
	if calName == "" {
		calName = propText(icalCal.Component, "X-WR-CALNAME")
	}
	if calName == "" {
		calName = "Imported Calendar"
	}

	events := capEvents(extractEvents(icalCal))
	items := make([]PreviewItem, 0, len(events))
	var earliest, latest string
	for _, ev := range events {
		uid := util.ComponentProp(ev, ical.PropUID)
		title := util.ComponentProp(ev, ical.PropSummary)
		startAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeStart))
		endAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeEnd))
		rruleVal := util.ComponentProp(ev, ical.PropRecurrenceRule)

		items = append(items, PreviewItem{
			Type:     "event",
			UID:      uid,
			Title:    title,
			StartAt:  startAt,
			EndAt:    endAt,
			RRule:    rruleVal,
			Selected: true,
		})
		if startAt != "" && (earliest == "" || startAt < earliest) {
			earliest = startAt
		}
		if endAt != "" && (latest == "" || endAt > latest) {
			latest = endAt
		}
	}

	preview := previewResponse{
		Name:       calName,
		EventCount: len(events),
		Items:      items,
	}
	if earliest != "" || latest != "" {
		preview.TimeSpan = &timeSpanData{From: earliest, To: latest}
	}

	middleware.JSONResponse(w, 200, map[string]interface{}{
		"preview": preview,
		"content": content,
	})
}

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

	// Pre-extract raw VEVENT blocks from the ICS content, keyed by UID.
	// This preserves all original properties (VALARM, X-FOSSIFY-*, etc.)
	// for faithful re-export.
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

	// Stream ICS output: header → events → footer
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
			// Encode single event via temporary calendar, strip wrapper
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

// extractVEventsByUID returns a map of UID → raw VEVENT block from ICS content.
func extractVEventsByUID(content string) map[string]string {
	result := make(map[string]string)
	// Split by VEVENT boundaries.
	parts := strings.Split(content, "BEGIN:VEVENT")
	for _, part := range parts[1:] {
		endIdx := strings.Index(part, "END:VEVENT")
		if endIdx < 0 {
			continue
		}
		block := "BEGIN:VEVENT" + part[:endIdx+len("END:VEVENT")]
		// Extract UID from the block.
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

// extractVEventText returns the raw VEVENT block from a raw_ics string.
func extractVEventText(raw string) string {
	start := strings.Index(raw, "BEGIN:VEVENT")
	end := strings.LastIndex(raw, "END:VEVENT")
	if start < 0 || end < 0 {
		return ""
	}
	return raw[start : end+len("END:VEVENT")]
}

// fetchIcsFromURL (was in serializer.go, kept with SSRF protection)
func fetchIcsFromURL(rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("invalid URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("unsupported protocol")
	}

	host := u.Hostname()
	if host == "" || host == "localhost" {
		return "", fmt.Errorf("invalid host")
	}
	if ip := net.ParseIP(host); ip != nil && isPrivateIP(ip) {
		return "", fmt.Errorf("private IP not allowed")
	}

	// DNS rebinding protection: validate resolved IP at dial time.
	origDial := (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 10 * time.Second,
	}).DialContext
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, _, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid address: %w", err)
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("DNS lookup failed: %w", err)
			}
			for _, ip := range ips {
				if isPrivateIP(ip.IP) {
					return nil, fmt.Errorf("private IP not allowed: %s", ip.IP)
				}
			}
			return origDial(ctx, network, addr)
		},
	}

	client := &http.Client{
		Timeout:   15 * time.Second,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			// Validate each redirect target
			rh := req.URL.Hostname()
			if rh == "" || rh == "localhost" {
				return fmt.Errorf("redirect to invalid host")
			}
			if ip := net.ParseIP(rh); ip != nil && isPrivateIP(ip) {
				return fmt.Errorf("redirect to private IP not allowed")
			}
			return nil
		},
	}
	resp, err := client.Get(rawURL)
	if err != nil {
		return "", fmt.Errorf("fetch failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		return "", fmt.Errorf("read failed: %w", err)
	}
	return string(body), nil
}

func isPrivateIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

// propText reads a property from a component, handling unknown property names
func propText(c *ical.Component, name string) string {
	s, _ := c.Props.Text(name)
	return s
}

// serializeEvent wraps a single VEVENT component in a minimal VCALENDAR.
// raw_ics is stored verbatim for CalDAV PROPFIND (faithful ICS re-delivery),
// not for export — export uses DB columns.
func serializeEvent(ev *ical.Component) string {
	cal := ical.NewCalendar()
	cal.Props.SetText(ical.PropProductID, "-//Calendar//Go//EN")
	cal.Props.SetText(ical.PropVersion, "2.0")
	cal.Children = append(cal.Children, ev)
	var buf bytes.Buffer
	_ = ical.NewEncoder(&buf).Encode(cal)
	return buf.String()
}
