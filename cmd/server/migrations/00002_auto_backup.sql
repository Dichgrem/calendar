ALTER TABLE user_settings ADD COLUMN auto_backup_calendars TEXT DEFAULT '';
ALTER TABLE user_settings ADD COLUMN auto_backup_interval_min INTEGER DEFAULT 0;
