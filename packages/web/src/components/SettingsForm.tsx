import { useI18n } from "../hooks/use-i18n";
import type { UserSettings } from "../types";

interface SettingsFormProps {
  settings: UserSettings;
  onUpdate: (s: UserSettings) => void;
}

export function SettingsForm({ settings, onUpdate }: SettingsFormProps) {
  const { t } = useI18n();
  const s = settings;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("settings.language")}</span>
        <select value={s.language}
          onChange={(e) => {
            const lang = e.target.value;
            const next = { ...s, language: lang };
            if (s.dateFormat === "zh" || s.dateFormat === "en") {
              next.dateFormat = lang === "en" ? "en" : "zh";
            }
            onUpdate(next);
          }}
          className="mt-1 block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700">
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("settings.firstDay")}</span>
        <select value={s.firstDayOfWeek}
          onChange={(e) => onUpdate({ ...s, firstDayOfWeek: Number(e.target.value) })}
          className="mt-1 block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700">
          <option value={0}>{t("settings.sunday")}</option>
          <option value={1}>{t("settings.monday")}</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("settings.dateFormat")}</span>
        <select
          value={["zh", "en"].includes(s.dateFormat) ? s.dateFormat : "custom"}
          onChange={(e) => {
            if (e.target.value !== "custom") onUpdate({ ...s, dateFormat: e.target.value });
            else onUpdate({ ...s, dateFormat: "yyyy-MM-dd" });
          }}
          className="mt-1 block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
        >
          <option value="zh">2026年5月</option>
          <option value="en">May 2026</option>
          <option value="custom">{t("settings.customFormat")}（{t("settings.formatHint")}）</option>
        </select>
        {!["zh", "en"].includes(s.dateFormat) && (
          <div className="mt-1.5">
            <input
              type="text"
              value={s.dateFormat}
              onChange={(e) => onUpdate({ ...s, dateFormat: e.target.value })}
              placeholder="yyyy-MM-dd HH:mm:ss"
              className="block w-full border rounded-lg px-2.5 py-1.5 text-sm font-mono bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
            />
          </div>
        )}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={s.showEventTime}
          onChange={(e) => onUpdate({ ...s, showEventTime: e.target.checked })}
          className="accent-neutral-900 dark:accent-white"
        />
        <span className="text-sm dark:text-neutral-200">{t("settings.showEventTime")}</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={s.showLunarCalendar}
          onChange={(e) => onUpdate({ ...s, showLunarCalendar: e.target.checked })}
          className="accent-neutral-900 dark:accent-white"
        />
        <span className="text-sm dark:text-neutral-200">{t("settings.showLunarCalendar")}</span>
      </label>
    </div>
  );
}
