import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, sessions, calendarMembers, calendars, userSettings } from "../db/schema.js";
import type { ID } from "../types.js";
import { config } from "../config.js";

const SESSION_DURATION_MS = config.sessionDurationMs;

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  return bytesToHex(new Uint8Array(bits));
}

export async function register(username: string, password: string): Promise<{ userId: string } | null> {
  const existing = await db.select().from(users).where(eq(users.username, username));
  if (existing.length > 0) return null;

  const userId = crypto.randomUUID();
  const salt = randomHex(16);
  const passwordHash = (await hashPassword(password, salt)) + ":" + salt;
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

  await db.insert(userSettings).values({
    userId,
  });

  return { userId };
}

export async function login(username: string, password: string): Promise<{ userId: string; sessionId: string } | null> {
  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user) return null;

  const [storedHash, salt] = user.passwordHash.split(":");
  const inputHash = await hashPassword(password, salt);

  if (!safeEqual(storedHash, inputHash)) return null;

  const sessionId = randomHex(32);
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
  const inputHash = await hashPassword(oldPassword, salt);

  if (!safeEqual(storedHash, inputHash)) return false;

  const newSalt = randomHex(16);
  const newHash = (await hashPassword(newPassword, newSalt)) + ":" + newSalt;

  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
  return true;
}

export async function hasUsers(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}
