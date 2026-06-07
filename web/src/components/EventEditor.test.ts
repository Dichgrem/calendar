import { describe, it, expect } from "vitest";
import { roundToNextHour, toLocalInput } from "./EventEditor";

describe("roundToNextHour", () => {
  it("rounds to the next full hour", () => {
    const d = new Date(2026, 0, 15, 14, 30, 45, 123);
    const result = roundToNextHour(d);
    expect(result.getHours()).toBe(15);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  it("wraps to next day at 23:xx", () => {
    const d = new Date(2026, 0, 15, 23, 59, 0, 0);
    const result = roundToNextHour(d);
    expect(result.getHours()).toBe(0);
    expect(result.getDate()).toBe(16);
  });

  it("wraps to next month at month boundary", () => {
    const d = new Date(2026, 0, 31, 23, 0, 0, 0);
    const result = roundToNextHour(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(1);
  });

  it("does not mutate the input date", () => {
    const d = new Date(2026, 5, 15, 10, 30, 0, 0);
    const hour = d.getHours();
    roundToNextHour(d);
    expect(d.getHours()).toBe(hour);
  });
});

describe("toLocalInput", () => {
  it("formats date with zero-padded month and day", () => {
    const d = new Date(2026, 0, 5, 14, 30);
    expect(toLocalInput(d)).toBe("2026-01-05T14:30");
  });

  it("formats single-digit hours and minutes with padding", () => {
    const d = new Date(2026, 5, 15, 9, 5);
    expect(toLocalInput(d)).toBe("2026-06-15T09:05");
  });

  it("handles midnight", () => {
    const d = new Date(2026, 11, 31, 0, 0);
    expect(toLocalInput(d)).toBe("2026-12-31T00:00");
  });
});

describe("date/time split-merge contract", () => {
  it("roundtrip: toLocalInput → split → merge matches original", () => {
    const d = new Date(2026, 5, 15, 14, 30);
    const iso = toLocalInput(d);
    const date = iso.slice(0, 10);
    const time = iso.slice(11, 16);

    const merged = new Date(`${date}T${time}`).toISOString();
    expect(merged).toBe(d.toISOString());
  });

  it("defaultStart midnight is preserved", () => {
    const highlightDate = "2026-06-15";
    const d = new Date(highlightDate + "T00:00:00");
    const iso = toLocalInput(d);
    expect(iso).toBe("2026-06-15T00:00");
    expect(iso.slice(11, 16)).toBe("00:00");
  });
});
