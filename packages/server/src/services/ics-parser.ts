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

export function normalizeDt(dt: string | null): string | null {
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

export function isAllDay(comp: ParsedComponent): boolean {
  const dtParams = comp.params["DTSTART"];
  if (dtParams?.["VALUE"]?.toUpperCase() === "DATE") return true;
  const startVal = comp.props["DTSTART"] ?? "";
  return /^\d{8}$/.test(startVal);
}

export function getProp(comp: ParsedComponent, key: string): string | null {
  return comp.props[key] ?? null;
}
