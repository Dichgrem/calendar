import type { ID, SyncPullResponse, SyncPushResult } from "../types.js";
import { db } from "../db/client.js";
import { syncSequence, deletedLog, calendars, events, eventOverrides } from "../db/schema.js";
import { sql, eq, gt, and, inArray } from "drizzle-orm";
import type { PermissionContext } from "../types.js";

const TABLE_MAP: Record<string, unknown> = {
  calendars,
  events,
  event_overrides: eventOverrides,
};

interface PullParams {
  lastPulledSeq: number;
  permission: PermissionContext;
}

export async function pullChanges({
  lastPulledSeq,
  permission,
}: PullParams): Promise<SyncPullResponse> {
  const changes: SyncPullResponse["changes"] = {};

  const tablesToSync = ["calendars", "events", "event_overrides"] as const;

  for (const table of tablesToSync) {
    const created: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const deleted: ID[] = [];

    const seqs = await db
      .select()
      .from(syncSequence)
      .where(and(eq(syncSequence.tableName, table), gt(syncSequence.id, lastPulledSeq)));

    const createdIds: ID[] = [];
    const updatedIds: ID[] = [];

    for (const seq of seqs) {
      if (seq.op === "deleted") {
        deleted.push(seq.recordId);
      } else if (seq.op === "created") {
        createdIds.push(seq.recordId);
      } else {
        updatedIds.push(seq.recordId);
      }
    }

    const fetchIds = [...createdIds, ...updatedIds];
    if (fetchIds.length > 0) {
      const tableRef = TABLE_MAP[table];
      if (!tableRef) continue;

      const rows = await db
        .select()
        .from(tableRef as any)
        .where(inArray((tableRef as any).id, fetchIds));

      const rowMap = new Map((rows as any[]).map((r) => [(r as any).id, r]));

      for (const id of createdIds) {
        const row = rowMap.get(id);
        if (row) created.push(row as Record<string, unknown>);
      }
      for (const id of updatedIds) {
        const row = rowMap.get(id);
        if (row) updated.push(row as Record<string, unknown>);
      }
    }

    if (created.length > 0 || updated.length > 0 || deleted.length > 0) {
      changes[table] = { created, updated, deleted };
    }
  }

  const [latestSeq] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(${syncSequence.id}), 0)` })
    .from(syncSequence);

  return {
    changes,
    seq: latestSeq?.maxSeq ?? lastPulledSeq,
  };
}

interface PushParams {
  lastPulledSeq: number;
  changes: SyncPullResponse["changes"];
  permission: PermissionContext;
}

export async function pushChanges({
  lastPulledSeq,
  changes,
  permission,
}: PushParams): Promise<SyncPushResult> {
  const conflictIds: ID[] = [];

  for (const [table, tableChanges] of Object.entries(changes)) {
    const tableRef = TABLE_MAP[table];
    if (!tableRef) continue;

    const pushRows = [...tableChanges.created, ...tableChanges.updated]
      .filter((r) => r.lastModified != null);
    if (pushRows.length === 0) continue;

    const ids = pushRows.map((r) => r.id as ID);

    const existingRows = await db
      .select({ id: (tableRef as any).id, lastModified: (tableRef as any).lastModified })
      .from(tableRef as any)
      .where(inArray((tableRef as any).id, ids));

    const existingMap = new Map((existingRows as any[]).map((r) => [r.id, r.lastModified]));

    for (const record of pushRows) {
      const existingLm = existingMap.get(record.id as ID);
      if (existingLm != null && existingLm > (record.lastModified as number)) {
        conflictIds.push(record.id as ID);
      }
    }
  }

  if (conflictIds.length > 0) {
    return {
      ok: false,
      error: {
        code: "CONFLICT" as const,
        message: `Conflicting records: ${conflictIds.join(", ")}`,
        conflictingIds: conflictIds,
      },
    };
  }

  await db.transaction(async (tx) => {
    for (const [table, tableChanges] of Object.entries(changes)) {
      const tableRef = TABLE_MAP[table];
      if (!tableRef) continue;

      for (const record of tableChanges.created) {
        await tx.insert(tableRef as any).values(record).onConflictDoNothing();
      }
      for (const record of tableChanges.updated) {
        const { id, ...data } = record;
        if (id == null) continue;
        await tx
          .update(tableRef as any)
          .set(data)
          .where(eq((tableRef as any).id, id as string));
      }
      for (const recordId of tableChanges.deleted) {
        await tx.delete(tableRef as any).where(eq((tableRef as any).id, recordId));
        await tx.insert(deletedLog).values({
          id: crypto.randomUUID(),
          tableName: table,
          recordId,
          deletedAt: new Date().toISOString(),
          lastModified: Date.now(),
        });
      }
    }
  });

  const [latestSeq] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(${syncSequence.id}), 0)` })
    .from(syncSequence);

  return {
    ok: true,
    seq: latestSeq?.maxSeq ?? lastPulledSeq,
  };
}
