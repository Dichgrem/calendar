package caldav

import (
	"encoding/xml"
	"fmt"
	"net/http"
)

// chiRouter is the interface we need from chi.Router
type chiRouter interface {
	Method(method, pattern string, h http.Handler)
	Get(pattern string, h http.HandlerFunc)
	Put(pattern string, h http.HandlerFunc)
	Delete(pattern string, h http.HandlerFunc)
}

// RegisterRoutes adds CalDAV routes.
func RegisterRoutes(r chiRouter) {
	r.Method("PROPFIND", "/.well-known/caldav", http.HandlerFunc(handleWellKnown))
	r.Method("OPTIONS", "/dav/", http.HandlerFunc(handleDavOptions))

	r.Method("PROPFIND", "/dav/", http.HandlerFunc(handlePropfindRoot))
	r.Method("PROPFIND", "/dav/calendars/*", http.HandlerFunc(handlePropfind))
	r.Method("REPORT", "/dav/calendars/*", http.HandlerFunc(handleReport))
	r.Method("MKCALENDAR", "/dav/", http.HandlerFunc(handleMkcalendar))

	r.Get("/dav/calendars/*", handleGetEvent)
	r.Put("/dav/calendars/*", handlePutEvent)
	r.Delete("/dav/calendars/*", handleDeleteEvent)
}

// XML namespace constants
const (
	davNS    = "DAV:"
	caldavNS = "urn:ietf:params:xml:ns:caldav"
	icalNS   = "http://apple.com/ns/ical/"
)

// MultiStatus is the root element for PROPFIND responses
type MultiStatus struct {
	XMLName   xml.Name   `xml:"DAV: multistatus"`
	Responses []Response `xml:"response"`
}

type Response struct {
	Href     string     `xml:"href"`
	PropStat []PropStat `xml:"propstat"`
}

type PropStat struct {
	Prop   Prop   `xml:"prop"`
	Status string `xml:"status"`
}

type Prop struct {
	ResourceType    *ResourceType `xml:"resourcetype,omitempty"`
	DisplayName     string        `xml:"displayname,omitempty"`
	GetContentType  string        `xml:"getcontenttype,omitempty"`
	GetETag         string        `xml:"getetag,omitempty"`
	GetContentLength int64        `xml:"getcontentlength,omitempty"`
	GetLastModified string        `xml:"getlastmodified,omitempty"`

	CurrentUserPrincipal *Href          `xml:"current-user-principal,omitempty"`
	CalendarHomeSet      *Href          `xml:"calendar-home-set,omitempty"`
	CalendarData         *CalendarData  `xml:"urn:ietf:params:xml:ns:caldav calendar-data,omitempty"`
}

type ResourceType struct {
	Collection *struct{} `xml:"collection,omitempty"`
	Calendar   *struct{} `xml:"urn:ietf:params:xml:ns:caldav calendar,omitempty"`
}

type Href struct {
	Inner string `xml:"DAV: href"`
}

type CalendarData struct {
	Content string `xml:",chardata"`
}

func handleDavOptions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("DAV", "1, 2, 3, calendar-access")
	w.Header().Set("Allow", "OPTIONS, PROPFIND, REPORT, MKCALENDAR, GET, PUT, DELETE")
	w.WriteHeader(200)
}

func handleWellKnown(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Location", fmt.Sprintf("https://%s/dav/", r.Host))
	w.WriteHeader(301)
}
