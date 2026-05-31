import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

type DrizzleDb = DrizzleD1Database<Record<string, never>> | BetterSQLite3Database<Record<string, never>>;

let _db: DrizzleDb | null = null;
let _rawConnection: unknown = null;

export function setDb(d: DrizzleDb): void {
  _db = d;
}

export function setRawConnection(c: unknown): void {
  _rawConnection = c;
}

export const db = new Proxy({} as DrizzleDb, {
  get(_, prop) {
    if (!_db) throw new Error("DB not initialized");
    return (_db as Record<string | symbol, unknown>)[prop];
  },
});

export function getRawConnection() {
  return _rawConnection;
}
