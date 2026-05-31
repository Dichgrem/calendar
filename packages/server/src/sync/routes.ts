import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { pullChanges, pushChanges } from "./sync.service.js";
import { authMiddleware } from "../auth/middleware.js";
import type { PermissionContext } from "../types.js";

const syncRouter = new Hono().use(authMiddleware);

const pullSchema = z.object({
  last_pulled_seq: z.coerce.number().int().min(0),
});

syncRouter.get("/pull", zValidator("query", pullSchema), async (c) => {
  const { last_pulled_seq } = c.req.valid("query");
  const perm = c.get("permission") as PermissionContext;

  const result = await pullChanges({
    lastPulledSeq: last_pulled_seq,
    permission: perm,
  });

  return c.json({ ok: true, data: result });
});

const pushSchema = z.object({
  changes: z.record(
    z.string(),
    z.object({
      created: z.array(z.record(z.unknown())).optional().default([]),
      updated: z.array(z.record(z.unknown())).optional().default([]),
      deleted: z.array(z.string()).optional().default([]),
    }),
  ),
  last_pulled_seq: z.number().int().min(0),
});

syncRouter.post("/push", zValidator("json", pushSchema), async (c) => {
  const { changes, last_pulled_seq } = c.req.valid("json");
  const perm = c.get("permission") as PermissionContext;

  const result = await pushChanges({
    lastPulledSeq: last_pulled_seq,
    changes,
    permission: perm,
  });

  if (!result.ok) {
    return c.json(result, 409);
  }

  return c.json({ ok: true, data: result });
});

export { syncRouter };
