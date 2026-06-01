import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware.js";
import { parseIcsContent, buildPreview, importIcsToCalendar, exportIcs, fetchIcsFromUrl } from "../services/ics.service.js";
import { createCalendar } from "../services/calendar.service.js";
import { db } from "../db/client.js";
import { calendars } from "../db/schema.js";
import { eq } from "drizzle-orm";

const icsRouter = new Hono().use(authMiddleware);

const previewSchema = z.object({
  content: z.string().min(1),
});

icsRouter.post("/ics/preview", zValidator("json", previewSchema), async (c) => {
  const { content } = c.req.valid("json");
  const parsed = parseIcsContent(content);
  const preview = buildPreview(parsed);
  return c.json({ ok: true, data: preview });
});

const fetchUrlSchema = z.object({
  url: z.string().url(),
});

icsRouter.post("/ics/fetch-url", zValidator("json", fetchUrlSchema), async (c) => {
  const { url } = c.req.valid("json");
  try {
    const content = await fetchIcsFromUrl(url);
    const parsed = parseIcsContent(content);
    const preview = buildPreview(parsed);
    return c.json({ ok: true, data: { preview, content } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch URL";
    return c.json({ ok: false, error: { code: "FETCH_FAILED", message } }, 400);
  }
});

const importSchema = z.object({
  content: z.string().min(1),
  calendarId: z.string().optional(),
  calendarName: z.string().optional(),
  color: z.string().optional(),
  sourceUrl: z.string().optional(),
  selectedUids: z.array(z.string()),
  overwrite: z.boolean().optional().default(false),
});

icsRouter.post("/ics/import", zValidator("json", importSchema), async (c) => {
  const perm = c.get("permission");
  const { content, calendarId, calendarName, color, sourceUrl, selectedUids, overwrite } = c.req.valid("json");

  let targetId = calendarId;
  const needsCleanup = !targetId;

  try {
    const parsed = parseIcsContent(content);

    if (!targetId) {
      const cal = await createCalendar(
        { name: calendarName ?? parsed.name, color, sourceUrl, sourceType: "ics_subscription" },
        perm.userId,
      );
      targetId = cal.id;
    }

    const result = await importIcsToCalendar(
      targetId, parsed, new Set(selectedUids), perm.userId, overwrite,
    );

    if (!result) {
      if (needsCleanup && targetId) {
        await db.delete(calendars).where(eq(calendars.id, targetId));
      }
      return c.json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
    }

    return c.json({ ok: true, data: { calendarId: targetId, ...result } });
  } catch (err) {
    if (needsCleanup && targetId) {
      await db.delete(calendars).where(eq(calendars.id, targetId));
    }
    const message = err instanceof Error ? err.message : "Import failed";
    return c.json({ ok: false, error: { code: "IMPORT_FAILED", message } }, 500);
  }
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
