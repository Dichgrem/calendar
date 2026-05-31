import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema.js";
import { setDb, setRawConnection } from "./client.js";

const rawConnection = new Database(
  process.env.DATABASE_URL?.replace("file:", "") ?? "./data/calendar.db",
);
rawConnection.pragma("journal_mode = WAL");
rawConnection.pragma("foreign_keys = ON");

const drizzle = drizzleSqlite(rawConnection, { schema });

try {
  migrate(drizzle, { migrationsFolder: "./drizzle/migrations" });
} catch {
  // already migrated or no migrations to apply
}

setRawConnection(rawConnection);
setDb(drizzle);
