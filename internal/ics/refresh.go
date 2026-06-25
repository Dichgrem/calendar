package ics

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	ical "github.com/emersion/go-ical"
	"github.com/google/uuid"

	"calendar/internal/db"
	"calendar/internal/logger"
	"calendar/internal/util"
)

// RefreshSubscription fetches the ICS from the calendar's source_url and re-imports all events.
func RefreshSubscription(calID string) (int, error) {
	var sourceURL sql.NullString
	err := db.DB.QueryRow(`SELECT source_url FROM calendars WHERE id = ? AND source_type = 'ics_subscription'`, calID).Scan(&sourceURL)
	if err != nil {
		return 0, fmt.Errorf("not a subscription calendar: %w", err)
	}
	if !sourceURL.Valid || sourceURL.String == "" {
		return 0, fmt.Errorf("subscription URL is empty")
	}

	content, err := fetchIcsFromURL(sourceURL.String)
	if err != nil {
		return 0, fmt.Errorf("fetch failed: %w", err)
	}

	icalCal, err := parseIcsContent(content)
	if err != nil {
		return 0, fmt.Errorf("parse failed: %w", err)
	}

	events := capEvents(extractEvents(icalCal))
	if len(events) == 0 {
		return 0, fmt.Errorf("no events in ICS")
	}

	rawVEvents := extractVEventsByUID(content)
	now := time.Now().UTC().Format(time.RFC3339)
	lmod := time.Now().UnixMilli()

	tx, err := db.DB.Begin()
	if err != nil {
		return 0, fmt.Errorf("transaction error: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(`DELETE FROM events WHERE calendar_id = ?`, calID); err != nil {
		return 0, fmt.Errorf("delete old events: %w", err)
	}

	for _, ev := range events {
		uid := util.ComponentProp(ev, ical.PropUID)
		if uid == "" {
			uid = uuid.New().String()
		}

		eventID := uuid.New().String()
		title := util.ComponentProp(ev, ical.PropSummary)
		startAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeStart))
		endAt := normalizeICSDate(util.ComponentProp(ev, ical.PropDateTimeEnd))

		rawICS := rawVEvents[uid]
		if rawICS == "" {
			rawICS = serializeEvent(ev)
		}

		desc := util.ComponentProp(ev, ical.PropDescription)
		rruleVal := util.ComponentProp(ev, ical.PropRecurrenceRule)
		loc := util.ComponentProp(ev, ical.PropLocation)

		allDay := 0
		if !strings.Contains(startAt, "T") && !strings.Contains(endAt, "T") {
			allDay = 1
		}

		_, err := tx.Exec(`
			INSERT INTO events (id, calendar_id, title, description, start_at, end_at,
			                    all_day, rrule, color, location, created_at, updated_at, last_modified, raw_ics)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, eventID, calID, title, util.StrOrNil(desc), startAt, endAt,
			allDay, util.StrOrNil(rruleVal), nil, util.StrOrNil(loc), now, now, lmod, rawICS)
		if err != nil {
			return 0, fmt.Errorf("insert event: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	logger.Info("[ics] refresh cal=%s events=%d", calID, len(events))
	return len(events), nil
}

func RefreshAllSubscriptions() {
	rows, err := db.DB.Query(`SELECT id, name FROM calendars WHERE source_type = 'ics_subscription' AND source_url IS NOT NULL AND source_url != ''`)
	if err != nil {
		logger.Error("[ics] refresh-all query error: %v", err)
		return
	}
	defer func() { _ = rows.Close() }()

	type cal struct {
		ID, Name string
	}
	var cals []cal
	for rows.Next() {
		var c cal
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			continue
		}
		cals = append(cals, c)
	}
	if err := rows.Err(); err != nil {
		logger.Error("[ics] refresh-all rows error: %v", err)
		return
	}

	for _, c := range cals {
		n, err := RefreshSubscription(c.ID)
		if err != nil {
			logger.Error("[ics] refresh %q (%s) error: %v", c.Name, c.ID, err)
			continue
		}
		logger.Info("[ics] refresh %q (%s) => %d events", c.Name, c.ID, n)
	}
}
