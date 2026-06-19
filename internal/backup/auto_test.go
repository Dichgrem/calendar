package backup

import (
	"os"
	"path/filepath"
	"testing"

	"calendar/internal/db"
)

func TestSanitizeFilename(t *testing.T) {
	tests := []struct{ in, want string }{
		{"My Calendar", "My-Calendar"},
		{"工作日历", "工作日历"},
		{"a/b:c", "a_b_c"},
		{"test 日历 2024", "test-日历-2024"},
	}
	for _, tc := range tests {
		got := sanitizeFilename(tc.in)
		if got != tc.want {
			t.Errorf("sanitize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestExportCalendarICS(t *testing.T) {
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() { _ = db.DB.Close() }()

	stmts := []string{
		`CREATE TABLE IF NOT EXISTS calendars (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, calendar_id TEXT, start_at TEXT, deleted INTEGER DEFAULT 0, raw_ics TEXT)`,
	}
	for _, s := range stmts {
		_, _ = db.DB.Exec(s)
	}
	_, _ = db.DB.Exec(`INSERT INTO calendars (id, name) VALUES ('cal-1', 'Test Cal')`)
	_, _ = db.DB.Exec(`INSERT INTO events (id, calendar_id, start_at, raw_ics) VALUES ('ev-1', 'cal-1', '2026-01-01', 'BEGIN:VEVENT\nEND:VEVENT')`)

	if err := os.MkdirAll(backupDir(), 0o700); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = os.RemoveAll(backupDir()) }()

	if err := exportCalendarICS("cal-1"); err != nil {
		t.Fatalf("exportCalendarICS: %v", err)
	}

	files, _ := filepath.Glob(filepath.Join(backupDir(), "Test-Cal-*.ics"))
	if len(files) == 0 {
		t.Error("no backup file created")
	}
}
