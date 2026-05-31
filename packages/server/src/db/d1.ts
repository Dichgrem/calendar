import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema.js";
import { setDb } from "./client.js";

export function initD1Db(d1: unknown) {
  setDb(drizzleD1(d1 as D1Database, { schema }));
}
