import { CalendarDots, CaretDown, Database, Package, User, Wrench } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ComponentChildren, ComponentType } from "preact";
import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import { AccountSection } from "../components/AccountSection";
import { CalendarManagement } from "../components/CalendarManagement";
import { useTopBar } from "../components/Layout";
import { SettingsForm } from "../components/SettingsForm";
import { CenterControls, LeftControls } from "../components/TopBarControls";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/use-auth";
import { useCalendars } from "../hooks/use-calendars";
import { useI18n } from "../hooks/use-i18n";
import { savePrefs, useSettings } from "../hooks/use-settings";
import { api } from "../lib/api";
import type { UserSettings } from "../types";

function Section({
  icon: Icon,
  title,
  children,
  collapsible,
  defaultOpen = false,
}: {
  icon: ComponentType<Record<string, unknown>>;
  title: string;
  children: ComponentChildren;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 overflow-hidden">
      {/* biome-ignore lint/a11y/useSemanticElements: collapsible section header */}
      <div
        role="button"
        tabIndex={0}
        className={`flex items-center gap-2 px-4 py-1.5 border-b border-neutral-100 dark:border-neutral-800 ${collapsible ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900" : ""}`}
        onClick={() => collapsible && setOpen(!open)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && collapsible) {
            e.preventDefault();
            setOpen(!open);
          }
        }}
      >
        <Icon className="size-3.5 text-neutral-400" weight="bold" />
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          {title}
        </h2>
        {collapsible && (
          <span
            className="ml-auto text-neutral-400 transition-transform"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          >
            <CaretDown className="size-3" weight="bold" />
          </span>
        )}
      </div>
      {(!collapsible || open) && <div className="px-4 py-1.5">{children}</div>}
    </div>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { data: calendars } = useCalendars();
  const topBar = useTopBar();
  const { data: settings } = useSettings();
  const { user } = useAuth();
  const accountUser = user?.username ?? "";
  const s: UserSettings =
    settings ??
    ({ userId: "", language: "zh-CN", firstDayOfWeek: 1, dateFormat: "zh", showLunarCalendar: true } as UserSettings);
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{ filename: string } | null>(null);
  const [backupError, setBackupError] = useState("");

  // Write UI prefs to localStorage instantly — no debounce, no PATCH.
  // Settings that affect server behavior (auto-backup) go through AutoBackupPanel.
  const updatePrefs = (next: UserSettings) => {
    if (!settings) return;
    const partial: Partial<UserSettings> = {};
    if (next.language !== s.language) partial.language = next.language;
    if (next.firstDayOfWeek !== s.firstDayOfWeek) partial.firstDayOfWeek = next.firstDayOfWeek;
    if (next.dateFormat !== s.dateFormat) partial.dateFormat = next.dateFormat;
    if (next.showLunarCalendar !== s.showLunarCalendar) partial.showLunarCalendar = next.showLunarCalendar;
    if (next.showEventTime !== s.showEventTime) partial.showEventTime = next.showEventTime;
    if (next.defaultCalendarId !== s.defaultCalendarId) partial.defaultCalendarId = next.defaultCalendarId;
    if (Object.keys(partial).length === 0) return;
    savePrefs(partial);
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const handleBackup = async () => {
    setBackingUp(true);
    setBackupResult(null);
    try {
      const res = await api.backup.create();
      setBackupResult(res.data);
    } catch {
      setBackupResult(null);
      setBackupError(t("settings.saveError"));
    } finally {
      setBackingUp(false);
    }
  };

  const handleExportConfig = async () => {
    try {
      const cfg = await api.settings.exportConfig();
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "config.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setBackupError(t("settings.saveError"));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {topBar?.left && createPortal(<LeftControls />, topBar.left)}
      {topBar?.center && createPortal(<CenterControls />, topBar.center)}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
          <Section icon={Wrench} title={t("settings.preferences")}>
            <SettingsForm settings={s} calendars={calendars ?? []} onUpdate={updatePrefs} />
          </Section>
          <Section icon={User} title={t("settings.account")} collapsible defaultOpen>
            <AccountSection username={accountUser} />
          </Section>
          <Section icon={CalendarDots} title={t("settings.calendars")} collapsible defaultOpen>
            <CalendarManagement calendars={calendars} />
          </Section>
          <Section icon={Database} title={t("settings.backupDb")} collapsible defaultOpen>
            <div className="py-0.5 space-y-1.5">
              {backupResult && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  {t("settings.backupDone")} —
                  <button
                    type="button"
                    onClick={() => api.backup.download(backupResult.filename)}
                    className="text-blue-500 hover:underline font-medium"
                  >
                    {backupResult.filename}
                  </button>
                </p>
              )}
              {backupError && <p className="text-xs text-red-500">{backupError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="flex-1 h-8 text-xs gap-1.5"
                >
                  <Database className="size-3.5" weight="bold" />
                  {backingUp ? t("settings.backingUp") : t("settings.backupDb")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportConfig} className="flex-1 h-8 text-xs gap-1.5">
                  <Package className="size-3.5" weight="bold" />
                  {t("settings.exportConfig")}
                </Button>
              </div>
            </div>
          </Section>
          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}
