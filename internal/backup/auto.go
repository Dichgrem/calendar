package backup

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"calendar/internal/db"
	"calendar/internal/logger"
)

// StartAutoBackup launches a background goroutine that periodically
// exports ICS backups for calendars configured in user_settings.
func StartAutoBackup() {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()

		lastBackup := make(map[string]time.Time) // "userID:calID" → last backup time

		for range ticker.C {
			runAutoBackup(lastBackup)
		}
	}()
}

func runAutoBackup(lastBackup map[string]time.Time) {
	rows, err := db.DB.Query(
		`SELECT user_id, auto_backup_calendars, auto_backup_interval_min
		 FROM user_settings
		 WHERE auto_backup_interval_min > 0 AND auto_backup_calendars != ''`,
	)
	if err != nil {
		return
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var userID, calIDs string
		var intervalMin int
		if err := rows.Scan(&userID, &calIDs, &intervalMin); err != nil {
			continue
		}

		for _, calID := range strings.Split(calIDs, ",") {
			calID = strings.TrimSpace(calID)
			if calID == "" {
				continue
			}

			key := userID + ":" + calID
			last, ok := lastBackup[key]
			if ok && time.Since(last) < time.Duration(intervalMin)*time.Minute {
				continue
			}

			if err := exportCalendarICS(calID); err != nil {
				logger.Error("[auto-backup] export cal=%s error: %v", calID, err)
			} else {
				lastBackup[key] = time.Now()
				logger.Info("[auto-backup] exported cal=%s", calID)
			}
		}
	}
}

func exportCalendarICS(calID string) error {
	var name string
	if err := db.DB.QueryRow("SELECT name FROM calendars WHERE id = ?", calID).Scan(&name); err != nil {
		return fmt.Errorf("calendar not found: %w", err)
	}

	rows, err := db.DB.Query(
		`SELECT raw_ics FROM events
		 WHERE calendar_id = ? AND deleted = 0 AND raw_ics IS NOT NULL AND raw_ics != ''
		 ORDER BY start_at`,
		calID,
	)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()

	var buf strings.Builder
	buf.WriteString("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Calendar//EN\r\n")
	fmt.Fprintf(&buf, "X-WR-CALNAME:%s\r\n", name)

	for rows.Next() {
		var rawICS string
		if err := rows.Scan(&rawICS); err != nil {
			continue
		}
		buf.WriteString(rawICS)
		if !strings.HasSuffix(rawICS, "\n") {
			buf.WriteString("\r\n")
		}
	}
	buf.WriteString("END:VCALENDAR\r\n")

	timestamp := time.Now().UTC().Format("20060102-1504")
	safeName := sanitizeFilename(name)
	filename := fmt.Sprintf("%s-%s.ics", safeName, timestamp)
	path := filepath.Join(backupDir(), filename)

	if err := os.MkdirAll(backupDir(), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(buf.String()), 0o600); err != nil {
		return err
	}

	// Clean up old backups (>10 per calendar)
	cleanOldAutos(calID, safeName)
	return nil
}

func cleanOldAutos(calID, safeName string) {
	entries, err := os.ReadDir(backupDir())
	if err != nil {
		return
	}

	prefix := safeName + "-"
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), prefix) && strings.HasSuffix(e.Name(), ".ics") {
			files = append(files, e.Name())
		}
	}
	if len(files) <= 10 {
		return
	}

	sort.Strings(files)
	for _, f := range files[:len(files)-10] {
		_ = os.Remove(filepath.Join(backupDir(), f))
	}
}

func sanitizeFilename(name string) string {
	r := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_",
		"?", "_", "\"", "_", "<", "_", ">", "_", "|", "_",
		" ", "-",
	)
	return r.Replace(name)
}
