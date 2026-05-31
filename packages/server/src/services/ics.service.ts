import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { calendars, events, calendarMembers } from "../db/schema.js";
import type { ID } from "../types.js";

interface ParsedComponent {
  type: "VEVENT";
  uid: string;
  props: Record<string, string>;
  params: Record<string, Record<string, string>>;
  rawIcs: string;
}

export interface ParsedCalendar {
  name: string;
  components: ParsedComponent[];
}

function parseIcsParams(paramStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of paramStr.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx > 0) {
      result[part.slice(0, eqIdx).toUpperCase()] = part.slice(eqIdx + 1).replace(/^"|"$/g, "");
    }
  }
  return result;
}

export function parseIcsContent(content: string): ParsedCalendar {
  const lines = content.replace(/\r\n /g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const cal: ParsedCalendar = { name: "Imported Calendar", components: [] };
  let current: ParsedComponent | null = null;
  let rawLines: string[] = [];
  let inAlarm = false;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { type: "VEVENT", uid: "", props: {}, params: {}, rawIcs: "" };
      rawLines = [line];
      inAlarm = false;
    } else if (line === "END:VEVENT" && current) {
      rawLines.push(line);
      current.rawIcs = rawLines.join("\r\n");
      cal.components.push(current);
      current = null;
      rawLines = [];
      inAlarm = false;
    } else if (current) {
      rawLines.push(line);
      if (line === "BEGIN:VALARM") {
        inAlarm = true;
        continue;
      }
      if (line === "END:VALARM") {
        inAlarm = false;
        continue;
      }
      if (inAlarm) continue;
      const m = line.match(/^([^;:]+)(?:;(.+?))?:(.*)$/s);
      if (m) {
        const key = m[1].toUpperCase();
        const value = m[3];
        current.props[key] = value;
        if (m[2]) current.params[key] = parseIcsParams(m[2]);
        if (key === "UID") current.uid = value;
      }
    } else {
      const m = line.match(/^X-WR-CALNAME:(.*)$/i);
      if (m) cal.name = m[1].trim();
    }
  }

  return cal;
}

function formatIcsLine(name: string, value: string | null | undefined): string {
  if (!value) return "";
  const safe = value.replace(/\r?\n/g, "\\n");
  if (safe.length <= 75) return `${name}:${safe}\r\n`;
  let result = `${name}:`;
  let remaining = safe;
  while (remaining.length > 75) {
    result += remaining.slice(0, 75) + "\r\n ";
    remaining = remaining.slice(75);
  }
  result += remaining + "\r\n";
  return result;
}

function sanitizeIcsDateTime(iso: string): string {
  const cleaned = iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const year = parseInt(cleaned.slice(0, 4), 10);
  if (year < 1970) return "1970" + cleaned.slice(4);
  return cleaned;
}

function sanitizeIcsDate(dateStr: string): string {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (year < 1970) return "1970" + dateStr.slice(4);
  return dateStr;
}

function extractExtraProperties(rawIcs: string): string[] {
  if (!rawIcs) return [];
  
  const supportedKeys = new Set([
    "UID", "DTSTAMP", "SUMMARY", "DESCRIPTION", "DTSTART", "DTEND",
    "DTSTART;VALUE=DATE", "DTEND;VALUE=DATE", "RRULE", "LOCATION"
  ]);
  
  const lines = rawIcs.split("\r\n");
  const extra: string[] = [];
  let inValarm = false;
  
  for (const line of lines) {
    if (line === "BEGIN:VALARM") {
      inValarm = true;
      extra.push(line);
      continue;
    }
    if (line === "END:VALARM") {
      inValarm = false;
      extra.push(line);
      continue;
    }
    if (inValarm) {
      extra.push(line);
      continue;
    }
    if (line.startsWith("BEGIN:") || line.startsWith("END:")) continue;
    
    const keyMatch = line.match(/^([A-Z-]+(?:;[A-Z-]+=[^;:]+)*)/i);
    if (keyMatch) {
      const key = keyMatch[1].toUpperCase();
      if (!supportedKeys.has(key)) {
        extra.push(line);
      }
    }
  }
  
  return extra;
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
    rawIcs: string | null;
  }[],
): string {
  const lines: string[] = ["BEGIN:VCALENDAR\r\n"];
  lines.push("VERSION:2.0\r\n");
  lines.push(`PRODID:-//Calendar App//EN\r\n`);
  lines.push(`CALSCALE:GREGORIAN\r\n`);
  lines.push(`X-WR-CALNAME:${calName}\r\n`);

  for (const e of events) {
    lines.push("BEGIN:VEVENT\r\n");
    lines.push(formatIcsLine("UID", e.id));
    lines.push(formatIcsLine("DTSTAMP", sanitizeIcsDateTime(e.createdAt)));
    lines.push(formatIcsLine("SUMMARY", e.title));
    if (e.description) lines.push(formatIcsLine("DESCRIPTION", e.description));
    if (e.allDay) {
      const dtStart = sanitizeIcsDate(e.startAt.slice(0, 10).replace(/-/g, ""));
      const dtEnd = e.endAt.slice(0, 10);
      const nextDay = new Date(dtEnd);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const dtEndNext = sanitizeIcsDate(nextDay.toISOString().slice(0, 10).replace(/-/g, ""));
      lines.push(formatIcsLine("DTSTART;VALUE=DATE", dtStart));
      lines.push(formatIcsLine("DTEND;VALUE=DATE", dtEndNext));
    } else {
      lines.push(formatIcsLine("DTSTART", sanitizeIcsDateTime(e.startAt)));
      lines.push(formatIcsLine("DTEND", sanitizeIcsDateTime(e.endAt)));
    }
    if (e.rrule) lines.push(formatIcsLine("RRULE", e.rrule));
    if (e.location) lines.push(formatIcsLine("LOCATION", e.location));
    
    const extra = extractExtraProperties(e.rawIcs ?? "");
    for (const line of extra) {
      lines.push(line + "\r\n");
    }
    
    lines.push("END:VEVENT\r\n");
  }

  lines.push("END:VCALENDAR\r\n");
  return lines.join("");
}

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

function normalizeDt(dt: string | null): string | null {
  if (!dt) return null;
  const cleaned = dt.replace(/^:/, "").replace(/\s.*$/, "");
  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  if (cleaned.length >= 13 && /^\d{8}T\d{4}/.test(cleaned)) {
    const date = cleaned.slice(0, 8);
    const time = cleaned.slice(9, 15);
    const suffix = cleaned.slice(15);
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}${time.length >= 6 ? `:${time.slice(4, 6)}` : ""}${suffix}`;
  }
  return cleaned;
}

function isAllDay(comp: ParsedComponent): boolean {
  const dtParams = comp.params["DTSTART"];
  if (dtParams?.["VALUE"]?.toUpperCase() === "DATE") return true;
  const startVal = comp.props["DTSTART"] ?? "";
  return /^\d{8}$/.test(startVal);
}

function getProp(comp: ParsedComponent, key: string): string | null {
  return comp.props[key] ?? null;
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

  if (overwrite) {
    await db.delete(events).where(eq(events.calendarId, calendarId));
  }

  const now = new Date().toISOString();
  const lmod = Date.now();

  for (const c of parsed.components) {
    if (c.type !== "VEVENT" || !selectedUids.has(c.uid)) continue;

    const startAt = normalizeDt(getProp(c, "DTSTART")) ?? now;
    const endAt = normalizeDt(getProp(c, "DTEND")) ?? now;
    const allDay = isAllDay(c);

    await db
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
