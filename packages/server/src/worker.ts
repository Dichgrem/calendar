import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./auth/auth.routes.js";
import { syncRouter } from "./sync/routes.js";
import { calendarsRouter } from "./routes/calendars.js";
import { eventsRouter } from "./routes/events.js";
import { icsRouter } from "./routes/ics.js";
import { settingsRouter } from "./routes/settings.js";
import { initD1Db } from "./db/client.js";

type Bindings = {
  DB: unknown;
  SESSION_SECRET: string;
  CORS_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => c.env.CORS_ORIGIN ?? origin ?? "*",
    credentials: true,
  }),
);

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

export default app;
