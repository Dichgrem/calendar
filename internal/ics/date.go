package ics

import "strings"

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
