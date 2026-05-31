import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import "./db/node-init.js";
import { authRouter } from "./auth/auth.routes.js";
import { syncRouter } from "./sync/routes.js";
import { calendarsRouter } from "./routes/calendars.js";
import { eventsRouter } from "./routes/events.js";
import { icsRouter } from "./routes/ics.js";
import { settingsRouter } from "./routes/settings.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
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

const port = Number(process.env.PORT) || 3000;
console.log(`Server starting on port ${port}`);
serve({ fetch: app.fetch, port });

export default app;
