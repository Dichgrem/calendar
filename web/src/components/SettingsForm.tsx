import type { ComponentChildren } from "preact";
import { useI18n } from "../hooks/use-i18n";
import type { UserSettings } from "../types";

interface SettingsFormProps {
  settings: UserSettings;
  onUpdate: (s: UserSettings) => void;
}

export function SettingsForm({ settings, onUpdate }: SettingsFormProps) {
  const { t } = useI18n();
  const s = settings;

  const Row = ({ label, children }: { label: string; children: ComponentChildren }) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-neutral-600 dark:text-neutral-400 shrink-0 truncate max-w-[40%]">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );

  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      <Row label={t("settings.language")}>
        <select
          value={s.language}
          onChange={(e) => {
            const lang = e.currentTarget.value;
            const next = { ...s, language: lang };
            if (s.dateFormat === "zh" || s.dateFormat === "en") {
              next.dateFormat = lang === "en" ? "en" : "zh";
            }
            onUpdate(next);
          }}
          className="text-sm border rounded-lg px-2.5 py-1.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        >
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </Row>

      <Row label={t("settings.firstDay")}>
        <select
          value={s.firstDayOfWeek}
          onChange={(e) => onUpdate({ ...s, firstDayOfWeek: Number(e.currentTarget.value) })}
          className="text-sm border rounded-lg px-2.5 py-1.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        >
          <option value={0}>{t("settings.sunday")}</option>
          <option value={1}>{t("settings.monday")}</option>
        </select>
      </Row>

      <Row label={t("settings.dateFormat")}>
        <div className="flex items-center gap-1.5">
          <select
            value={["zh", "en"].includes(s.dateFormat) ? s.dateFormat : "custom"}
            onChange={(e) => {
              if (e.currentTarget.value !== "custom") onUpdate({ ...s, dateFormat: e.currentTarget.value });
              else onUpdate({ ...s, dateFormat: "yyyy-MM-dd" });
            }}
            className="text-sm border rounded-lg px-2.5 py-1.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
          >
            <option value="zh">2026年5月</option>
            <option value="en">May 2026</option>
            <option value="custom">{t("settings.customFormat")}</option>
          </select>
          {!["zh", "en"].includes(s.dateFormat) && (
            <input
              type="text"
              value={s.dateFormat}
              onChange={(e) => onUpdate({ ...s, dateFormat: e.currentTarget.value })}
              placeholder="yyyy-MM-dd"
              className="w-36 text-sm border rounded-lg px-2 py-1.5 font-mono bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
          )}
        </div>
      </Row>

      <Row label={t("settings.showLunarCalendar")}>
        <Toggle checked={s.showLunarCalendar} onChange={(v) => onUpdate({ ...s, showLunarCalendar: v })} />
      </Row>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-neutral-900 dark:bg-neutral-300" : "bg-neutral-200 dark:bg-neutral-600"}`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-white dark:bg-neutral-300 shadow-sm transition-transform mt-0.5 ${checked ? "translate-x-[18px] dark:bg-neutral-900" : "translate-x-0.5"}`}
      />
    </button>
  );
}
