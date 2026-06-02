import { existsSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import "./db/node-init.js";
import { config } from "./config.js";
import { authRouter } from "./auth/auth.routes.js";
import { syncRouter } from "./sync/routes.js";
import { calendarsRouter } from "./routes/calendars.js";
import { eventsRouter } from "./routes/events.js";
import { icsRouter } from "./routes/ics.js";
import { settingsRouter } from "./routes/settings.js";
import { caldavRouter } from "./caldav/routes.js";

const app = new Hono();

app.use("*", async (c, next) => {
  await next();
  // Add DAV header for CalDAV service discovery
  if (c.req.path?.startsWith("/dav") || c.req.path?.startsWith("/.well-known/caldav")) {
    c.res.headers.set("DAV", "1, 2, 3, calendar-access");
  }
});

app.use(
  "*",
  cors({
    origin: config.corsOrigin,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "PROPFIND", "REPORT", "MKCALENDAR"],
  }),
);

app.get("/api/health", (c) => {
  return c.json({ ok: true, data: { status: "ok" } });
});

app.route("/api", authRouter);
app.route("/api/sync", syncRouter);
app.route("/api/calendars", calendarsRouter);
app.route("/api", eventsRouter);
app.route("/api", icsRouter);
app.route("/api", settingsRouter);
app.route("/dav", caldavRouter);

// Well-known CalDAV redirect
app.on("PROPFIND", "/.well-known/caldav", (c) => c.redirect("/dav/", 301));
app.on("PROPFIND", "/.well-known/caldav/", (c) => c.redirect("/dav/", 301));

if (existsSync("./public")) {
  app.use("*", serveStatic({ root: "./public" }));
  app.get("*", serveStatic({ path: "./public/index.html" }));
}

const port = config.port;
console.log(`Server starting on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
