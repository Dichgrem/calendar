import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema.js";
import { setDb, setRawConnection } from "./client.js";
import { config, applyConfig } from "../config.js";

const configPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "config.json");

if (existsSync(configPath)) {
  try {
    applyConfig(JSON.parse(readFileSync(configPath, "utf-8")));
  } catch (e) {
    console.error("Failed to parse config.json:", e);
    process.exit(1);
  }
}

const rawConnection = new Database(
  config.databaseUrl,
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
