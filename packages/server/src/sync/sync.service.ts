import type { ID, SyncPullResponse, SyncPushResult } from "@calendar/shared";
import { db } from "../db/client.js";
import { syncSequence, deletedLog } from "../db/schema.js";
import { sql, eq, gt, and, isNotNull } from "drizzle-orm";
import type { PermissionContext } from "@calendar/shared";

interface PullParams {
  lastPulledSeq: number;
  permission: PermissionContext;
}

export async function pullChanges({
  lastPulledSeq,
  permission,
}: PullParams): Promise<SyncPullResponse> {
  const changes: SyncPullResponse["changes"] = {};

  const tablesToSync = ["calendars", "events", "todos", "todo_lists", "event_overrides"] as const;

  for (const table of tablesToSync) {
    const created: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const deleted: ID[] = [];

    const seqs = await db
      .select()
      .from(syncSequence)
      .where(and(eq(syncSequence.tableName, table), gt(syncSequence.id, lastPulledSeq)));

    for (const seq of seqs) {
      if (seq.op === "deleted") {
        deleted.push(seq.recordId);
      } else {
        const row = await db
          .select()
          .from(sql.raw(table))
          .where(eq(sql.raw(`${table}.id`), seq.recordId))
          .get();

        if (row) {
          const record = row as Record<string, unknown>;
          if (seq.op === "created") {
            created.push(record);
          } else {
            updated.push(record);
          }
        }
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
    for (const record of [...tableChanges.created, ...tableChanges.updated]) {
      const id = record.id as ID;
      const lastModified = record.last_modified as number;
      if (lastModified == null) continue;

      const [existing] = await db
        .select({ lastModified: sql.raw(`${table}.last_modified`).mapWith(Number) })
        .from(sql.raw(table))
        .where(eq(sql.raw(`${table}.id`), id));

      if (existing && existing.lastModified > lastModified) {
        conflictIds.push(id);
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

  for (const [table, tableChanges] of Object.entries(changes)) {
    for (const record of tableChanges.created) {
      await db.insert(sql.raw(table)).values(record).onConflictDoNothing();
    }
    for (const record of tableChanges.updated) {
      const { id, ...data } = record;
      if (id == null) continue;
      await db
        .update(sql.raw(table))
        .set(data)
        .where(eq(sql.raw(`${table}.id`), id as string));
    }
    for (const recordId of tableChanges.deleted) {
      await db.delete(sql.raw(table)).where(eq(sql.raw(`${table}.id`), recordId));
      await db.insert(deletedLog).values({
        id: crypto.randomUUID(),
        tableName: table,
        recordId,
        deletedAt: new Date().toISOString(),
        lastModified: Date.now(),
      });
    }
  }

  const [latestSeq] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(${syncSequence.id}), 0)` })
    .from(syncSequence);

  return {
    ok: true,
    seq: latestSeq?.maxSeq ?? lastPulledSeq,
  };
}
