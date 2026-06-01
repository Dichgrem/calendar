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
  
  const lines = rawIcs.split(/\r\n|\n/);
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
