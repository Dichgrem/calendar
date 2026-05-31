CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_members` (
	`calendar_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_members_uk` ON `calendar_members` (`calendar_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_calendar_members_user` ON `calendar_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#3b82f6' NOT NULL,
	`source_url` text,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_modified` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_calendars_owner` ON `calendars` (`owner_id`);--> statement-breakpoint
CREATE TABLE `deleted_log` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`deleted_at` text NOT NULL,
	`last_modified` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_deleted_log_modified` ON `deleted_log` (`last_modified`);--> statement-breakpoint
CREATE INDEX `idx_deleted_log_table` ON `deleted_log` (`table_name`,`record_id`);--> statement-breakpoint
CREATE TABLE `event_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text NOT NULL,
	`original_date` text NOT NULL,
	`override_start` text,
	`override_end` text,
	`override_title` text,
	`deleted` integer DEFAULT false NOT NULL,
	`last_modified` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_overrides_parent_date` ON `event_overrides` (`parent_id`,`original_date`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`rrule` text,
	`color` text,
	`location` text,
	`parent_id` text,
	`original_date` text,
	`deleted` integer DEFAULT false NOT NULL,
	`raw_ics` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_modified` integer NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_calendar_time` ON `events` (`calendar_id`,`start_at`,`end_at`);--> statement-breakpoint
CREATE INDEX `idx_events_calendar_modified` ON `events` (`calendar_id`,`last_modified`);--> statement-breakpoint
CREATE INDEX `idx_events_parent` ON `events` (`parent_id`);--> statement-breakpoint
CREATE TABLE `sync_sequence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`language` text DEFAULT 'zh-CN' NOT NULL,
	`default_reminder_before` integer DEFAULT 15 NOT NULL,
	`first_day_of_week` integer DEFAULT 0 NOT NULL,
	`show_completed_todos` integer DEFAULT false NOT NULL,
	`show_event_time` integer DEFAULT true NOT NULL,
	`date_format` text DEFAULT 'zh' NOT NULL,
	`show_lunar_calendar` integer DEFAULT false NOT NULL
);
