import { eq, and, gte, lte, or, isNull, sql, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { events, eventOverrides, calendarMembers, syncSequence } from "../db/schema.js";
import type { ID } from "../types.js";

async function logSync(tableName: string, recordId: ID, op: "created" | "updated" | "deleted") {
  await db.insert(syncSequence).values({
    tableName,
    recordId,
    op,
    syncedAt: new Date().toISOString(),
  } as any);
}

function ensureMemberJoin(calendarId: ID, userId: ID) {
  return db
    .select({ one: sql`1` })
    .from(calendarMembers)
    .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, userId)))
    .limit(1);
}

export interface EventRow {
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

export interface ExpandedEvent extends EventRow {
  overrideId?: ID;
  overrideStart?: string;
  overrideEnd?: string;
  overrideTitle?: string;
  instanceDate: string;
}

export async function listEvents(
  calendarId: ID,
  rangeStart: string,
  rangeEnd: string,
  userId: ID,
): Promise<EventRow[]> {
  const memberCheck = await ensureMemberJoin(calendarId, userId);
  if (!memberCheck.length) return [];

  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.calendarId, calendarId),
        eq(events.deleted, false),
        or(
          isNotNull(events.rrule),
          and(gte(events.startAt, rangeStart), lte(events.endAt, rangeEnd)),
        ),
      ),
    );

  return rows as EventRow[];
}

export async function getEvent(eventId: ID, userId: ID): Promise<EventRow | null> {
  const rows = await db
    .select()
    .from(events)
    .innerJoin(calendarMembers, eq(events.calendarId, calendarMembers.calendarId))
    .where(and(eq(events.id, eventId), eq(calendarMembers.userId, userId)));

  if (!rows.length) return null;
  return rows[0].events as EventRow;
}

export async function createEvent(
  calendarId: ID,
  data: {
    title: string;
    description?: string | null;
    startAt: string;
    endAt: string;
    allDay?: boolean;
    rrule?: string | null;
    color?: string | null;
    location?: string | null;
  },
  userId: ID,
): Promise<EventRow | null> {
  const memberCheck = await ensureMemberJoin(calendarId, userId);
  if (!memberCheck.length) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const lmod = Date.now();

  await db.insert(events).values({
    id,
    calendarId,
    title: data.title,
    description: data.description ?? null,
    startAt: data.startAt,
    endAt: data.endAt,
    allDay: data.allDay ?? false,
    rrule: data.rrule ?? null,
    color: data.color ?? null,
    location: data.location ?? null,
    createdAt: now,
    updatedAt: now,
    lastModified: lmod,
  });

  await logSync("events", id, "created");

  return await getEvent(id, userId);
}

export async function updateEvent(
  eventId: ID,
  data: {
    title?: string;
    description?: string | null;
    startAt?: string;
    endAt?: string;
    allDay?: boolean;
    rrule?: string | null;
    color?: string | null;
    location?: string | null;
    deleted?: boolean;
  },
  userId: ID,
): Promise<EventRow | null> {
  const current = await getEvent(eventId, userId);
  if (!current) return null;

  const lmod = Date.now();
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    lastModified: lmod,
  };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.startAt !== undefined) updateData.startAt = data.startAt;
  if (data.endAt !== undefined) updateData.endAt = data.endAt;
  if (data.allDay !== undefined) updateData.allDay = data.allDay;
  if (data.rrule !== undefined) updateData.rrule = data.rrule;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.deleted !== undefined) updateData.deleted = data.deleted;

  await db.update(events).set(updateData).where(eq(events.id, eventId));
  await logSync("events", eventId, "updated");

  return await getEvent(eventId, userId);
}

export async function deleteEvent(eventId: ID, userId: ID): Promise<boolean> {
  const current = await getEvent(eventId, userId);
  if (!current) return false;

  await db.update(events).set({ deleted: true, updatedAt: new Date().toISOString(), lastModified: Date.now() }).where(eq(events.id, eventId));
  await logSync("events", eventId, "deleted");

  return true;
}

export async function createOverride(
  parentId: ID,
  data: {
    originalDate: string;
    overrideStart?: string;
    overrideEnd?: string;
    overrideTitle?: string;
    deleted?: boolean;
  },
  userId: ID,
): Promise<boolean> {
  const parent = await getEvent(parentId, userId);
  if (!parent) return false;

  const lmod = Date.now();

  const existing = await db
    .select({ id: eventOverrides.id })
    .from(eventOverrides)
    .where(
      and(
        eq(eventOverrides.parentId, parentId),
        eq(eventOverrides.originalDate, data.originalDate),
      ),
    );

  let overrideId = existing[0]?.id ?? crypto.randomUUID();

  await db
    .insert(eventOverrides)
    .values({
      id: overrideId,
      parentId,
      originalDate: data.originalDate,
      overrideStart: data.overrideStart ?? null,
      overrideEnd: data.overrideEnd ?? null,
      overrideTitle: data.overrideTitle ?? null,
      deleted: data.deleted ?? false,
      lastModified: lmod,
    })
    .onConflictDoUpdate({
      target: [eventOverrides.parentId, eventOverrides.originalDate],
      set: {
        overrideStart: data.overrideStart ?? null,
        overrideEnd: data.overrideEnd ?? null,
        overrideTitle: data.overrideTitle ?? null,
        deleted: data.deleted ?? false,
        lastModified: lmod,
      },
    });

  await logSync("event_overrides", overrideId, "created");
  return true;
}
