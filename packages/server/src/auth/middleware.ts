import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { PermissionContext, CalendarRole, ID } from "../types.js";
import { db } from "../db/client.js";
import { calendarMembers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { validateSession } from "./auth.service.js";

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

function extractSessionId(c: Context): string | undefined {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return getCookie(c, "session_token");
}

export async function authMiddleware(c: Context, next: Next) {
  const sessionId = extractSessionId(c);

  if (sessionId) {
    const session = await validateSession(sessionId);
    if (session) {
      c.set("permission", await resolvePermissionContext(session.userId));
      return next();
    }
  }

  return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
}
