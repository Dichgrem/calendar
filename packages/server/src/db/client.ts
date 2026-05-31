import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import Database from "better-sqlite3";
import * as schema from "./schema.js";

type DrizzleDb = ReturnType<typeof drizzleSqlite<typeof schema>>;

let dbInstance: DrizzleDb | null = null;
let rawConnection: Database.Database | null = null;

export function getDb(): DrizzleDb {
  if (!dbInstance) {
    rawConnection = new Database(
      process.env.DATABASE_URL?.replace("file:", "") ?? "./data/calendar.db",
    );
    rawConnection.pragma("journal_mode = WAL");
    rawConnection.pragma("foreign_keys = ON");

    dbInstance = drizzleSqlite(rawConnection, { schema });
  }
  return dbInstance;
}

export function initD1Db(d1: unknown) {
  if (!dbInstance) {
    dbInstance = drizzleD1(d1 as D1Database, { schema }) as unknown as DrizzleDb;
  }
}

export const db = getDb();

export function getRawConnection(): Database.Database | null {
  return rawConnection;
}
