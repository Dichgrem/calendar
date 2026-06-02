import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./auth/auth.routes.js";
import { syncRouter } from "./sync/routes.js";
import { calendarsRouter } from "./routes/calendars.js";
import { eventsRouter } from "./routes/events.js";
import { icsRouter } from "./routes/ics.js";
import { settingsRouter } from "./routes/settings.js";
import { caldavRouter } from "./caldav/routes.js";
import { initD1Db } from "./db/d1.js";

type Bindings = {
  DB: unknown;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  SESSION_SECRET: string;
  CORS_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c, next) => {
  await next();
  if (c.req.path?.startsWith("/dav") || c.req.path?.startsWith("/.well-known/caldav")) {
    c.res.headers.set("DAV", "1, 2, 3, calendar-access");
  }
});

app.use(
  "*",
  cors({
    origin: (origin, c) => c.env.CORS_ORIGIN ?? origin ?? "*",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "PROPFIND", "REPORT", "MKCALENDAR"],
  }),
);

app.onError((err, c) => {
  console.error("Worker error:", err.message);
  return c.json({ ok: false, error: { code: "INTERNAL", message: err.message } }, 500);
});

app.get("/api/health", (c) => {
  return c.json({ ok: true, data: { status: "ok" } });
});

// Initialize D1 database for each request
app.use("*", async (c, next) => {
  initD1Db(c.env.DB);
  await next();
});

app.route("/api", authRouter);
app.route("/api/sync", syncRouter);
app.route("/api/calendars", calendarsRouter);
app.route("/api", eventsRouter);
app.route("/api", icsRouter);
app.route("/api", settingsRouter);
app.route("/dav", caldavRouter);

app.on("PROPFIND", "/.well-known/caldav", (c) => c.redirect("/dav/", 301));
app.on("PROPFIND", "/.well-known/caldav/", (c) => c.redirect("/dav/", 301));

// SPA fallback — serve index.html for non-API routes
app.get("*", async (c) => {
  try {
    const asset = await c.env.ASSETS.fetch(c.req.raw);
    if (asset.status !== 404) return asset;
  } catch (e) {
    if ((e as { status?: number })?.status !== 404) throw e;
  }
  return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
});

export default app;
