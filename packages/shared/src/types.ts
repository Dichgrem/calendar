export type ID = string;

export type Priority = "high" | "medium" | "low" | "none";

export const PRIORITY_VALUES: Priority[] = ["high", "medium", "low", "none"];

export type TodoStatus = "todo" | "in_progress" | "completed";

export const TODO_STATUS_VALUES: TodoStatus[] = ["todo", "in_progress", "completed"];

export type CalendarRole = "viewer" | "editor" | "admin";

export const CALENDAR_ROLE_VALUES: CalendarRole[] = ["viewer", "editor", "admin"];

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

export interface CalendarMember {
  calendarId: ID;
  userId: ID;
  role: CalendarRole;
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

export interface EventOverride {
  id: ID;
  parentId: ID;
  originalDate: string;
  overrideStart: string | null;
  overrideEnd: string | null;
  overrideTitle: string | null;
  deleted: boolean;
  lastModified: number;
}

export interface Todo {
  id: ID;
  calendarId: ID;
  listId: ID | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: TodoStatus;
  completedAt: string | null;
  dueDate: string | null;
  dueTime: string | null;
  rrule: string | null;
  sortOrder: number;
  parentId: ID | null;
  createdAt: string;
  updatedAt: string;
  lastModified: number;
}

export interface TodoList {
  id: ID;
  name: string;
  color: string | null;
  userId: ID;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  lastModified: number;
}

export interface DeletedRecord {
  id: ID;
  tableName: string;
  recordId: ID;
  deletedAt: string;
  lastModified: number;
}

export interface UserSettings {
  userId: ID;
  timezone: string;
  language: string;
  defaultReminderBefore: number;
  firstDayOfWeek: number;
  showCompletedTodos: boolean;
}

export interface ServerSettings {
  syncIntervalMinutes: number;
  pushSubscription: PushSubscriptionJSON | null;
}
