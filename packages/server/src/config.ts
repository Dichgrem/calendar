export interface Config {
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  backupDir: string;
  sessionDurationMs: number;
  userDefaults: {
    language: string;
    firstDayOfWeek: number;
    showEventTime: boolean;
    dateFormat: string;
    showLunarCalendar: boolean;
  };
}

export const config: Config = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "./data/calendar.db",
  backupDir: process.env.BACKUP_DIR ?? "./backups",
  sessionDurationMs: 30 * 24 * 60 * 60 * 1000,
  userDefaults: {
    language: "zh-CN",
    firstDayOfWeek: 1,
    showEventTime: false,
    dateFormat: "zh",
    showLunarCalendar: true,
  },
};

export function applyConfig(overrides: Partial<Config>) {
  if (overrides.userDefaults) {
    Object.assign(config.userDefaults, overrides.userDefaults);
    delete overrides.userDefaults;
  }
  Object.assign(config, overrides);
}
