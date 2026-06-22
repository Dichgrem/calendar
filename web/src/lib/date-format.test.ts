import { describe, expect, it } from "vitest";
import { dateStr, formatCalendarDate } from "../lib/date-format";

describe("formatCalendarDate", () => {
  it("formats zh date style", () => {
    const d = new Date(2026, 0, 15);
    expect(formatCalendarDate(d, "zh", "zh-CN")).toBe("2026年1月");
  });

  it("formats en date style", () => {
    const d = new Date(2026, 0, 15);
    expect(formatCalendarDate(d, "en", "en")).toBe("Jan 2026");
  });

  it("formats custom date format", () => {
    const d = new Date(2026, 0, 15);
    expect(formatCalendarDate(d, "yyyy-MM", "zh-CN")).toBe("2026-01");
  });
});

describe("dateStr", () => {
  it("returns ISO date string", () => {
    const d = new Date(2026, 0, 15);
    expect(dateStr(d)).toBe("2026-01-15");
  });

  it("handles year boundary", () => {
    const d = new Date(2025, 11, 31);
    expect(dateStr(d)).toBe("2025-12-31");
  });
});
