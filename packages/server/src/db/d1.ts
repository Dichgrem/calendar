import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema.js";
import type { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzleSqlite<typeof schema>>;

let dbInstance: DrizzleDb | null = null;

export function initD1Db(d1: unknown) {
  if (!dbInstance) {
    dbInstance = drizzleD1(d1 as D1Database, { schema }) as unknown as DrizzleDb;
  }
}
