import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema.js";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let rawConnection: Database.Database | null = null;

export function getDb() {
  if (!dbInstance) {
    rawConnection = new Database(
      process.env.DATABASE_URL?.replace("file:", "") ?? "./data/calendar.db",
    );
    rawConnection.pragma("journal_mode = WAL");
    rawConnection.pragma("foreign_keys = ON");

    dbInstance = drizzle(rawConnection, { schema });
  }
  return dbInstance;
}

export const db = getDb();

export function getRawConnection(): Database.Database | null {
  return rawConnection;
}
