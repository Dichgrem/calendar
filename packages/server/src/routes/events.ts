import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware.js";
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  createOverride,
} from "../services/event.service.js";

const eventsRouter = new Hono().use(authMiddleware);

const listQuerySchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});

eventsRouter.get(
  "/calendars/:calendarId/events",
  zValidator("query", listQuerySchema),
  async (c) => {
    const perm = c.get("permission");
    const { calendarId } = c.req.param();
    const { start, end } = c.req.valid("query");
    const list = await listEvents(calendarId, start, end, perm.userId);
    return c.json({ ok: true, data: list });
  },
);

eventsRouter.get("/events/:id", async (c) => {
  const perm = c.get("permission");
  const event = await getEvent(c.req.param("id"), perm.userId);
  if (!event) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Event not found" } },
      404,
    );
  }
  return c.json({ ok: true, data: event });
});

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  allDay: z.boolean().optional(),
  rrule: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  location: z.string().optional(),
});

eventsRouter.post(
  "/calendars/:calendarId/events",
  zValidator("json", createSchema),
  async (c) => {
    const perm = c.get("permission");
    const { calendarId } = c.req.param();
    const event = await createEvent(calendarId, c.req.valid("json"), perm.userId);
    if (!event) {
      return c.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Access denied" } },
        403,
      );
    }
    return c.json({ ok: true, data: event }, 201);
  },
);

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  startAt: z.string().min(1).optional(),
  endAt: z.string().min(1).optional(),
  allDay: z.boolean().optional(),
  rrule: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  location: z.string().nullable().optional(),
  deleted: z.boolean().optional(),
});

eventsRouter.patch("/events/:id", zValidator("json", updateSchema), async (c) => {
  const perm = c.get("permission");
  const event = await updateEvent(c.req.param("id"), c.req.valid("json"), perm.userId);
  if (!event) {
    return c.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Access denied" } },
      403,
    );
  }
  return c.json({ ok: true, data: event });
});

eventsRouter.delete("/events/:id", async (c) => {
  const perm = c.get("permission");
  const ok = await deleteEvent(c.req.param("id"), perm.userId);
  if (!ok) {
    return c.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Access denied" } },
      403,
    );
  }
  return c.json({ ok: true, data: null });
});

const overrideSchema = z.object({
  originalDate: z.string().min(1),
  overrideStart: z.string().optional(),
  overrideEnd: z.string().optional(),
  overrideTitle: z.string().optional(),
  deleted: z.boolean().optional(),
});

eventsRouter.post(
  "/events/:id/override",
  zValidator("json", overrideSchema),
  async (c) => {
    const perm = c.get("permission");
    const ok = await createOverride(c.req.param("id"), c.req.valid("json"), perm.userId);
    if (!ok) {
      return c.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Access denied" } },
        403,
      );
    }
    return c.json({ ok: true, data: null }, 201);
  },
);

export { eventsRouter };
