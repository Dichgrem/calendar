package ics

import (
	"testing"

	ical "github.com/emersion/go-ical"
)

func TestExtractEventsEmpty(t *testing.T) {
	cal, _ := parseIcsContent("BEGIN:VCALENDAR\nEND:VCALENDAR")
	events := extractEvents(cal)
	if len(events) != 0 {
		t.Errorf("empty cal should have 0 events, got %d", len(events))
	}
}

func TestExtractEventsMultiple(t *testing.T) {
	cal, _ := parseIcsContent("BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR")
	events := extractEvents(cal)
	if len(events) != 2 {
		t.Errorf("expected 2 events, got %d", len(events))
	}
}

func TestCapEventsUnderLimit(t *testing.T) {
	events := make([]*ical.Component, 10)
	result := capEvents(events)
	if len(result) != 10 {
		t.Errorf("under limit: got %d", len(result))
	}
}

func TestCapEventsOverLimit(t *testing.T) {
	events := make([]*ical.Component, 6000)
	result := capEvents(events)
	if len(result) != maxICSEvents {
		t.Errorf("over limit: got %d, want %d", len(result), maxICSEvents)
	}
}

func TestNormalizeICSDateAllDay(t *testing.T) {
	result := normalizeICSDate("20260601")
	if result != "2026-06-01" {
		t.Errorf("got %q", result)
	}
}

func TestNormalizeICSDateTimeZ(t *testing.T) {
	result := normalizeICSDate("20260620T100000Z")
	if result != "2026-06-20T10:00:00Z" {
		t.Errorf("got %q", result)
	}
}

func TestNormalizeICSDateTimeNoZ(t *testing.T) {
	result := normalizeICSDate("20260620T100000")
	if result != "2026-06-20T10:00:00Z" {
		t.Errorf("got %q", result)
	}
}

func TestComponentPropText(t *testing.T) {
	cal, _ := parseIcsContent("BEGIN:VCALENDAR\nSUMMARY:Test Cal\nBEGIN:VEVENT\nSUMMARY:My Event\nEND:VEVENT\nEND:VCALENDAR")
	name := componentProp(cal.Component, "SUMMARY")
	if name != "Test Cal" {
		t.Errorf("got %q", name)
	}
}

func TestPropText(t *testing.T) {
	cal, _ := parseIcsContent("BEGIN:VCALENDAR\nX-WR-CALNAME:Holidays\nEND:VCALENDAR")
	name := propText(cal.Component, "X-WR-CALNAME")
	if name != "Holidays" {
		t.Errorf("got %q", name)
	}
}

func TestFetchIcsFromURLInvalidScheme(t *testing.T) {
	_, err := fetchIcsFromURL("ftp://example.com/cal.ics")
	if err == nil {
		t.Error("ftp should be rejected")
	}
}

func TestFetchIcsFromURLLocalhost(t *testing.T) {
	_, err := fetchIcsFromURL("http://localhost/cal.ics")
	if err == nil {
		t.Error("localhost should be rejected")
	}
}

func TestFetchIcsFromURLPrivateIP(t *testing.T) {
	_, err := fetchIcsFromURL("http://10.0.0.1/cal.ics")
	if err == nil {
		t.Error("private IP should be rejected")
	}
	_, err = fetchIcsFromURL("http://192.168.1.1/cal.ics")
	if err == nil {
		t.Error("private IP should be rejected")
	}
}

func TestFetchIcsFromURLInvalidURL(t *testing.T) {
	_, err := fetchIcsFromURL("://not-a-url")
	if err == nil {
		t.Error("invalid URL should be rejected")
	}
}
