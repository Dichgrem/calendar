import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { calendars, events, todos, calendarMembers } from "../db/schema.js";
import type { ID } from "@calendar/shared";

interface ParsedComponent {
  type: "VEVENT" | "VTODO";
  uid: string;
  props: Record<string, string>;
}

interface ParsedCalendar {
  name: string;
  components: ParsedComponent[];
}

function unfoldLines(text: string): string {
  return text.replace(/\r?\n\s/g, "");
}

function parseProperty(
  line: string,
): { name: string; params: Record<string, string>; value: string } | null {
  const m = line.match(/^([^;:]+)(?:;(.+?))?:(.*)$/);
  if (!m) return null;

  const name = m[1].toUpperCase();
  const paramsStr = m[2];
  const value = m[3];

  const params: Record<string, string> = {};
  if (paramsStr) {
    for (const part of paramsStr.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
    }
  }

  return { name, params, value };
}

export function parseIcs(raw: string): ParsedCalendar {
  const text = unfoldLines(raw);
  const lines = text.split(/\r?\n/);

  const cal: ParsedCalendar = { name: "Imported Calendar", components: [] };
  let inVcal = false;
  let inComponent: "VEVENT" | "VTODO" | null = null;
  let current: ParsedComponent | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const prop = parseProperty(trimmed);
    if (!prop) continue;

    if (prop.name === "BEGIN") {
      if (prop.value === "VCALENDAR") {
        inVcal = true;
      } else if (prop.value === "VEVENT" || prop.value === "VTODO") {
        inComponent = prop.value;
        current = { type: prop.value, uid: "", props: {} };
      }
    } else if (prop.name === "END") {
      if (prop.value === "VCALENDAR") {
        inVcal = false;
      } else if (prop.value === "VEVENT" || prop.value === "VTODO") {
        if (current) cal.components.push(current);
        inComponent = null;
        current = null;
      }
    } else if (inComponent && current) {
      if (prop.name === "UID") {
        current.uid = prop.value;
      }
      current.props[prop.name] = prop.value;
    } else if (inVcal && !inComponent) {
      if (prop.name === "X-WR-CALNAME") {
        cal.name = prop.value;
      }
    }
  }

  return cal;
}

function formatIcsLine(name: string, value: string | null | undefined): string {
  if (!value) return "";
  const safe = value.replace(/\r?\n/g, "\\n");
  if (safe.length <= 70) return `${name}:${safe}\r\n`;
  return `${name}:${safe.slice(0, 70)}\r\n ${safe.slice(70)}`;
}

export function serializeIcsCalendar(
  calName: string,
  events: {
    id: string;
    title: string;
    description: string | null;
    startAt: string;
    endAt: string;
    allDay: boolean;
    rrule: string | null;
    location: string | null;
    createdAt: string;
  }[],
  todos: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    completedAt: string | null;
    dueDate: string | null;
    priority: string;
    createdAt: string;
  }[],
): string {
  const lines: string[] = ["BEGIN:VCALENDAR\r\n"];
  lines.push("VERSION:2.0\r\n");
  lines.push(`PRODID:-//Calendar App//EN\r\n`);
  lines.push(`X-WR-CALNAME:${calName}\r\n`);

  for (const e of events) {
    lines.push("BEGIN:VEVENT\r\n");
    lines.push(formatIcsLine("UID", e.id));
    lines.push(formatIcsLine("DTSTAMP", e.createdAt));
    lines.push(formatIcsLine("SUMMARY", e.title));
    if (e.description) lines.push(formatIcsLine("DESCRIPTION", e.description));
    if (e.allDay) {
      const dtStart = e.startAt.slice(0, 10);
      const dtEnd = e.endAt.slice(0, 10);
      const nextDay = new Date(dtEnd);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const dtEndNext = nextDay.toISOString().slice(0, 10);
      lines.push(formatIcsLine("DTSTART;VALUE=DATE", dtStart.replace(/-/g, "")));
      lines.push(formatIcsLine("DTEND;VALUE=DATE", dtEndNext.replace(/-/g, "")));
    } else {
      lines.push(formatIcsLine("DTSTART", e.startAt.replace(/[-:]/g, "")));
      lines.push(formatIcsLine("DTEND", e.endAt.replace(/[-:]/g, "")));
    }
    if (e.rrule) lines.push(formatIcsLine("RRULE", e.rrule));
    if (e.location) lines.push(formatIcsLine("LOCATION", e.location));
    lines.push("END:VEVENT\r\n");
  }

  for (const t of todos) {
    lines.push("BEGIN:VTODO\r\n");
    lines.push(formatIcsLine("UID", t.id));
    lines.push(formatIcsLine("DTSTAMP", t.createdAt));
    lines.push(formatIcsLine("SUMMARY", t.title));
    if (t.description) lines.push(formatIcsLine("DESCRIPTION", t.description));
    const status = t.status === "completed" ? "COMPLETED" : "NEEDS-ACTION";
    lines.push(formatIcsLine("STATUS", status));
    if (t.completedAt) lines.push(formatIcsLine("COMPLETED", t.completedAt.replace(/[-:]/g, "")));
    if (t.dueDate) lines.push(formatIcsLine("DUE", t.dueDate.replace(/-/g, "")));
    lines.push(
      formatIcsLine("PRIORITY", t.priority === "high" ? "1" : t.priority === "medium" ? "5" : "9"),
    );
    lines.push("END:VTODO\r\n");
  }

  lines.push("END:VCALENDAR\r\n");
  return lines.join("");
}

