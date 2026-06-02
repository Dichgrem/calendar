import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { PermissionContext, CalendarRole, ID } from "../types.js";
import { db } from "../db/client.js";
import { calendarMembers, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { validateSession } from "./auth.service.js";

declare module "hono" {
  interface ContextVariableMap {
    permission: PermissionContext;
    sessionId: ID;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const sessionId = await extractSessionId(c);

  if (sessionId) {
    // Basic Auth direct user lookup
    if (sessionId.startsWith("u:")) {
      const userId = sessionId.slice(2);
      c.set("sessionId", sessionId);
      c.set("permission", await resolvePermissionContext(userId));
      return next();
    }

    // Normal session
    const session = await validateSession(sessionId);
    if (session) {
      c.set("sessionId", sessionId);
      c.set("permission", await resolvePermissionContext(session.userId));
      return next();
    }
  }

  const resp = c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  if (c.req.path?.startsWith("/dav")) {
    resp.headers.set("WWW-Authenticate", 'Basic realm="Calendar"');
  }
  return resp;
}

async function resolvePermissionContext(userId: ID): Promise<PermissionContext> {
  const rows = await db
    .select({ calendarId: calendarMembers.calendarId, role: calendarMembers.role })
    .from(calendarMembers)
    .where(eq(calendarMembers.userId, userId));

  const roles = new Map<ID, CalendarRole>();
  for (const row of rows) roles.set(row.calendarId, row.role as CalendarRole);
  return { userId, roles };
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  const [hash, salt] = storedHash.split(":");
  if (!salt) return false;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  const inputHash = bytesToHex(new Uint8Array(bits));
  if (inputHash.length !== hash.length) return false;
  const a = new TextEncoder().encode(inputHash);
  const b = new TextEncoder().encode(hash);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function extractSessionId(c: Context): Promise<string | undefined> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return getCookie(c, "session_token");
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  if (authHeader.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const colonIdx = decoded.indexOf(":");
    if (colonIdx < 0) return undefined;
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    // Raw session token as password (backward compat)
    if (password.length === 64 && /^[0-9a-f]{64}$/.test(password)) return password;
    // Direct password verification - no session creation
    const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.username, username));
    if (!user || !(await verifyPassword(user.passwordHash, password))) return undefined;
    return `u:${user.id}`;
  }
  return undefined;
}
