import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { PermissionContext, CalendarRole, ID } from "@calendar/shared";
import { db } from "../db/client.js";
import { calendarMembers } from "../db/schema.js";
import { eq } from "drizzle-orm";

declare module "hono" {
  interface ContextVariableMap {
    permission: PermissionContext;
  }
}

async function resolvePermissionContext(userId: ID): Promise<PermissionContext> {
  const rows = await db
    .select({
      calendarId: calendarMembers.calendarId,
      role: calendarMembers.role,
    })
    .from(calendarMembers)
    .where(eq(calendarMembers.userId, userId));

  const roles = new Map<ID, CalendarRole>();
  for (const row of rows) {
    roles.set(row.calendarId, row.role as CalendarRole);
  }

  return { userId, roles };
}

export async function authMiddleware(c: Context, next: Next) {
  const sessionToken =
    c.req.header("Authorization")?.replace("Bearer ", "") ??
    getCookie(c, "session_token");

  if (!sessionToken) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Missing session" } }, 401);
  }

  try {
    const userId = sessionToken;
    c.set("permission", await resolvePermissionContext(userId));
  } catch {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } }, 401);
  }

  await next();
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const sessionToken =
    c.req.header("Authorization")?.replace("Bearer ", "") ??
    getCookie(c, "session_token");

  if (sessionToken) {
    try {
      const userId = sessionToken;
      c.set("permission", await resolvePermissionContext(userId));
    } catch {
      //
    }
  }

  await next();
}