export interface IcsPreview {
  name: string;
  eventCount: number;
  todoCount: number;
  timeSpan: { from: string | null; to: string | null };
  items: IcsPreviewItem[];
}

export interface IcsPreviewItem {
  type: "event" | "todo";
  uid: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  dueDate: string | null;
  rrule: string | null;
  selected: boolean;
}

export function buildPreview(parsed: ParsedCalendar): IcsPreview {
  const items: IcsPreviewItem[] = [];
  let eventCount = 0;
  let todoCount = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const c of parsed.components) {
    if (c.type === "VEVENT") {
      eventCount++;
      const startAt = c.props["DTSTART"] || c.props["DTSTART;VALUE=DATE"] || null;
      const endAt = c.props["DTEND"] || c.props["DTEND;VALUE=DATE"] || null;
      if (startAt && (!earliest || startAt < earliest)) earliest = startAt;
      if (endAt && (!latest || endAt > latest)) latest = endAt;

      items.push({
        type: "event",
        uid: c.uid,
        title: c.props["SUMMARY"] || "(Untitled)",
        startAt: normalizeDt(startAt),
        endAt: normalizeDt(endAt),
        dueDate: null,
        rrule: c.props["RRULE"] || null,
        selected: true,
      });
    } else if (c.type === "VTODO") {
      todoCount++;
      const due = c.props["DUE"] || null;

      items.push({
        type: "todo",
        uid: c.uid,
        title: c.props["SUMMARY"] || "(Untitled)",
        startAt: null,
        endAt: null,
        dueDate: normalizeDt(due),
        rrule: null,
        selected: true,
      });
    }
  }

  return {
    name: parsed.name,
    eventCount,
    todoCount,
    timeSpan: { from: earliest, to: latest },
    items,
  };
}

function normalizeDt(dt: string | null): string | null {
  if (!dt) return null;
  const cleaned = dt.replace(/^:/, "").replace(/\s.*$/, "");
  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  if (cleaned.length >= 15 && cleaned.includes("T")) {
    const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  }
  return cleaned;
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
): Promise<{ eventCount: number; todoCount: number } | null> {
  const memberCheck = await ensureMemberJoin(calendarId, userId);
  if (!memberCheck.length) return null;

  let eventCount = 0;
  let todoCount = 0;

  if (overwrite) {
    await db.delete(events).where(eq(events.calendarId, calendarId));
    await db.delete(todos).where(eq(todos.calendarId, calendarId));
  }

  const now = new Date().toISOString();
  const lmod = Date.now();

  for (const c of parsed.components) {
    if (!selectedUids.has(c.uid)) continue;

    const props = c.props;
    if (c.type === "VEVENT") {
      const startAt = normalizeDt(props["DTSTART"] || props["DTSTART;VALUE=DATE"]) ?? now;
      const endAt = normalizeDt(props["DTEND"] || props["DTEND;VALUE=DATE"]) ?? now;
      const allDay = !!props["DTSTART;VALUE=DATE"];

      await db
        .insert(events)
        .values({
          id: c.uid || crypto.randomUUID(),
          calendarId,
          title: props["SUMMARY"] || "(Untitled)",
          description: props["DESCRIPTION"] || null,
          startAt,
          endAt,
          allDay,
          rrule: props["RRULE"] || null,
          location: props["LOCATION"] || null,
          createdAt: now,
          updatedAt: now,
          lastModified: lmod,
        })
        .onConflictDoUpdate({
          target: [events.id],
          set: {
            title: props["SUMMARY"] || "(Untitled)",
            description: props["DESCRIPTION"] || null,
            startAt,
            endAt,
            allDay,
            rrule: props["RRULE"] || null,
            location: props["LOCATION"] || null,
            updatedAt: now,
            lastModified: lmod,
          },
        });
      eventCount++;
    } else if (c.type === "VTODO") {
      const dueDate = normalizeDt(props["DUE"]);
      const status =
        props["STATUS"] === "COMPLETED"
          ? ("completed" as const)
          : props["STATUS"] === "IN-PROCESS"
            ? ("in_progress" as const)
            : ("todo" as const);
      const priority =
        props["PRIORITY"] === "1"
          ? ("high" as const)
          : props["PRIORITY"] === "5"
            ? ("medium" as const)
            : props["PRIORITY"] === "9"
              ? ("low" as const)
              : ("none" as const);

      await db
        .insert(todos)
        .values({
          id: c.uid || crypto.randomUUID(),
          calendarId,
          title: props["SUMMARY"] || "(Untitled)",
          description: props["DESCRIPTION"] || null,
          priority,
          status,
          dueDate,
          dueTime: null,
          createdAt: now,
          updatedAt: now,
          lastModified: lmod,
        })
        .onConflictDoUpdate({
          target: [todos.id],
          set: {
            title: props["SUMMARY"] || "(Untitled)",
            description: props["DESCRIPTION"] || null,
            priority,
            status,
            dueDate,
            updatedAt: now,
            lastModified: lmod,
          },
        });
      todoCount++;
    }
  }

  return { eventCount, todoCount };
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

  const todoConditions = [eq(todos.calendarId, calendarId)];
  if (start) todoConditions.push(gte(todos.dueDate, start));
  if (end) todoConditions.push(lte(todos.dueDate, end));

  const tds = await db
    .select()
    .from(todos)
    .where(and(...todoConditions));

  const content = serializeIcsCalendar(cal.name, evs, tds);
  const filename = `${cal.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}.ics`;

  return { filename, content };
}
