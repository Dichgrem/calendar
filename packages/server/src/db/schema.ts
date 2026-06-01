import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const calendars = sqliteTable(
  "calendars",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#3b82f6"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type", {
      enum: ["ics_import", "ics_subscription", "manual", "auto_log", "course_schedule"],
    })
      .notNull()
      .default("manual"),
    ownerId: text("owner_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastModified: integer("last_modified").notNull(),
    courseMeta: text("course_meta"),
  },
  (t) => ({
    idxOwner: index("idx_calendars_owner").on(t.ownerId),
  }),
);

export const calendarMembers = sqliteTable(
  "calendar_members",
  {
    calendarId: text("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["viewer", "editor", "admin"] }).notNull(),
  },
  (t) => ({
    idxUk: uniqueIndex("idx_calendar_members_uk").on(t.calendarId, t.userId),
    idxUser: index("idx_calendar_members_user").on(t.userId),
  }),
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    calendarId: text("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    rrule: text("rrule"),
    color: text("color"),
    location: text("location"),
    parentId: text("parent_id"),
    originalDate: text("original_date"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    rawIcs: text("raw_ics"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastModified: integer("last_modified").notNull(),
  },
  (t) => ({
    idxCalendarTime: index("idx_events_calendar_time").on(t.calendarId, t.startAt, t.endAt),
    idxCalendarModified: index("idx_events_calendar_modified").on(t.calendarId, t.lastModified),
    idxParent: index("idx_events_parent").on(t.parentId),
  }),
);

export const eventOverrides = sqliteTable(
  "event_overrides",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    originalDate: text("original_date").notNull(),
    overrideStart: text("override_start"),
    overrideEnd: text("override_end"),
    overrideTitle: text("override_title"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    lastModified: integer("last_modified").notNull(),
  },
  (t) => ({
    idxParentDate: uniqueIndex("idx_overrides_parent_date").on(t.parentId, t.originalDate),
  }),
);

export const deletedLog = sqliteTable(
  "deleted_log",
  {
    id: text("id").primaryKey(),
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    deletedAt: text("deleted_at").notNull(),
    lastModified: integer("last_modified").notNull(),
  },
  (t) => ({
    idxModified: index("idx_deleted_log_modified").on(t.lastModified),
    idxTableRecord: index("idx_deleted_log_table").on(t.tableName, t.recordId),
  }),
);

export const syncSequence = sqliteTable("sync_sequence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  op: text("op", { enum: ["created", "updated", "deleted"] }).notNull(),
  syncedAt: text("synced_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey(),
  language: text("language").notNull().default("zh-CN"),
  firstDayOfWeek: integer("first_day_of_week").notNull().default(0),
  showEventTime: integer("show_event_time", { mode: "boolean" }).notNull().default(true),
  dateFormat: text("date_format").notNull().default("zh"),
  showLunarCalendar: integer("show_lunar_calendar", { mode: "boolean" }).notNull().default(false),
  showCourseSchedule: integer("show_course_schedule", { mode: "boolean" }).notNull().default(false),
});
