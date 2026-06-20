// ---- shared types (inlined from @calendar/shared) ----

export type ID = string;

export type CalendarRole = "viewer" | "editor" | "admin";

export type CalendarSourceType = "ics_import" | "ics_subscription" | "manual" | "auto_log";

export interface Calendar {
  id: ID;
  name: string;
  color: string;
  sourceUrl: string | null;
  sourceType: CalendarSourceType;
  ownerId: ID;
  createdAt: string;
  updatedAt: string;
  lastModified: number;
}

export interface Event {
  id: ID;
  calendarId: ID;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  rrule: string | null;
  color: string | null;
  location: string | null;
  parentId: ID | null;
  originalDate: string | null;
  deleted: boolean;
  rawIcs: string | null;
  createdAt: string;
  updatedAt: string;
  lastModified: number;
}

export interface UserSettings {
  userId: ID;
  language: string;
  firstDayOfWeek: number;
  showEventTime: boolean;
  dateFormat: string;
  showLunarCalendar: boolean;
  autoBackupCalendars?: string;
  autoBackupInterval?: number;
  defaultCalendarId?: string;
}

export interface SyncPullResponse {
  changes: {
    [tableName: string]: {
      created: Record<string, unknown>[];
      updated: Record<string, unknown>[];
      deleted: ID[];
    };
  };
  seq: number;
}
