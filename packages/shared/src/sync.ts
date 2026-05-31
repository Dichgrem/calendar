import type { ID } from "./types.js";

export type SyncOperation = "created" | "updated" | "deleted";

export interface SyncRecord {
  table: string;
  op: SyncOperation;
  id: ID;
  data: Record<string, unknown>;
}

export interface SyncPullRequest {
  lastPulledSeq: number;
}

export interface SyncPullResponse {
  changes: {
    [tableName: string]: {
      created: Record<string, unknown>[];
      updated: Record<string, unknown>[];
      deleted: ID[];
    };
  };
  seq: number;
}

export interface SyncPushRequest {
  changes: {
    [tableName: string]: {
      created: Record<string, unknown>[];
      updated: Record<string, unknown>[];
      deleted: ID[];
    };
  };
  lastPulledSeq: number;
}

export interface SyncPushResponse {
  ok: true;
  seq: number;
}

export interface SyncPushConflict {
  ok: false;
  error: {
    code: "CONFLICT";
    message: string;
    conflictingIds: ID[];
  };
}

export type SyncPushResult = SyncPushResponse | SyncPushConflict;

export interface SyncQueueItem {
  id: number;
  table: string;
  recordId: ID;
  op: SyncOperation;
  data: Record<string, unknown>;
  seq: number;
}
