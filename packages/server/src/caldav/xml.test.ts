import { describe, it, expect } from "vitest";
import { parsePropfindBody, parseCalendarQueryBody, esc } from "./xml";

describe("parsePropfindBody", () => {
  it("returns allProp=true for empty body", () => {
    const result = parsePropfindBody("");
    expect(result.allProp).toBe(true);
    expect(result.props).toHaveLength(0);
  });

  it("parses allprop", () => {
    const xml = `<D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>`;
    const result = parsePropfindBody(xml);
    expect(result.allProp).toBe(true);
  });

  it("parses displayname prop", () => {
    const xml = `<D:propfind xmlns:D="DAV:"><D:prop><D:displayname/></D:prop></D:propfind>`;
    const result = parsePropfindBody(xml);
    expect(result.allProp).toBe(false);
    expect(result.props).toHaveLength(1);
    expect(result.props[0].name).toBe("displayname");
  });

  it("parses calendar-data prop with CalDAV namespace", () => {
    const xml = `<D:propfind xmlns:D="DAV:"><D:prop><C:calendar-data/></D:prop></D:propfind>`;
    const result = parsePropfindBody(xml);
    expect(result.props[0].name).toBe("calendar-data");
    expect(result.props[0].xmlns).toContain("caldav");
  });
});

describe("parseCalendarQueryBody", () => {
  it("extracts time-range start and end", () => {
    const xml = `<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <D:prop><D:getetag/><C:calendar-data/></D:prop>
      <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">
        <C:time-range start="20260101T000000Z" end="20260201T000000Z"/>
      </C:comp-filter></C:comp-filter></C:filter>
    </C:calendar-query>`;
    const result = parseCalendarQueryBody(xml);
    expect(result.rangeStart).toBe("20260101T000000Z");
    expect(result.rangeEnd).toBe("20260201T000000Z");
  });

  it("extracts prop names", () => {
    const xml = `<C:calendar-query xmlns:D="DAV:"><D:prop><D:getetag/><C:calendar-data/></D:prop></C:calendar-query>`;
    const result = parseCalendarQueryBody(xml);
    expect(result.propNames).toContain("getetag");
    expect(result.propNames).toContain("calendar-data");
  });

  it("handles missing time-range", () => {
    const xml = `<C:calendar-query xmlns:D="DAV:"><D:prop/></C:calendar-query>`;
    const result = parseCalendarQueryBody(xml);
    expect(result.rangeStart).toBeUndefined();
    expect(result.rangeEnd).toBeUndefined();
  });
});

describe("esc (XML escaping)", () => {
  it("escapes & < > \"", () => {
    const result = esc('foo & bar < baz > qux "quux"');
    expect(result).toBe("foo &amp; bar &lt; baz &gt; qux &quot;quux&quot;");
  });

  it("returns plain text unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });
});
