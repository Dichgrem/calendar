CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS calendars (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    source_url TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual',
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_modified INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendars_owner ON calendars(owner_id);

CREATE TABLE IF NOT EXISTS calendar_members (
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_members_uk ON calendar_members(calendar_id, user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_members_user ON calendar_members(user_id);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL,
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    rrule TEXT,
    color TEXT,
    location TEXT,
    parent_id TEXT,
    original_date TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    raw_ics TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_modified INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_calendar_time ON events(calendar_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_events_calendar_modified ON events(calendar_id, last_modified);
CREATE INDEX IF NOT EXISTS idx_events_parent ON events(parent_id);
CREATE INDEX IF NOT EXISTS idx_events_deleted ON events(deleted);

CREATE TABLE IF NOT EXISTS event_overrides (
    id TEXT PRIMARY KEY NOT NULL,
    parent_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    original_date TEXT NOT NULL,
    override_start TEXT,
    override_end TEXT,
    override_title TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    last_modified INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_overrides_parent_date ON event_overrides(parent_id, original_date);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL DEFAULT 'zh-CN',
    first_day_of_week INTEGER NOT NULL DEFAULT 1,
    show_event_time INTEGER NOT NULL DEFAULT 0,
    date_format TEXT NOT NULL DEFAULT 'zh',
    show_lunar_calendar INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sync_sequence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    op TEXT NOT NULL,
    synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_log (
    id TEXT PRIMARY KEY NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    last_modified INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deleted_log_modified ON deleted_log(last_modified);
CREATE INDEX IF NOT EXISTS idx_deleted_log_table ON deleted_log(table_name, record_id);
