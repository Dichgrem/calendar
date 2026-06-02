import { describe, it, expect } from "vitest";
import { parseIcsContent } from "../services/ics-parser.js";

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

describe("parseIcsContent edge cases", () => {
  it("unfolds CRLF+space continuation lines (RFC 5545)", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test\r\nSUMMARY:This line\r\n continues here\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const result = parseIcsContent(ics);
    expect(result.components[0].props["SUMMARY"]).toBe("This linecontinues here");
  });

  it("skips VALARM blocks entirely", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-alarm
SUMMARY:Event with alarm
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Reminder
END:VALARM
LOCATION:Office
END:VEVENT
END:VCALENDAR`;
    const result = parseIcsContent(ics);
    expect(result.components[0].props["LOCATION"]).toBe("Office");
    expect(result.components[0].props["TRIGGER"]).toBeUndefined();
    expect(result.components[0].props["DESCRIPTION"]).toBeUndefined();
  });

  it("handles empty content gracefully", () => {
    const result = parseIcsContent("");
    expect(result.name).toBe("Imported Calendar");
    expect(result.components).toHaveLength(0);
  });

  it("extracts X-WR-CALNAME", () => {
    const ics = `BEGIN:VCALENDAR
X-WR-CALNAME:My Work Calendar
BEGIN:VEVENT
UID:evt1
END:VEVENT
END:VCALENDAR`;
    const result = parseIcsContent(ics);
    expect(result.name).toBe("My Work Calendar");
  });

  it("handles duplicate properties (last wins)", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:dup
CATEGORIES:Work
CATEGORIES:Personal
END:VEVENT
END:VCALENDAR`;
    const result = parseIcsContent(ics);
    expect(result.components[0].props["CATEGORIES"]).toBe("Personal");
  });
});

describe("isPrivateHost SSRF protection", () => {
  it("blocks localhost", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("::1")).toBe(true);
  });

  it("blocks RFC 1918 private ranges", () => {
    expect(isPrivateHost("10.0.0.1")).toBe(true);
    expect(isPrivateHost("192.168.1.1")).toBe(true);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
  });

  it("blocks link-local addresses", () => {
    expect(isPrivateHost("169.254.1.1")).toBe(true);
  });

  it("allows public hosts", () => {
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("172.32.0.1")).toBe(false);
  });
});
