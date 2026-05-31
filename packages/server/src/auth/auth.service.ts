import { randomBytes, timingSafeEqual } from "node:crypto";
import scrypt from "scrypt-js";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, sessions, calendarMembers, calendars } from "../db/schema.js";
import type { ID } from "../types.js";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password: string, salt: string): string {
  const passwordBytes = new TextEncoder().encode(password);
  const saltBytes = new TextEncoder().encode(salt);
  const key = scrypt.syncScrypt(passwordBytes, saltBytes, 16384, 8, 1, 64);
  return Buffer.from(key).toString("hex");
}

export async function register(username: string, password: string): Promise<{ userId: string } | null> {
  const existing = await db.select().from(users).where(eq(users.username, username));
  if (existing.length > 0) return null;

  const userId = crypto.randomUUID();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt) + ":" + salt;
  const now = new Date().toISOString();

  await db.insert(users).values({
    id: userId,
    username,
    passwordHash,
    createdAt: now,
  });

  const calendarId = crypto.randomUUID();
  await db.insert(calendars).values({
    id: calendarId,
    name: "默认日历",
    color: "#3b82f6",
    sourceType: "manual",
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
    lastModified: Date.now(),
  });

  await db.insert(calendarMembers).values({
    calendarId,
    userId,
    role: "admin",
  });

  return { userId };
}

export async function login(username: string, password: string): Promise<{ userId: string; sessionId: string } | null> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user) return null;

  const [storedHash, salt] = user.passwordHash.split(":");
  const inputHash = hashPassword(password, salt);

  const storedBuf = Buffer.from(storedHash, "hex");
  const inputBuf = Buffer.from(inputHash, "hex");

  if (storedBuf.length !== inputBuf.length || !timingSafeEqual(storedBuf, inputBuf)) {
    return null;
  }

  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    expiresAt,
  });

  return { userId: user.id, sessionId };
}

export async function validateSession(sessionId: string): Promise<{ userId: string } | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return null;

  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  return { userId: session.userId };
}

export async function logout(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return false;

  const [storedHash, salt] = user.passwordHash.split(":");
  const inputHash = hashPassword(oldPassword, salt);
  const storedBuf = Buffer.from(storedHash, "hex");
  const inputBuf = Buffer.from(inputHash, "hex");

  if (storedBuf.length !== inputBuf.length || !timingSafeEqual(storedBuf, inputBuf)) {
    return false;
  }

  const newSalt = randomBytes(16).toString("hex");
  const newHash = hashPassword(newPassword, newSalt) + ":" + newSalt;

  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
  return true;
}

export async function hasUsers(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}
