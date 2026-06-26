package ics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"

	ical "github.com/emersion/go-ical"

	"calendar/internal/apperror"
	"calendar/internal/logger"
	"calendar/internal/middleware"
	"calendar/internal/util"
)

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

	events := capEvents(extractEvents(icalCal))
	items := make([]PreviewItem, 0, len(events))
	var earliest, latest string
	for _, ev := range events {
		uid := util.ComponentProp(ev, ical.PropUID)
		title := util.ComponentProp(ev, ical.PropSummary)
		startAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeStart), "")
		endAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeEnd), "")
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
		Name:       calName(icalCal),
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

	events := capEvents(extractEvents(icalCal))
	items := make([]PreviewItem, 0, len(events))
	var earliest, latest string
	for _, ev := range events {
		uid := util.ComponentProp(ev, ical.PropUID)
		title := util.ComponentProp(ev, ical.PropSummary)
		startAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeStart), "")
		endAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeEnd), "")
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
		Name:       calName(icalCal),
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

// fetchIcsFromURL fetches ICS content from a URL with SSRF protection.
func fetchIcsFromURL(rawURL string) (string, error) {
	content, _, err := fetchIcsConditional(rawURL, time.Time{})
	return content, err
}

// fetchIcsConditional fetches ICS with optional If-Modified-Since.
// Returns (content, false, nil) on 200, ("", true, nil) on 304, or ("", false, err) on failure.
func fetchIcsConditional(rawURL string, ifModifiedSince time.Time) (string, bool, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", false, fmt.Errorf("invalid URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", false, fmt.Errorf("unsupported protocol")
	}

	host := u.Hostname()
	if host == "" || host == "localhost" {
		return "", false, fmt.Errorf("invalid host")
	}
	if ip := net.ParseIP(host); ip != nil && isPrivateIP(ip) {
		return "", false, fmt.Errorf("private IP not allowed")
	}

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
		return "", false, fmt.Errorf("fetch failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == 304 {
		return "", true, nil
	}
	if resp.StatusCode >= 400 {
		return "", false, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		return "", false, fmt.Errorf("read failed: %w", err)
	}
	return string(body), false, nil
}

func isPrivateIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}
