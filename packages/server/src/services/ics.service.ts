import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { calendars, events, calendarMembers } from "../db/schema.js";
import type { ID } from "../types.js";
import type { ParsedCalendar } from "./ics-parser.js";
import { parseIcsContent, normalizeDt, isAllDay, getProp } from "./ics-parser.js";
import { serializeIcsCalendar } from "./ics-serializer.js";

export { parseIcsContent, serializeIcsCalendar };
export type { ParsedCalendar };

export interface IcsPreview {
  name: string;
  eventCount: number;
  timeSpan: { from: string | null; to: string | null };
  items: IcsPreviewItem[];
}

export interface IcsPreviewItem {
  type: "event";
  uid: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  rrule: string | null;
  selected: boolean;
}

export function buildPreview(parsed: ParsedCalendar): IcsPreview {
  const items: IcsPreviewItem[] = [];
  let eventCount = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const c of parsed.components) {
    if (c.type === "VEVENT") {
      eventCount++;
      const startAt = getProp(c, "DTSTART");
      const endAt = getProp(c, "DTEND");
      if (startAt && (!earliest || startAt < earliest)) earliest = startAt;
      if (endAt && (!latest || endAt > latest)) latest = endAt;

      items.push({
        type: "event",
        uid: c.uid,
        title: getProp(c, "SUMMARY") || "(Untitled)",
        startAt: normalizeDt(startAt),
        endAt: normalizeDt(endAt),
        rrule: getProp(c, "RRULE"),
        selected: true,
      });
    }
  }

  return {
    name: parsed.name,
    eventCount,
    timeSpan: { from: earliest, to: latest },
    items,
  };
}

function ensureMemberJoin(calendarId: ID, userId: ID) {
  return db
    .select({ one: sql`1` })
    .from(calendarMembers)
    .where(and(eq(calendarMembers.calendarId, calendarId), eq(calendarMembers.userId, userId)))
    .limit(1);
}

export async function importIcsToCalendar(
  calendarId: ID,
  parsed: ParsedCalendar,
  selectedUids: Set<string>,
  userId: ID,
  overwrite: boolean,
): Promise<{ eventCount: number } | null> {
  const memberCheck = await ensureMemberJoin(calendarId, userId);
  if (!memberCheck.length) return null;

  let eventCount = 0;

  const now = new Date().toISOString();
  const lmod = Date.now();

  await db.transaction(async (tx) => {
    if (overwrite) {
      await tx.delete(events).where(eq(events.calendarId, calendarId));
    }

    for (const c of parsed.components) {
      if (c.type !== "VEVENT" || !selectedUids.has(c.uid)) continue;

      const startAt = normalizeDt(getProp(c, "DTSTART")) ?? now;
      const endAt = normalizeDt(getProp(c, "DTEND")) ?? now;
      const allDay = isAllDay(c);

      await tx
        .insert(events)
        .values({
          id: c.uid || crypto.randomUUID(),
          calendarId,
          title: getProp(c, "SUMMARY") || "(Untitled)",
          description: getProp(c, "DESCRIPTION"),
          startAt,
          endAt,
          allDay,
          rrule: getProp(c, "RRULE"),
          location: getProp(c, "LOCATION"),
          rawIcs: c.rawIcs,
          createdAt: now,
          updatedAt: now,
          lastModified: lmod,
        })
        .onConflictDoUpdate({
          target: [events.id],
          set: {
            title: getProp(c, "SUMMARY") || "(Untitled)",
            description: getProp(c, "DESCRIPTION"),
            startAt,
            endAt,
            allDay,
            rrule: getProp(c, "RRULE"),
            location: getProp(c, "LOCATION"),
            rawIcs: c.rawIcs,
            updatedAt: now,
            lastModified: lmod,
          },
        });
      eventCount++;
    }
  });

  return { eventCount };
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  if (hostname.startsWith("172.")) {
    const second = parseInt(hostname.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (hostname.startsWith("169.254.")) return true;
  return false;
}

export async function fetchIcsFromUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Fetching from private/internal addresses is not allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CalendarApp/1.0",
        Accept: "text/calendar, text/plain, */*",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      throw new Error("Response too large (max 10MB)");
    }

    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function exportIcs(
  calendarId: ID,
  start: string | undefined,
  end: string | undefined,
  userId: ID,
): Promise<{ filename: string; content: string } | null> {
  const [cal] = await db
    .select({ name: calendars.name })
    .from(calendars)
    .innerJoin(calendarMembers, eq(calendars.id, calendarMembers.calendarId))
    .where(and(eq(calendars.id, calendarId), eq(calendarMembers.userId, userId)));

  if (!cal) return null;

  const eventConditions = [eq(events.calendarId, calendarId), eq(events.deleted, false)];
  if (start) eventConditions.push(gte(events.startAt, start));
  if (end) eventConditions.push(lte(events.endAt, end));

  const evs = await db
    .select()
    .from(events)
    .where(and(...eventConditions));

  const content = serializeIcsCalendar(cal.name, evs);
  const filename = `${cal.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}.ics`;

  return { filename, content };
}
