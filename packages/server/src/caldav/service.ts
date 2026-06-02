import { db } from "../db/client.js";
import { calendars, events, calendarMembers } from "../db/schema.js";
import { eq, and, gte, lte, or, isNotNull, sql } from "drizzle-orm";
import { parseIcsContent, serializeIcsCalendar } from "../services/ics.service.js";
import type { ID } from "../types.js";

export interface CalDavCalendar {
  id: ID;
  name: string;
  color: string;
  displayName: string;
}

export async function caldavListCalendars(userId: ID): Promise<CalDavCalendar[]> {
  const rows = await db
    .select({
      id: calendars.id,
      name: calendars.name,
      color: calendars.color,
      ownerId: calendars.ownerId,
    })
    .from(calendars)
    .innerJoin(calendarMembers, eq(calendars.id, calendarMembers.calendarId))
    .where(eq(calendarMembers.userId, userId));

  return rows.map((r: { id: string; name: string; color: string; ownerId: string }) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    displayName: r.name,
  }));
}

export async function caldavGetCalendar(id: ID, userId: ID): Promise<CalDavCalendar | null> {
  const rows = await db
    .select({
      id: calendars.id,
      name: calendars.name,
      color: calendars.color,
    })
    .from(calendars)
    .innerJoin(calendarMembers, eq(calendars.id, calendarMembers.calendarId))
    .where(and(eq(calendars.id, id), eq(calendarMembers.userId, userId)));

  if (!rows.length) return null;
  return { id: rows[0].id, name: rows[0].name, color: rows[0].color, displayName: rows[0].name };
}

export async function caldavListEvents(
  calendarId: ID,
  rangeStart: string | undefined,
  rangeEnd: string | undefined,
  userId: ID,
): Promise<string[]> {
  const memberCheck = await db
    .select({ one: sql`1` })
    .from(calendarMembers)
    .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, userId)))
    .limit(1);
  if (!memberCheck.length) return [];

  const conditions = [eq(events.calendarId, calendarId), eq(events.deleted, false)];

  if (rangeStart && rangeEnd) {
    conditions.push(
      or(isNotNull(events.rrule), and(gte(events.startAt, rangeStart), lte(events.endAt, rangeEnd)))!,
    );
  }

  const evts = await db.select().from(events).where(and(...conditions));

  return evts.map((e: typeof events.$inferSelect) => {
    const cal = { name: "" }; // cached on call site
    return serializeIcsCalendar(cal.name, [e]);
  });
}

export async function caldavGetEvent(
  calendarId: ID,
  uid: string,
  userId: ID,
): Promise<string | null> {
  const memberCheck = await db
    .select({ one: sql`1` })
    .from(calendarMembers)
    .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, userId)))
    .limit(1);
  if (!memberCheck.length) return null;

  const [evt] = await db
    .select()
    .from(events)
    .where(and(eq(events.calendarId, calendarId), eq(events.id, uid), eq(events.deleted, false)));

  if (!evt) return null;
  return serializeIcsCalendar("", [evt]);
}

export async function caldavPutEvent(
  calendarId: ID,
  uid: string,
  icsData: string,
  userId: ID,
): Promise<boolean> {
  const memberCheck = await db
    .select({ one: sql`1` })
    .from(calendarMembers)
    .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, userId)))
    .limit(1);
  if (!memberCheck.length) return false;

  const parsed = parseIcsContent(icsData);
  const vevent = parsed.components[0];
  if (!vevent || vevent.type !== "VEVENT") return false;

  const title = vevent.props["SUMMARY"] || "(Untitled)";
  const startAt = vevent.props["DTSTART"] || new Date().toISOString();
  const endAt = vevent.props["DTEND"] || startAt;
  const rrule = vevent.props["RRULE"] || null;
  const location = vevent.props["LOCATION"] || null;
  const description = vevent.props["DESCRIPTION"] || null;
  const allDay = /^\d{8}$/.test(startAt);

  const now = new Date().toISOString();
  const lmod = Date.now();

  const [existing] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.calendarId, calendarId), eq(events.id, uid)));

  if (existing) {
    await db
      .update(events)
      .set({ title, startAt, endAt, allDay, rrule, location, description, updatedAt: now, lastModified: lmod })
      .where(and(eq(events.calendarId, calendarId), eq(events.id, uid)));
  } else {
    await db.insert(events).values({
      id: uid,
      calendarId,
      title,
      startAt,
      endAt,
      allDay,
      rrule,
      location,
      description,
      rawIcs: vevent.rawIcs,
      createdAt: now,
      updatedAt: now,
      lastModified: lmod,
    });
  }

  return true;
}

export async function caldavDeleteEvent(
  calendarId: ID,
  uid: string,
  userId: ID,
): Promise<boolean> {
  const memberCheck = await db
    .select({ one: sql`1` })
    .from(calendarMembers)
    .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, userId)))
    .limit(1);
  if (!memberCheck.length) return false;

  await db
    .update(events)
    .set({ deleted: true, updatedAt: new Date().toISOString(), lastModified: Date.now() })
    .where(and(eq(events.calendarId, calendarId), eq(events.id, uid)));

  return true;
}
