import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware.js";
import {
  listCalendars,
  getCalendar,
  createCalendar,
  updateCalendar,
  deleteCalendar,
} from "../services/calendar.service.js";

const calendarsRouter = new Hono().use(authMiddleware);

calendarsRouter.get("/", async (c) => {
  const perm = c.get("permission");
  const list = await listCalendars(perm.userId);
  return c.json({ ok: true, data: list });
});

calendarsRouter.get("/:id", async (c) => {
  const perm = c.get("permission");
  const cal = await getCalendar(c.req.param("id"), perm.userId);
  if (!cal) {
    return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Calendar not found" } }, 404);
  }
  return c.json({ ok: true, data: cal });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  sourceUrl: z.string().url().optional(),
  sourceType: z.enum(["ics_import", "ics_subscription", "manual"]).optional(),
});

calendarsRouter.post("/", zValidator("json", createSchema), async (c) => {
  const perm = c.get("permission");
  const cal = await createCalendar(c.req.valid("json"), perm.userId);
  return c.json({ ok: true, data: cal }, 201);
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  sourceUrl: z.string().url().nullable().optional(),
});

calendarsRouter.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const perm = c.get("permission");
  const cal = await updateCalendar(c.req.param("id"), c.req.valid("json"), perm);
  if (!cal) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  }
  return c.json({ ok: true, data: cal });
});

calendarsRouter.delete("/:id", async (c) => {
  const perm = c.get("permission");
  const ok = await deleteCalendar(c.req.param("id"), perm);
  if (!ok) {
    return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  }
  return c.json({ ok: true, data: null });
});

export { calendarsRouter };
