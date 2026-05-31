import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware.js";
import {
  parseIcs,
  buildPreview,
  importIcsToCalendar,
  exportIcs,
} from "../services/ics.service.js";
import { createCalendar } from "../services/calendar.service.js";

const icsRouter = new Hono().use(authMiddleware);

const previewSchema = z.object({
  content: z.string().min(1),
});

icsRouter.post("/ics/preview", zValidator("json", previewSchema), async (c) => {
  const { content } = c.req.valid("json");
  const parsed = parseIcs(content);
  const preview = buildPreview(parsed);
  return c.json({ ok: true, data: preview });
});

const importSchema = z.object({
  content: z.string().min(1),
  calendarId: z.string().optional(),
  calendarName: z.string().optional(),
  selectedUids: z.array(z.string()),
  overwrite: z.boolean().optional().default(false),
});

icsRouter.post("/ics/import", zValidator("json", importSchema), async (c) => {
  const perm = c.get("permission");
  const { content, calendarId, calendarName, selectedUids, overwrite } =
    c.req.valid("json");

  const parsed = parseIcs(content);

  let targetId = calendarId;
  if (!targetId) {
    const cal = await createCalendar(
      {
        name: calendarName ?? parsed.name,
        sourceType: "ics_import",
      },
      perm.userId,
    );
    targetId = cal.id;
  }

  const result = await importIcsToCalendar(
    targetId,
    parsed,
    new Set(selectedUids),
    perm.userId,
    overwrite,
  );

  if (!result) {
    return c.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Access denied" } },
      403,
    );
  }

  return c.json({
    ok: true,
    data: { calendarId: targetId, ...result },
  });
});

const exportQuerySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

icsRouter.get(
  "/calendars/:calendarId/ics/export",
  zValidator("query", exportQuerySchema),
  async (c) => {
    const perm = c.get("permission");
    const { calendarId } = c.req.param();
    const { start, end } = c.req.valid("query");

    const result = await exportIcs(calendarId, start, end, perm.userId);
    if (!result) {
      return c.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Calendar not found" } },
        404,
      );
    }

    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    return c.body(result.content);
  },
);

export { icsRouter };
