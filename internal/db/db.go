package db

import (
	"database/sql"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var (
	DB   *sql.DB
	Path string
)

// Open initializes the SQLite database and runs pending migrations.
func Open(databaseURL string) error {
	// Ensure directory exists
	dir := filepath.Dir(databaseURL)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	Path = databaseURL
	var err error
	DB, err = sql.Open("sqlite", databaseURL+"?_journal_mode=WAL&_foreign_keys=ON")
	if err != nil {
		return err
	}

	DB.SetMaxOpenConns(1) // SQLite single-writer
	return DB.Ping()
}

func Close() {
	if DB != nil {
		_ = DB.Close()
	}
}
