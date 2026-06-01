import { describe, it, expect } from "vitest";
import { parseIcsContent } from "../services/ics-parser.js";

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
X-WR-CALNAME:Test Calendar
BEGIN:VEVENT
UID:event-1@test
DTSTART:20260101T090000Z
DTEND:20260101T100000Z
SUMMARY:Morning Meeting
DESCRIPTION:Weekly standup
LOCATION:Room A
END:VEVENT
BEGIN:VEVENT
UID:event-2@test
DTSTART;VALUE=DATE:20260102
DTEND;VALUE=DATE:20260103
SUMMARY:All Day Event
END:VEVENT
END:VCALENDAR`;

describe("parseIcsContent", () => {
  it("extracts calendar name from X-WR-CALNAME", () => {
    const result = parseIcsContent(SAMPLE_ICS);
    expect(result.name).toBe("Test Calendar");
  });

  it("parses all VEVENT components", () => {
    const result = parseIcsContent(SAMPLE_ICS);
    expect(result.components).toHaveLength(2);
  });

  it("extracts UID from VEVENT", () => {
    const result = parseIcsContent(SAMPLE_ICS);
    expect(result.components[0].uid).toBe("event-1@test");
  });

  it("extracts properties from VEVENT", () => {
    const result = parseIcsContent(SAMPLE_ICS);
    const props = result.components[0].props;
    expect(props["DTSTART"]).toBe("20260101T090000Z");
    expect(props["SUMMARY"]).toBe("Morning Meeting");
    expect(props["DESCRIPTION"]).toBe("Weekly standup");
    expect(props["LOCATION"]).toBe("Room A");
  });

  it("captures raw ICS text for each component", () => {
    const result = parseIcsContent(SAMPLE_ICS);
    expect(result.components[0].rawIcs).toContain("BEGIN:VEVENT");
    expect(result.components[0].rawIcs).toContain("END:VEVENT");
    expect(result.components[0].rawIcs).toContain("Morning Meeting");
  });

  it("handles all-day events (VALUE=DATE parameter)", () => {
    const result = parseIcsContent(SAMPLE_ICS);
    const allDay = result.components[1];
    expect(allDay.props["DTSTART"]).toBe("20260102");
    expect(allDay.props["DTEND"]).toBe("20260103");
  });
});
