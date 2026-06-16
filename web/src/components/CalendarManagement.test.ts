import { describe, expect, it } from "vitest";

describe("common calendar import detection", () => {
  const COMMON_CALENDARS = [
    { id: "cn-holidays", url: "https://cdn.jsdelivr.net/npm/chinese-days/dist/holidays.ics" },
    { id: "cn-festival", url: "https://yangh9.github.io/ChinaCalendar/cal_festival.ics" },
  ];

  function detectImported(
    commons: { id: string; url: string }[],
    existing: { sourceUrl: string | null }[],
  ): Set<string> {
    return new Set(commons.filter((cal) => existing.some((c) => c.sourceUrl === cal.url)).map((cal) => cal.id));
  }

  it("detects already-imported calendar by sourceUrl", () => {
    const existing = [{ sourceUrl: "https://cdn.jsdelivr.net/npm/chinese-days/dist/holidays.ics" }];
    const imported = detectImported(COMMON_CALENDARS, existing);
    expect(imported.has("cn-holidays")).toBe(true);
    expect(imported.has("cn-festival")).toBe(false);
  });

  it("returns empty when no calendars match", () => {
    const existing = [{ sourceUrl: "https://other.com/cal.ics" }];
    const imported = detectImported(COMMON_CALENDARS, existing);
    expect(imported.size).toBe(0);
  });

  it("returns empty when existing calendars have null sourceUrl", () => {
    const existing = [{ sourceUrl: null }];
    const imported = detectImported(COMMON_CALENDARS, existing);
    expect(imported.size).toBe(0);
  });

  it("returns empty when no existing calendars", () => {
    const imported = detectImported(COMMON_CALENDARS, []);
    expect(imported.size).toBe(0);
  });
});
