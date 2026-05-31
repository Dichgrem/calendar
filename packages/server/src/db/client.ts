import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema.js";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    const sqlite = new Database(
      process.env.DATABASE_URL?.replace("file:", "") ?? "./data/calendar.db",
    );
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}

export const db = getDb();

export function createD1Db(d1Binding: D1Database) {
  return drizzle(d1Binding, { schema });
}
