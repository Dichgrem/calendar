import { Hono } from "hono";
import { cors } from "hono/cors";
import { syncRouter } from "./sync/routes.js";
import { calendarsRouter } from "./routes/calendars.js";
import { eventsRouter } from "./routes/events.js";
import { todosRouter } from "./routes/todos.js";
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

app.route("/api/sync", syncRouter);
app.route("/api/calendars", calendarsRouter);
app.route("/api", eventsRouter);
app.route("/api", todosRouter);
app.route("/api", icsRouter);
app.route("/api", settingsRouter);

app.get("/api/health", (c) => {
  return c.json({ ok: true, data: { status: "ok" } });
});

export default app;
