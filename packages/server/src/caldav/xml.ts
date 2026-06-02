// CalDAV XML namespaces
export const NS_DAV = "DAV:";
export const NS_CALDAV = "urn:ietf:params:xml:ns:caldav";
export const NS_CS = "http://calendarserver.org/ns/";
export const NS_ICAL = "http://apple.com/ns/ical/";

export interface PropfindRequest {
  props: { name: string; xmlns: string }[];
  allProp: boolean;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function parsePropfindBody(xml: string): PropfindRequest {
  if (!xml) return { props: [], allProp: true };

  const allProp = /<[a-zA-Z]*:?allprop\s*\/>/i.test(xml) || /<allprop>/i.test(xml);

  const props: { name: string; xmlns: string }[] = [];
  const propMatch = xml.match(/<[a-zA-Z]*:?prop[^>]*>([\s\S]*?)<\/[a-zA-Z]*:?prop>/i);
  if (propMatch) {
    const inner = propMatch[1];
    const tagRegex = /<([a-zA-Z]*:)?([a-zA-Z0-9_-]+)\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(inner)) !== null) {
      const tagName = m[2];
      if (tagName === "calendar-data") {
        props.push({ name: tagName, xmlns: NS_CALDAV });
      } else {
        props.push({ name: tagName, xmlns: NS_DAV });
      }
    }
  }

  return { props, allProp };
}

export interface CalendarQueryRequest {
  rangeStart?: string;
  rangeEnd?: string;
  propNames: string[];
}

export function parseCalendarQueryBody(xml: string): CalendarQueryRequest {
  const result: CalendarQueryRequest = { propNames: [] };

  // Extract time-range filter
  const startMatch = xml.match(/start="([^"]*)"/i);
  if (startMatch) result.rangeStart = startMatch[1];
  const endMatch = xml.match(/end="([^"]*)"/i);
  if (endMatch) result.rangeEnd = endMatch[1];

  // Extract requested props
  const propMatch = xml.match(/<[a-zA-Z]*:?prop[^>]*>([\s\S]*?)<\/[a-zA-Z]*:?prop>/i);
  if (propMatch) {
    const tagRegex = /<[a-zA-Z]*:?([a-zA-Z0-9_-]+)\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(propMatch[1])) !== null) {
      result.propNames.push(m[1]);
    }
  }

  return result;
}
