package ics

import (
	"strings"

	ical "github.com/emersion/go-ical"
	"github.com/go-chi/chi/v5"

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

// propText reads a property from a component, handling unknown property names
func propText(c *ical.Component, name string) string {
	s, _ := c.Props.Text(name)
	return s
}

// serializeEvent wraps a single VEVENT component in a minimal VCALENDAR.
func serializeEvent(ev *ical.Component) string {
	cal := ical.NewCalendar()
	cal.Props.SetText(ical.PropProductID, "-//Calendar//Go//EN")
	cal.Props.SetText(ical.PropVersion, "2.0")
	cal.Children = append(cal.Children, ev)

	var buf strings.Builder
	_ = encodeCal(&buf, cal)
	return buf.String()
}

func encodeCal(w *strings.Builder, cal *ical.Calendar) error {
	enc := ical.NewEncoder(w)
	return enc.Encode(cal)
}

// calName extracts the calendar name from X-WR-CALNAME or NAME property.
func calName(cal *ical.Calendar) string {
	name := util.ComponentProp(cal.Component, ical.PropName)
	if name == "" {
		name = propText(cal.Component, "X-WR-CALNAME")
	}
	if name == "" {
		name = "Imported Calendar"
	}
	return name
}
