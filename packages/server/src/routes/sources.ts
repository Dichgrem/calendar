import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../auth/middleware.js";
import { parseIcsContent, buildPreview, importIcsToCalendar } from "../services/ics.service.js";
import { createCalendar, getCalendar } from "../services/calendar.service.js";
import { fetchCourseData } from "@calendar/plugin-fdzc-course";
import { db } from "../db/client.js";
import { calendars, calendarMembers } from "../db/schema.js";

const sourcesRouter = new Hono().use(authMiddleware);

const previewSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  semester: z.enum(["上", "下"]),
  year: z.string().regex(/^\d{4}$/),
});

sourcesRouter.post("/sources/course/preview", zValidator("json", previewSchema), async (c) => {
  const { username, password, semester, year } = c.req.valid("json");
  try {
    const result = await fetchCourseData(username, password, semester, year);
    const parsed = parseIcsContent(result.icsContent);
    const preview = buildPreview(parsed);
    return c.json({
      ok: true,
      data: {
        preview,
        courses: result.courses,
        startDate: result.startDate,
        timetable: result.timetable,
        icsContent: result.icsContent,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch course data";
    return c.json({ ok: false, error: { code: "FETCH_FAILED", message } }, 400);
  }
});

const importSchema = z.object({
  icsContent: z.string().min(1),
  calendarName: z.string().optional(),
  color: z.string().optional(),
  selectedUids: z.array(z.string()),
  overwrite: z.boolean().optional().default(false),
  username: z.string().optional(),
  password: z.string().optional(),
  semester: z.string().optional(),
  year: z.string().optional(),
});

sourcesRouter.post("/sources/course/import", zValidator("json", importSchema), async (c) => {
  const perm = c.get("permission");
  const { icsContent, calendarName, color, selectedUids, overwrite, username, password, semester, year } = c.req.valid("json");

  const parsed = parseIcsContent(icsContent);

  const cal = await createCalendar(
    {
      name: calendarName ?? parsed.name ?? "课表",
      color,
      sourceType: "course_schedule",
    },
    perm.userId,
  );

  if (username || password || semester || year) {
    const meta = JSON.stringify({ username, password, semester, year });
    await db.update(calendars).set({ courseMeta: meta }).where(
      and(eq(calendars.id, cal.id), eq(calendars.ownerId, perm.userId)),
    );
  }

  await importIcsToCalendar(
    cal.id,
    parsed,
    new Set(selectedUids),
    perm.userId,
    overwrite,
  );

  return c.json({ ok: true, data: { calendarId: cal.id } });
});

sourcesRouter.post("/sources/course/refresh", async (c) => {
  const perm = c.get("permission");
  const { calendarId } = await c.req.json();

  const [cal] = await db
    .select({ courseMeta: calendars.courseMeta, id: calendars.id })
    .from(calendars)
    .innerJoin(calendarMembers, eq(calendars.id, calendarMembers.calendarId))
    .where(
      and(
        eq(calendars.id, calendarId),
        eq(calendarMembers.userId, perm.userId),
      ),
    );

  if (!cal?.courseMeta) {
    return c.json({ ok: false, error: { code: "NO_CREDENTIALS", message: "No stored credentials" } }, 400);
  }

  let meta: { username: string; password: string; semester: string; year: string };
  try {
    meta = JSON.parse(cal.courseMeta);
  } catch {
    return c.json({ ok: false, error: { code: "BAD_META", message: "Invalid stored credentials" } }, 400);
  }

  try {
    const result = await fetchCourseData(meta.username, meta.password, meta.semester, meta.year);
    const parsed = parseIcsContent(result.icsContent);
    await importIcsToCalendar(
      calendarId,
      parsed,
      new Set(parsed.components.map((c) => c.uid)),
      perm.userId,
      true,
    );
    return c.json({ ok: true, data: { eventCount: parsed.components.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return c.json({ ok: false, error: { code: "FETCH_FAILED", message } }, 400);
  }
});

export { sourcesRouter };
