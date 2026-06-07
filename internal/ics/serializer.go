package ics

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// SerializeCalendar converts events to ICS (iCalendar RFC 5545) format.
func SerializeCalendar(name string, events []IcsEvent) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString("PRODID:-//Calendar//Go//EN\r\n")
	b.WriteString("CALSCALE:GREGORIAN\r\n")
	b.WriteString(fmt.Sprintf("X-WR-CALNAME:%s\r\n", name))

	for _, e := range events {
		writeVevent(&b, e)
	}

	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

func writeVevent(b *strings.Builder, e IcsEvent) {
	b.WriteString("BEGIN:VEVENT\r\n")
	writeLine(b, "UID", e.UID)
	if e.DTStamp != "" {
		writeLine(b, "DTSTAMP", toIcsDateTime(e.DTStamp))
	}
	if e.StartAt != "" {
		writeLine(b, "DTSTART", toIcsDateTime(e.StartAt))
	}
	if e.EndAt != "" {
		writeLine(b, "DTEND", toIcsDateTime(e.EndAt))
	}
	writeLine(b, "SUMMARY", e.Title)
	if e.Description != "" {
		writeLine(b, "DESCRIPTION", e.Description)
	}
	if e.Location != "" {
		writeLine(b, "LOCATION", e.Location)
	}
	if e.RRule != "" {
		writeLine(b, "RRULE", e.RRule)
	}
	b.WriteString("END:VEVENT\r\n")
}

func writeLine(b *strings.Builder, name, value string) {
	line := fmt.Sprintf("%s:%s", name, escapeIcsValue(value))
	if len(line) <= 75 {
		b.WriteString(line + "\r\n")
		return
	}
	b.WriteString(line[:75] + "\r\n")
	for i := 75; i < len(line); i += 74 {
		end := i + 74
		if end > len(line) {
			end = len(line)
		}
		b.WriteString(" " + line[i:end] + "\r\n")
	}
}

func escapeIcsValue(v string) string {
	v = strings.ReplaceAll(v, "\\", "\\\\")
	v = strings.ReplaceAll(v, ";", "\\;")
	v = strings.ReplaceAll(v, ",", "\\,")
	v = strings.ReplaceAll(v, "\n", "\\n")
	return v
}

func toIcsDateTime(iso string) string {
	iso = strings.TrimSpace(iso)
	if len(iso) >= 19 {
		s := iso[0:4] + iso[5:7] + iso[8:10] + "T" +
			iso[11:13] + iso[14:16] + iso[17:19]
		if strings.HasSuffix(iso, "Z") {
			s += "Z"
		}
		return s
	}
	if len(iso) == 10 {
		return iso[0:4] + iso[5:7] + iso[8:10]
	}
	return iso
}

// FetchIcsFromURL fetches ICS content from a remote URL with SSRF protection.
func FetchIcsFromURL(rawURL string) (string, error) {
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

	// Resolve and check all addresses
	addrs, err := net.LookupIP(host)
	if err != nil {
		return "", fmt.Errorf("DNS lookup failed: %w", err)
	}
	for _, addr := range addrs {
		if privateIP(addr) {
			return "", fmt.Errorf("private IP not allowed")
		}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(rawURL)
	if err != nil {
		return "", fmt.Errorf("fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Max 10 MB
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

func privateIP(ip net.IP) bool { return isPrivateIP(ip) }
