import { eq, and, sql } from "drizzle-orm";
import type { SQLiteSelectQueryBuilder } from "drizzle-orm/sqlite-core";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { calendarMembers } from "../db/schema.js";
import type {
  ID,
  CalendarRole,
  PermissionContext,
  CalendarScoped,
  Permissioned,
} from "@calendar/shared";
import { roleGte } from "@calendar/shared";

const tablesWithCalendarId = new Set([
  "events",
  "todos",
  "event_overrides",
]);

const calendarIdColumnMap: Record<string, SQLiteColumn> = {
  events: calendarMembers.calendarId,
  todos: calendarMembers.calendarId,
};

function applyCalendarScope<T extends SQLiteSelectQueryBuilder>(
  qb: T,
  permission: PermissionContext,
  calendarIdField: string = "calendar_id",
): CalendarScoped<T> {
  return qb
    .leftJoin(
      calendarMembers,
      eq(
        calendarMembers.calendarId,
        sql.raw(`${calendarIdField}`),
      ),
    )
    .where(eq(calendarMembers.userId, permission.userId)) as CalendarScoped<T>;
}

export function withViewAccess<T extends SQLiteSelectQueryBuilder>(
  qb: T,
  permission: PermissionContext,
): Permissioned<CalendarScoped<T>> {
  return applyCalendarScope(qb, permission) as Permissioned<CalendarScoped<T>>;
}

export function requireRole(
  ctx: PermissionContext,
  calendarId: ID,
  minRole: CalendarRole,
): { ok: true } | { ok: false; reason: "forbidden" | "not_member" } {
  const role = ctx.roles.get(calendarId);
  if (!role) return { ok: false, reason: "not_member" };
  if (!roleGte(role, minRole)) return { ok: false, reason: "forbidden" };
  return { ok: true };
}

export type PermissionGuard = ReturnType<typeof createPermissionGuard>;

export function createPermissionGuard(ctx: PermissionContext) {
  return {
    canView(calendarId: ID) {
      return requireRole(ctx, calendarId, "viewer");
    },
    canEdit(calendarId: ID) {
      return requireRole(ctx, calendarId, "editor");
    },
    canAdmin(calendarId: ID) {
      return requireRole(ctx, calendarId, "admin");
    },
    isOwner(calendarId: ID, ownerId: ID) {
      return ctx.userId === ownerId;
    },
  };
}
