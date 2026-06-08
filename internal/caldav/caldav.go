package caldav

import (
	"fmt"
	"net/http"
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
	scheme := requestScheme(r)
	w.Header().Set("Location", fmt.Sprintf("%s://%s/dav/", scheme, r.Host))
	w.WriteHeader(301)
}

func RootRedirect(w http.ResponseWriter, r *http.Request) {
	scheme := requestScheme(r)
	w.Header().Set("Location", fmt.Sprintf("%s://%s/dav/", scheme, r.Host))
	w.WriteHeader(301)
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
