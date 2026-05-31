import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema.js";
import { setDb } from "./client.js";

let _d1Initialized = false;

export function initD1Db(d1: unknown) {
  if (_d1Initialized) return;
  _d1Initialized = true;
  setDb(drizzleD1(d1 as D1Database, { schema }));
}
