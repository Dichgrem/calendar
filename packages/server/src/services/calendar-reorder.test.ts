import { describe, it, expect } from "vitest";

describe("reorderCalendars logic", () => {
  function computeNewOrder(
    currentIds: string[],
    dragId: string,
    targetId: string,
  ): string[] {
    const ordered = [...currentIds];
    const fromIdx = ordered.indexOf(dragId);
    const toIdx = ordered.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return currentIds;
    ordered.splice(fromIdx, 1);
    ordered.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, dragId);
    return ordered;
  }

  it("moves item before target (drop-on convention)", () => {
    const ids = ["a", "b", "c", "d"];
    expect(computeNewOrder(ids, "a", "d")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves later item before earlier target", () => {
    const ids = ["a", "b", "c", "d"];
    expect(computeNewOrder(ids, "d", "a")).toEqual(["d", "a", "b", "c"]);
  });

  it("moves middle item to front", () => {
    const ids = ["a", "b", "c", "d"];
    expect(computeNewOrder(ids, "c", "a")).toEqual(["c", "a", "b", "d"]);
  });

  it("no-op when source equals target", () => {
    const ids = ["a", "b", "c"];
    expect(computeNewOrder(ids, "b", "b")).toEqual(["a", "b", "c"]);
  });

  it("no-op when source not found", () => {
    const ids = ["a", "b"];
    expect(computeNewOrder(ids, "x", "b")).toEqual(["a", "b"]);
  });

  it("assigns correct sortOrder indices", () => {
    const ordered = computeNewOrder(["a", "b", "c", "d"], "d", "a");
    const sortOrderMap = Object.fromEntries(ordered.map((id, i) => [id, i]));
    expect(sortOrderMap).toEqual({ d: 0, a: 1, b: 2, c: 3 });
  });
});
