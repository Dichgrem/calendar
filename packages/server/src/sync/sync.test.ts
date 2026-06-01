import { describe, it, expect } from "vitest";

describe("LWW conflict resolution", () => {
  function hasConflict(serverLastModified: number, clientLastModified: number): boolean {
    return serverLastModified > clientLastModified;
  }

  it("rejects push when server is newer (conflict)", () => {
    expect(hasConflict(2000, 1000)).toBe(true);
  });

  it("accepts push when client is newer (no conflict)", () => {
    expect(hasConflict(1000, 2000)).toBe(false);
  });

  it("accepts push when timestamps are equal", () => {
    expect(hasConflict(1000, 1000)).toBe(false);
  });

  it("accepts push of new records (serverLastModified is 0)", () => {
    expect(hasConflict(0, 1)).toBe(false);
  });
});

describe("sync pull sequence", () => {
  interface SyncEntry {
    id: number;
    tableName: string;
    recordId: string;
    op: "created" | "updated" | "deleted";
    syncedAt: string;
  }

  function buildPullResponse(
    entries: SyncEntry[],
    lastPulledSeq: number,
    fetchRow: (table: string, id: string) => Record<string, unknown> | null,
  ) {
    const changes: Record<string, { created: Record<string, unknown>[]; updated: Record<string, unknown>[]; deleted: string[] }> = {};

    for (const entry of entries) {
      if (entry.id <= lastPulledSeq) continue;
      if (!changes[entry.tableName]) {
        changes[entry.tableName] = { created: [], updated: [], deleted: [] };
      }
      if (entry.op === "deleted") {
        changes[entry.tableName].deleted.push(entry.recordId);
      } else {
        const row = fetchRow(entry.tableName, entry.recordId);
        if (row) {
          if (entry.op === "created") {
            changes[entry.tableName].created.push(row);
          } else {
            changes[entry.tableName].updated.push(row);
          }
        }
      }
    }

    const seq = entries.length > 0 ? entries[entries.length - 1].id : lastPulledSeq;
    return { changes, seq };
  }

  it("skips entries with id <= lastPulledSeq", () => {
    const entries: SyncEntry[] = [
      { id: 1, tableName: "events", recordId: "e1", op: "created", syncedAt: new Date().toISOString() },
      { id: 2, tableName: "events", recordId: "e2", op: "created", syncedAt: new Date().toISOString() },
    ];
    const result = buildPullResponse(entries, 1, () => ({ title: "test" }));
    expect(result.changes["events"].created).toHaveLength(1);
  });

  it("returns max entry id as seq", () => {
    const entries: SyncEntry[] = [
      { id: 5, tableName: "events", recordId: "e1", op: "created", syncedAt: new Date().toISOString() },
    ];
    const result = buildPullResponse(entries, 0, () => ({ title: "test" }));
    expect(result.seq).toBe(5);
  });

  it("returns lastPulledSeq when no new entries", () => {
    const result = buildPullResponse([], 10, () => null);
    expect(result.seq).toBe(10);
  });

  it("classifies deleted ops as deleted array", () => {
    const entries: SyncEntry[] = [
      { id: 1, tableName: "events", recordId: "e-deleted", op: "deleted", syncedAt: new Date().toISOString() },
    ];
    const result = buildPullResponse(entries, 0, () => null);
    expect(result.changes["events"].created).toHaveLength(0);
    expect(result.changes["events"].deleted).toEqual(["e-deleted"]);
  });
});
