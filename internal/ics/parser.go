package ics

import (
	"strings"
)

// IcsEvent represents a parsed VEVENT from ICS content.
type IcsEvent struct {
	UID         string
	Title       string
	StartAt     string
	EndAt       string
	RRule       string
	Description string
	Location    string
	DTStamp     string
	LastMod     string
}

// CalendarName extracts the X-WR-CALNAME or NAME from a VCALENDAR.
type ParseResult struct {
	Name   string
	Events []IcsEvent
}

// ParseIcs parses ICS (iCalendar RFC 5545) text and extracts VEVENT components.
// It handles folded lines and VALUE=DATE parameters.
func ParseIcs(content string) (*ParseResult, error) {
	// Normalize line endings and unfold folded lines
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")

	lines := unfoldLines(content)

	result := &ParseResult{
		Name: "Imported Calendar",
	}

	var inVevent bool
	var current *IcsEvent

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Section boundaries
		upper := strings.ToUpper(line)
		if upper == "BEGIN:VEVENT" {
			inVevent = true
			current = &IcsEvent{}
			continue
		}
		if upper == "END:VEVENT" {
			if current != nil && current.UID != "" {
				// Normalize null dates
				if current.StartAt == "" {
					current.StartAt = current.DTStamp
				}
				if current.EndAt == "" {
					current.EndAt = current.StartAt
				}
				result.Events = append(result.Events, *current)
			}
			inVevent = false
			current = nil
			continue
		}

		if !inVevent {
			// Check for calendar name
			if strings.HasPrefix(upper, "X-WR-CALNAME:") || strings.HasPrefix(upper, "X-WR-CALNAME;") {
				result.Name = extractValue(line)
			} else if strings.HasPrefix(upper, "NAME:") || strings.HasPrefix(upper, "NAME;") {
				result.Name = extractValue(line)
			}
			continue
		}

		// Inside VEVENT
		name, params, value := splitLine(line)
		_ = params // used for VALUE=DATE detection below
		switch strings.ToUpper(name) {
		case "UID":
			current.UID = value
		case "SUMMARY":
			current.Title = value
		case "DTSTART":
			current.StartAt = parseDateTime(value, params)
		case "DTEND":
			current.EndAt = parseDateTime(value, params)
		case "RRULE":
			current.RRule = value
		case "DESCRIPTION":
			current.Description = value
		case "LOCATION":
			current.Location = value
		case "DTSTAMP":
			current.DTStamp = parseDateTime(value, params)
		case "LAST-MODIFIED":
			current.LastMod = parseDateTime(value, params)
		}
	}

	return result, nil
}

// unfoldLines joins RFC 5545 folded lines (continuation lines starting with space/tab).
func unfoldLines(content string) []string {
	var result []string
	var current string

	for _, line := range strings.Split(content, "\n") {
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			current += line[1:]
		} else {
			if current != "" {
				result = append(result, current)
			}
			current = line
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

// splitLine splits an ICS content line into name, params map, and value.
// Example: "DTSTART;VALUE=DATE:20260101" → ("DTSTART", {"VALUE":"DATE"}, "20260101")
func splitLine(line string) (name string, params map[string]string, value string) {
	params = make(map[string]string)

	// Find the colon separator (value may contain colons, but the first one splits)
	colIdx := strings.Index(line, ":")
	if colIdx < 0 {
		return line, params, ""
	}

	nameAndParams := line[:colIdx]
	value = line[colIdx+1:]

	// Split name and params by semicolons
	parts := strings.Split(nameAndParams, ";")
	name = parts[0]
	for _, p := range parts[1:] {
		eqIdx := strings.Index(p, "=")
		if eqIdx >= 0 {
			params[strings.ToUpper(p[:eqIdx])] = p[eqIdx+1:]
		}
	}

	return
}

// extractValue gets the value part of an ICS line (after first colon).
func extractValue(line string) string {
	colIdx := strings.Index(line, ":")
	if colIdx < 0 {
		return ""
	}
	return line[colIdx+1:]
}

// parseDateTime converts ICS date/time to ISO 8601 string.
// Handles DATE (YYYYMMDD) and DATE-TIME (YYYYMMDDTHHMMSS[Z]) values.
func parseDateTime(value string, params map[string]string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	// Check for VALUE=DATE parameter
	isDateOnly := strings.EqualFold(params["VALUE"], "DATE")

	if isDateOnly || len(value) == 8 {
		// YYYYMMDD format
		if len(value) == 8 {
			return value[0:4] + "-" + value[4:6] + "-" + value[6:8]
		}
		return value
	}

	// DATE-TIME: YYYYMMDDTHHMMSS[Z]
	if len(value) >= 15 {
		result := value[0:4] + "-" + value[4:6] + "-" + value[6:8] + "T" +
			value[9:11] + ":" + value[11:13] + ":" + value[13:15]
		if len(value) > 15 && value[15] == 'Z' {
			result += "Z"
		}
		return result
	}

	return value
}
