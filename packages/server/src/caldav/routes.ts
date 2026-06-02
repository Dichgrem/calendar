import { Hono } from "hono";
import { authMiddleware } from "../auth/middleware.js";
import { NS_DAV, NS_CALDAV, esc } from "./xml.js";
import {
  caldavListCalendars,
  caldavGetCalendar,
  caldavListEvents,
  caldavGetEvent,
  caldavPutEvent,
  caldavDeleteEvent,
} from "./service.js";
import { createCalendar } from "../services/calendar.service.js";
import { parseCalendarQueryBody } from "./xml.js";

function propfindResponseCalendar(cal: { id: string; name: string }) {
  return `
    <D:response>
      <D:href>/dav/calendars/${cal.id}/</D:href>
      <D:propstat>
        <D:prop>
          <D:displayname>${esc(cal.name)}</D:displayname>
          <D:resourcetype>
            <D:collection/>
            <C:calendar xmlns:C="${NS_CALDAV}"/>
          </D:resourcetype>
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>`;
}

function propfindResponseRoot() {
  return `
    <D:response>
      <D:href>/dav/</D:href>
      <D:propstat>
        <D:prop>
          <D:resourcetype><D:collection/></D:resourcetype>
          <D:current-user-principal><D:href>/dav/</D:href></D:current-user-principal>
          <C:calendar-home-set xmlns:C="${NS_CALDAV}"><D:href>/dav/calendars/</D:href></C:calendar-home-set>
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>`;
}

function propfindResponseEvent(calId: string, uid: string, title: string, startAt: string, endAt: string) {
  return `
    <D:response>
      <D:href>/dav/calendars/${calId}/${uid}.ics</D:href>
      <D:propstat>
        <D:prop>
          <D:getetag>"${uid}"</D:getetag>
          <D:displayname>${esc(title)}</D:displayname>
          <C:calendar-data xmlns:C="${NS_CALDAV}">
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Calendar App//EN
BEGIN:VEVENT
UID:${uid}
SUMMARY:${esc(title)}
DTSTART:${startAt}
DTEND:${endAt}
END:VEVENT
END:VCALENDAR</C:calendar-data>
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>`;
}

function extractIcsFields(ics: string) {
  const uidMatch = ics.match(/^UID:(.+)$/m);
  const summaryMatch = ics.match(/^SUMMARY:(.+)$/m);
  const dtstartMatch = ics.match(/^DTSTART(?:;VALUE=DATE)?:(.+)$/m);
  const dtendMatch = ics.match(/^DTEND(?:;VALUE=DATE)?:(.+)$/m);
  return {
    uid: uidMatch?.[1] || "",
    title: summaryMatch?.[1] || "(Untitled)",
    startAt: dtstartMatch?.[1] || "",
    endAt: dtendMatch?.[1] || "",
  };
}

function buildEventMultistatus(calendarId: string, eventsBody: string[]) {
  let body = "";
  for (const ics of eventsBody) {
    const fields = extractIcsFields(ics);
    body += "\n" + propfindResponseEvent(calendarId, fields.uid, fields.title, fields.startAt, fields.endAt);
  }
  return body;
}

const caldavRouter = new Hono().use(authMiddleware);

// Add DAV header to all responses (required for service detection)
caldavRouter.use("*", async (c, next) => {
  c.res.headers.set("DAV", "1, 2, 3, calendar-access");
  await next();
});

caldavRouter.all("*", async (c, next) => {
  const method = c.req.method;
  const path = c.req.path || "";
  const perm = c.get("permission");

  // OPTIONS — required by DAVx5 for service verification
  if (method === "OPTIONS" && (path === "/dav" || path === "/dav/")) {
    return new Response(null, {
      status: 200,
      headers: { "DAV": "1, 2, 3, calendar-access", "Allow": "GET,PUT,DELETE,PROPFIND,REPORT,MKCALENDAR,OPTIONS" },
    });
  }

  // PROPFIND root — return principal + home-set
  if (method === "PROPFIND" && (path === "/dav" || path === "/dav/")) {
    const cals = await caldavListCalendars(perm.userId);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="${NS_DAV}" xmlns:C="${NS_CALDAV}">
  ${propfindResponseRoot()}
  ${cals.map(propfindResponseCalendar).join("\n")}
</D:multistatus>`;
    return new Response(body, { status: 207, headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }

  // PROPFIND on calendar home-set — list all calendars
  if (method === "PROPFIND" && (path === "/dav/calendars" || path === "/dav/calendars/")) {
    const cals = await caldavListCalendars(perm.userId);
    let body = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="${NS_DAV}" xmlns:C="${NS_CALDAV}">`;
    for (const cal of cals) {
      body += "\n" + propfindResponseCalendar(cal);
    }
    body += "\n</D:multistatus>";
    return new Response(body, { status: 207, headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }

  // PROPFIND on a specific calendar — list events
  const calMatch = path.match(/^\/dav\/calendars\/([^/]+)\/?$/);
  if (method === "PROPFIND" && calMatch) {
    const calendarId = calMatch[1];
    const cal = await caldavGetCalendar(calendarId, perm.userId);
    if (!cal) return c.json({ error: "Not found" }, 404);

    const eventsBody = await caldavListEvents(calendarId, undefined, undefined, perm.userId);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="${NS_DAV}" xmlns:C="${NS_CALDAV}">
  ${propfindResponseCalendar(cal)}${buildEventMultistatus(calendarId, eventsBody)}
</D:multistatus>`;
    return new Response(body, { status: 207, headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }

  // REPORT on a calendar (calendar-query with time-range)
  if (method === "REPORT" && calMatch) {
    const calendarId = calMatch[1];
    const xml = await c.req.text();
    const query = parseCalendarQueryBody(xml);
    const eventsBody = await caldavListEvents(calendarId, query.rangeStart, query.rangeEnd, perm.userId);

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="${NS_DAV}" xmlns:C="${NS_CALDAV}">${buildEventMultistatus(calendarId, eventsBody)}
</D:multistatus>`;
    return new Response(body, { status: 207, headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }

  // MKCALENDAR
  if (method === "MKCALENDAR" && (path === "/dav" || path === "/dav/")) {
    let color = "#3b82f6";
    try {
      const xml = await c.req.text();
      const colorMatch = xml.match(/<ICAL:calendar-color[^>]*>([^<]+)<\/ICAL:calendar-color>/i);
      if (colorMatch) color = colorMatch[1].trim();
    } catch { /* */ }
    const cal = await createCalendar({ name: "New Calendar", color }, perm.userId);
    return new Response(null, { status: 201, headers: { Location: `/dav/calendars/${cal.id}/` } });
  }

  // GET/PUT/DELETE event
  const evtMatch = path.match(/^\/dav\/calendars\/([^/]+)\/([^/]+)$/);
  if (evtMatch) {
    const calendarId = evtMatch[1];
    const uid = evtMatch[2].replace(/\.ics$/, "");

    if (method === "GET") {
      const ics = await caldavGetEvent(calendarId, uid, perm.userId);
      if (!ics) return c.json({ error: "Not found" }, 404);
      return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
    }

    if (method === "PUT") {
      const ok = await caldavPutEvent(calendarId, uid, await c.req.text(), perm.userId);
      if (!ok) return c.json({ error: "Forbidden" }, 403);
      return new Response(null, { status: 204 });
    }

    if (method === "DELETE") {
      const ok = await caldavDeleteEvent(calendarId, uid, perm.userId);
      if (!ok) return c.json({ error: "Forbidden" }, 403);
      return new Response(null, { status: 204 });
    }
  }

  await next();
});

export { caldavRouter };
