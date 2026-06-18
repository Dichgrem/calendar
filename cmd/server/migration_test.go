package main

import (
	"testing"

	"calendar/internal/db"
)

func TestMigrationsRunWithoutError(t *testing.T) {
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() { _ = db.DB.Close() }()

	if err := runMigrations(); err != nil {
		t.Fatalf("first run: %v", err)
	}

	// Second run should be idempotent
	if err := runMigrations(); err != nil {
		t.Fatalf("second run: %v", err)
	}

	// Verify schema_versions table tracks the migration
	var count int
	_ = db.DB.QueryRow("SELECT COUNT(*) FROM schema_versions WHERE filename = '00001_initial.sql'").Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 migration record, got %d", count)
	}
}

func TestMigrationsSchemaVersionsExists(t *testing.T) {
	if err := db.Open(":memory:?_journal_mode=WAL&_foreign_keys=ON"); err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() { _ = db.DB.Close() }()

	if err := runMigrations(); err != nil {
		t.Fatalf("run migrations: %v", err)
	}

	// Verify core tables were created
	tables := []string{"users", "sessions", "calendars", "calendar_members", "events", "event_overrides", "user_settings", "sync_sequence", "deleted_log", "schema_versions"}
	for _, tbl := range tables {
		var name string
		err := db.DB.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", tbl).Scan(&name)
		if err != nil {
			t.Errorf("table %s not created: %v", tbl, err)
		}
	}
}
