import { Hono } from "hono";
import { cors } from "hono/cors";
import { syncRouter } from "./sync/routes.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);

app.route("/api/sync", syncRouter);

app.get("/api/health", (c) => {
  return c.json({ ok: true, data: { status: "ok" } });
});

export default app;
