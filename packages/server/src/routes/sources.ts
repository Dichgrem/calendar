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
        rawCourses: result.rawCourses,
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
  rawCourses: z.array(z.any()).optional(),
  timetable: z.array(z.tuple([z.number(), z.number()])).optional(),
  startDate: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

sourcesRouter.post("/sources/course/import", zValidator("json", importSchema), async (c) => {
  const perm = c.get("permission");
  const { icsContent, calendarName, color, selectedUids, overwrite, username, password, semester, year, rawCourses, timetable, startDate } = c.req.valid("json");

  const parsed = parseIcsContent(icsContent);

  const cal = await createCalendar(
    {
      name: calendarName ?? parsed.name ?? "课表",
      color,
      sourceType: "course_schedule",
    },
    perm.userId,
  );

  const meta: Record<string, unknown> = {};
  if (username) meta.username = username;
  if (semester) meta.semester = semester;
  if (year) meta.year = year;
  if (rawCourses) meta.rawCourses = rawCourses;
  if (timetable) meta.timetable = timetable;
  if (startDate) meta.startDate = startDate;
  if (Object.keys(meta).length > 0) {
    await db.update(calendars).set({ courseMeta: JSON.stringify(meta) }).where(
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

sourcesRouter.post("/sources/course/refresh", zValidator("json", z.object({ calendarId: z.string() })), async (c) => {
  const perm = c.get("permission");
  const { calendarId } = c.req.valid("json");

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

const importAllSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  calendarName: z.string().optional(),
  color: z.string().optional(),
});

sourcesRouter.post("/sources/course/import-all", zValidator("json", importAllSchema), async (c) => {
  const perm = c.get("permission");
  const { username, password, calendarName, color } = c.req.valid("json");

  const pairs = [];
  for (let year = 2023; year <= 2026; year++) {
    for (const semester of ["上", "下"] as const) {
      pairs.push({ year: String(year), semester });
    }
  }

  const cal = await createCalendar(
    {
      name: calendarName ?? "课表",
      color,
      sourceType: "course_schedule",
    },
    perm.userId,
  );

  let totalEvents = 0;
  const allRawCourses: any[] = [];
  const errors: string[] = [];
  let savedTimetable: [number, number][] | undefined;
  let savedYear: string | undefined;
  let savedSemester: string | undefined;

  for (const { year, semester } of pairs) {
    try {
      const result = await fetchCourseData(username, password, semester, year);
      allRawCourses.push(...result.rawCourses);
      if (!savedTimetable) savedTimetable = result.timetable;
      if (!savedYear) { savedYear = year; savedSemester = semester; }
      const parsed = parseIcsContent(result.icsContent);
      await importIcsToCalendar(
        cal.id,
        parsed,
        new Set(parsed.components.map((c) => c.uid)),
        perm.userId,
        false,
      );
      totalEvents += parsed.components.length;
    } catch (err) {
      errors.push(`${year}年${semester}学期: ${err instanceof Error ? err.message : "失败"}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const meta: Record<string, unknown> = {
    username,
    rawCourses: allRawCourses,
  };
  if (savedTimetable) meta.timetable = savedTimetable;
  if (savedYear) { meta.year = savedYear; meta.semester = savedSemester; }
  await db.update(calendars).set({ courseMeta: JSON.stringify(meta) }).where(
    and(eq(calendars.id, cal.id), eq(calendars.ownerId, perm.userId)),
  );

  return c.json({
    ok: true,
    data: {
      calendarId: cal.id,
      eventCount: totalEvents,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
});

export { sourcesRouter };
