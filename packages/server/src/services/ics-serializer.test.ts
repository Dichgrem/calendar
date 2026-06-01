import { describe, it, expect } from "vitest";
import { serializeIcsCalendar } from "../services/ics-serializer.js";

describe("serializeIcsCalendar", () => {
  const basicEvent = {
    id: "evt-1",
    title: "Test Event",
    description: "A test",
    startAt: "2026-01-15T09:00:00.000Z",
    endAt: "2026-01-15T10:00:00.000Z",
    allDay: false,
    rrule: "FREQ=WEEKLY;BYDAY=MO",
    location: "Office",
    createdAt: "2026-01-01T00:00:00.000Z",
    rawIcs: null,
  };

  const basicEvents = [basicEvent];

  it("produces valid VCALENDAR wrapper", () => {
    const ics = serializeIcsCalendar("My Calendar", basicEvents);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
    expect(ics).toContain("VERSION:2.0");
  });

  it("includes calendar name in X-WR-CALNAME", () => {
    const ics = serializeIcsCalendar("My Calendar", basicEvents);
    expect(ics).toContain("X-WR-CALNAME:My Calendar");
  });

  it("includes PRODID", () => {
    const ics = serializeIcsCalendar("Test", basicEvents);
    expect(ics).toContain("PRODID:-//Calendar App//EN");
  });

  it("serializes VEVENT with all fields", () => {
    const ics = serializeIcsCalendar("Test", basicEvents);
    expect(ics).toContain("SUMMARY:Test Event");
    expect(ics).toContain("DESCRIPTION:A test");
    expect(ics).toContain("LOCATION:Office");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(ics).toContain("UID:evt-1");
  });

  it("formats datetime without separators", () => {
    const ics = serializeIcsCalendar("Test", basicEvents);
    expect(ics).toMatch(/DTSTART:20260115T090000Z/);
    expect(ics).toMatch(/DTEND:20260115T100000Z/);
  });

  it("handles empty events array", () => {
    const ics = serializeIcsCalendar("Empty", []);
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR\r\n$/);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("handles all-day events with VALUE=DATE", () => {
    const allDayEvent = {
      ...basicEvent,
      allDay: true,
      startAt: "2026-06-01",
      endAt: "2026-06-02",
      rrule: null,
      location: null,
      description: null,
    };
    const ics = serializeIcsCalendar("Test", [allDayEvent]);
    expect(ics).toContain("DTSTART;VALUE=DATE:");
    expect(ics).toContain("DTEND;VALUE=DATE:");
  });
});
