-- Move UI prefs to client-side localStorage. Keep only auto-backup config.
ALTER TABLE user_settings DROP COLUMN language;
ALTER TABLE user_settings DROP COLUMN first_day_of_week;
ALTER TABLE user_settings DROP COLUMN show_event_time;
ALTER TABLE user_settings DROP COLUMN date_format;
ALTER TABLE user_settings DROP COLUMN show_lunar_calendar;
ALTER TABLE user_settings DROP COLUMN default_calendar_id;
