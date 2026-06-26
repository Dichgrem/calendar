package ics

import (
	"strings"
	"time"
)

// NormalizeICSDate converts ICS raw datetime to ISO 8601 for storage.
// Handles: "20240101" → "2024-01-01", "20240101T090000Z" → "2024-01-01T09:00:00Z"
func NormalizeICSDate(raw string) string {
	return normalizeICSDate(raw, "")
}

// NormalizeICSDateWithTZID converts ICS raw datetime with optional TZID to UTC ISO 8601.
func NormalizeICSDateWithTZID(raw, tzid string) string {
	return normalizeICSDate(raw, tzid)
}

// normalizeICSDate converts ICS raw datetime to ISO 8601 for storage.
// All timed values are stored with Z suffix (UTC) per CalDAV best practice.
func normalizeICSDate(raw string, tzid string) string {
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
		} else if tzid != "" {
			// Convert local time with TZID to UTC
			loc, err := time.LoadLocation(tzid)
			if err != nil {
				result += "Z" // fallback: treat as UTC
			} else {
				t, err := time.ParseInLocation("20060102T150405", raw, loc)
				if err != nil {
					result += "Z"
				} else {
					return t.UTC().Format("2006-01-02T15:04:05") + "Z"
				}
			}
		} else {
			result += "Z" // floating time → UTC
		}
		return result
	}
	return raw
}
