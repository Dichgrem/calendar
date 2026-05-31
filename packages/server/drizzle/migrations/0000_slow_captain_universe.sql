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
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_modified` integer NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_calendar_time` ON `events` (`calendar_id`,`start_at`,`end_at`);--> statement-breakpoint
CREATE INDEX `idx_events_calendar_modified` ON `events` (`calendar_id`,`last_modified`);--> statement-breakpoint
CREATE INDEX `idx_events_parent` ON `events` (`parent_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_ep` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`data` text NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_sequence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `todo_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`user_id` text NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_modified` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_todo_lists_user` ON `todo_lists` (`user_id`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`list_id` text,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'none' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`completed_at` text,
	`due_date` text,
	`due_time` text,
	`rrule` text,
	`sort_order` real DEFAULT 0 NOT NULL,
	`parent_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_modified` integer NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`list_id`) REFERENCES `todo_lists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_todos_calendar_list` ON `todos` (`calendar_id`,`list_id`);--> statement-breakpoint
CREATE INDEX `idx_todos_calendar_modified` ON `todos` (`calendar_id`,`last_modified`);--> statement-breakpoint
CREATE INDEX `idx_todos_parent` ON `todos` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_todos_due_date` ON `todos` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_todos_status` ON `todos` (`status`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`language` text DEFAULT 'zh-CN' NOT NULL,
	`default_reminder_before` integer DEFAULT 15 NOT NULL,
	`first_day_of_week` integer DEFAULT 0 NOT NULL,
	`show_completed_todos` integer DEFAULT false NOT NULL
);
