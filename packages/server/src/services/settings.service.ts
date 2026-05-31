import { eq } from "drizzle-orm";
import { db, getRawConnection } from "../db/client.js";
import { userSettings } from "../db/schema.js";
import type { ID, UserSettings } from "../types.js";
import * as fs from "node:fs";
import * as path from "node:path";

export function getBackupPath(): string {
  return process.env.DATABASE_URL?.replace("file:", "") ?? "./data/calendar.db";
}

export function getBackupDir(): string {
  return process.env.BACKUP_DIR ?? "./backups";
}

export async function backupDatabase(): Promise<{ filename: string; path: string } | null> {
  const dbPath = getBackupPath();
  if (!fs.existsSync(dbPath)) return null;

  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `calendar_backup_${ts}.sqlite`;
  const dest = path.join(backupDir, filename);

  const conn = getRawConnection();
  if (conn) {
    await conn.backup(dest);
  } else {
    fs.copyFileSync(dbPath, dest);
  }
  return { filename, path: dest };
}

export function listBackups(): { filename: string; size: number; createdAt: string }[] {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return [];

  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".sqlite"))
    .map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return {
        filename: f,
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function validateBackupFilename(name: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(name) && !name.includes("..");
}

export function restoreDatabase(filename: string): boolean {
  if (!validateBackupFilename(filename)) return false;

  const backupDir = getBackupDir();
  const src = path.resolve(path.join(backupDir, filename));
  if (!src.startsWith(path.resolve(backupDir))) return false;
  if (!fs.existsSync(src)) return false;

  const dbPath = getBackupPath();
  const tmp = dbPath + ".restore_tmp";

  try {
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dbPath);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      void 0;
    }
  }
  return true;
}

export async function getUserSettings(userId: ID): Promise<UserSettings | null> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));

  if (!row) return null;
  return row as UserSettings;
}

export async function upsertUserSettings(
  userId: ID,
  data: Partial<Omit<UserSettings, "userId">>,
): Promise<UserSettings> {
  await db
    .insert(userSettings)
    .values({
      userId,
      language: data.language ?? "zh-CN",
      firstDayOfWeek: data.firstDayOfWeek ?? 0,
      showEventTime: data.showEventTime ?? true,
    })
    .onConflictDoUpdate({
      target: [userSettings.userId],
      set: {
        language: data.language,
        firstDayOfWeek: data.firstDayOfWeek,
        showEventTime: data.showEventTime,
      },
    });

  return (await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get()) as UserSettings;
}
