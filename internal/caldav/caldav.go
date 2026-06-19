package caldav

import (
	"bytes"
	"encoding/xml"
	"net/http"
	"strings"

	ical "github.com/emersion/go-ical"

	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/util"
)

type chiRouter interface {
	Method(method, pattern string, h http.Handler)
	Get(pattern string, h http.HandlerFunc)
	Put(pattern string, h http.HandlerFunc)
	Delete(pattern string, h http.HandlerFunc)
}

func RegisterRoutes(r chiRouter) {
	r.Method("OPTIONS", "/dav/", http.HandlerFunc(handleDavOptions))
	r.Method("PROPFIND", "/dav/", http.HandlerFunc(handlePropfindRoot))
	r.Method("PROPFIND", "/dav/calendars/*", http.HandlerFunc(handlePropfind))
	r.Method("REPORT", "/dav/calendars/*", http.HandlerFunc(handleReport))
	r.Method("MKCALENDAR", "/dav/", http.HandlerFunc(handleMkcalendar))
	r.Get("/dav/calendars/*", handleGetEvent)
	r.Put("/dav/calendars/*", handlePutEvent)
	r.Delete("/dav/calendars/*", handleDeleteEvent)
}

func WellKnownHandler(w http.ResponseWriter, r *http.Request) {
	handlePropfindRoot(w, r)
}

func HandlePropfindRoot(w http.ResponseWriter, r *http.Request) {
	handlePropfindRoot(w, r)
}

func HandleDavOptions(w http.ResponseWriter, r *http.Request) {
	handleDavOptions(w, r)
}

func handleDavOptions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("DAV", "1, 2, 3, calendar-access")
	w.Header().Set("Allow", "OPTIONS, GET, PUT, DELETE, PROPFIND, REPORT, MKCALENDAR")
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(200)
}

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
	util.SetDateProp(ev.Props, ical.PropDateTimeStart, startAt)
	util.SetDateProp(ev.Props, ical.PropDateTimeEnd, endAt)
	if dtstamp != "" {
		util.SetDateProp(ev.Props, ical.PropDateTimeStamp, dtstamp)
	}
	cal.Children = append(cal.Children, ev.Component)
	return cal
}

func serializeCal(cal *ical.Calendar) string {
	var buf bytes.Buffer
	if err := ical.NewEncoder(&buf).Encode(cal); err != nil {
		logger.Error("[caldav] encode error: %v", err)
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

func writeXML(w http.ResponseWriter, ms multiStatus) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(207)
	if _, err := w.Write([]byte(xml.Header)); err != nil {
		logger.Error("[caldav] write header error: %v", err)
		return
	}
	b, _ := xml.MarshalIndent(ms, "", "  ")
	if _, err := w.Write(b); err != nil {
		logger.Error("[caldav] write body error: %v", err)
	}
}

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
