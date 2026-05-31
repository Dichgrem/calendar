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

export interface SyncPushResponse {
  ok: true;
  seq: number;
}

export interface SyncPushConflict {
  ok: false;
  error: {
    code: "CONFLICT";
    message: string;
    conflictingIds: ID[];
  };
}

export type SyncPushResult = SyncPushResponse | SyncPushConflict;

declare const CalendarScopedBrand: unique symbol;
export type CalendarScoped<T> = T & { [CalendarScopedBrand]: true };

declare const PermissionedBrand: unique symbol;
export type Permissioned<T> = T & { [PermissionedBrand]: true };

export interface PermissionContext {
  userId: ID;
  roles: Map<ID, CalendarRole>;
}

export function roleGte(role: CalendarRole, min: CalendarRole): boolean {
  const rank: Record<CalendarRole, number> = {
    viewer: 0,
    editor: 1,
    admin: 2,
  };
  return rank[role] >= rank[min];
}
