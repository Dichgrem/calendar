import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { calendars, calendarMembers, syncSequence } from "../db/schema.js";
import type { Calendar, ID, PermissionContext } from "../types.js";
import { createPermissionGuard } from "../auth/permissions.query.js";

async function logSync(tableName: string, recordId: ID, op: string) {
  await db.insert(syncSequence).values({
    tableName,
    recordId,
    op,
    syncedAt: new Date().toISOString(),
  });
}

export async function listCalendars(userId: ID): Promise<Calendar[]> {
  const rows = await db
    .select({
      id: calendars.id,
      name: calendars.name,
      color: calendars.color,
      sourceUrl: calendars.sourceUrl,
      sourceType: calendars.sourceType,
      ownerId: calendars.ownerId,
      createdAt: calendars.createdAt,
      updatedAt: calendars.updatedAt,
      lastModified: calendars.lastModified,
    })
    .from(calendars)
    .innerJoin(calendarMembers, eq(calendars.id, calendarMembers.calendarId))
    .where(eq(calendarMembers.userId, userId))
    .orderBy(desc(calendars.createdAt));

  return rows as Calendar[];
}

export async function getCalendar(calendarId: ID, userId: ID): Promise<Calendar | null> {
  const rows = await db
    .select({
      id: calendars.id,
      name: calendars.name,
      color: calendars.color,
      sourceUrl: calendars.sourceUrl,
      sourceType: calendars.sourceType,
      ownerId: calendars.ownerId,
      createdAt: calendars.createdAt,
      updatedAt: calendars.updatedAt,
      lastModified: calendars.lastModified,
    })
    .from(calendars)
    .innerJoin(calendarMembers, eq(calendars.id, calendarMembers.calendarId))
    .where(and(eq(calendarMembers.userId, userId), eq(calendars.id, calendarId)));

  return (rows[0] as Calendar) ?? null;
}

export async function createCalendar(
  data: { name: string; color?: string; sourceUrl?: string; sourceType?: string },
  ownerId: ID,
): Promise<Calendar> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const lmod = Date.now();

  await db.insert(calendars).values({
    id,
    name: data.name,
    color: data.color ?? "#3b82f6",
    sourceUrl: data.sourceUrl ?? null,
    sourceType: (data.sourceType as Calendar["sourceType"]) ?? "manual",
    ownerId,
    createdAt: now,
    updatedAt: now,
    lastModified: lmod,
  });

  await db.insert(calendarMembers).values({
    calendarId: id,
    userId: ownerId,
    role: "admin",
  });

  await logSync("calendars", id, "created");

  return (await getCalendar(id, ownerId))!;
}

export async function updateCalendar(
  calendarId: ID,
  data: { name?: string; color?: string; sourceUrl?: string },
  permission: PermissionContext,
): Promise<Calendar | null> {
  const guard = createPermissionGuard(permission);
  const check = guard.canEdit(calendarId);
  if (!check.ok) return null;

  const lmod = Date.now();
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    lastModified: lmod,
  };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.sourceUrl !== undefined) updateData.sourceUrl = data.sourceUrl;

  await db.update(calendars).set(updateData).where(eq(calendars.id, calendarId));

  await logSync("calendars", calendarId, "updated");

  return await getCalendar(calendarId, permission.userId);
}

export async function deleteCalendar(
  calendarId: ID,
  permission: PermissionContext,
): Promise<boolean> {
  const guard = createPermissionGuard(permission);
  const check = guard.canAdmin(calendarId);
  if (!check.ok) return false;

  await db.delete(calendars).where(eq(calendars.id, calendarId));
  await logSync("calendars", calendarId, "deleted");

  return true;
}
