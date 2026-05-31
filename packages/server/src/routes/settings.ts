import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware.js";
import {
  backupDatabase,
  listBackups,
  restoreDatabase,
  validateBackupFilename,
  getUserSettings,
  upsertUserSettings,
} from "../services/settings.service.js";
import * as fs from "node:fs";
import * as path from "node:path";

const settingsRouter = new Hono().use(authMiddleware);

settingsRouter.post("/backup", async (c) => {
  const result = backupDatabase();
  if (!result) {
    return c.json(
      { ok: false, error: { code: "INTERNAL", message: "Backup failed" } },
      500,
    );
  }
  return c.json({ ok: true, data: result });
});

settingsRouter.get("/backup/download/:filename", async (c) => {
  const { filename } = c.req.param();
  if (!validateBackupFilename(filename)) {
    return c.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid filename" } },
      400,
    );
  }

  const backupDir = path.resolve(process.env.BACKUP_DIR ?? "./backups");
  const filePath = path.resolve(path.join(backupDir, filename));
  if (!filePath.startsWith(backupDir) || !fs.existsSync(filePath)) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Backup not found" } },
      404,
    );
  }

  const content = fs.readFileSync(filePath);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  return c.body(content);
});

settingsRouter.get("/backups", async (c) => {
  const list = listBackups();
  return c.json({ ok: true, data: list });
});

const restoreSchema = z.object({
  filename: z.string().min(1),
});

settingsRouter.post("/backup/restore", zValidator("json", restoreSchema), async (c) => {
  const { filename } = c.req.valid("json");
  const ok = restoreDatabase(filename);
  if (!ok) {
    return c.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Backup not found" } },
      404,
    );
  }
  return c.json({ ok: true, data: { restored: filename } });
});

settingsRouter.get("/settings", async (c) => {
  const perm = c.get("permission");
  const settings = await getUserSettings(perm.userId);
  return c.json({ ok: true, data: settings });
});

const updateSettingsSchema = z.object({
  timezone: z.string().optional(),
  language: z.enum(["zh-CN", "en"]).optional(),
  defaultReminderBefore: z.number().int().min(0).optional(),
  firstDayOfWeek: z.number().int().min(0).max(6).optional(),
  showCompletedTodos: z.boolean().optional(),
});

settingsRouter.patch(
  "/settings",
  zValidator("json", updateSettingsSchema),
  async (c) => {
    const perm = c.get("permission");
    const settings = await upsertUserSettings(perm.userId, c.req.valid("json"));
    return c.json({ ok: true, data: settings });
  },
);

export { settingsRouter };
