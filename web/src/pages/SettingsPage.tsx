import { CalendarDots, CaretDown, Database, Package, User, Wrench } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ComponentChildren, ComponentType } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { AccountSection } from "../components/AccountSection";
import { CalendarManagement } from "../components/CalendarManagement";
import { useTopBar } from "../components/Layout";
import { SettingsForm } from "../components/SettingsForm";
import { CenterControls, LeftControls } from "../components/TopBarControls";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/use-auth";
import { useCalendars } from "../hooks/use-calendars";
import { useI18n } from "../hooks/use-i18n";
import { useSettings } from "../hooks/use-settings";
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{ filename: string } | null>(null);

  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    };
  }, []);

  // Recover unsaved draft on mount
  useEffect(() => {
    const raw = localStorage.getItem("draftSettings");
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as UserSettings;
      if (draft.language && draft.language !== (settings?.language ?? s.language)) {
        // Draft differs from current — auto-save it
        api.settings.update(draft).catch(() => {});
        queryClient.setQueryData(["settings"], draft);
        localStorage.removeItem("draftSettings");
      }
    } catch {
      /* corrupted, ignore */
    }
  }, []);

  const updateSettings = (next: UserSettings) => {
    // Persist draft so crash/refresh doesn't lose changes
    localStorage.setItem("draftSettings", JSON.stringify(next));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api.settings.update(next);
        queryClient.setQueryData(["settings"], next);
        localStorage.removeItem("draftSettings");
        setSaveState("saved");
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
        saveStatusTimer.current = setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("error");
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
        saveStatusTimer.current = setTimeout(() => setSaveState("idle"), 2500);
      }
    }, 500);
  };

  const handleBackup = async () => {
    setBackingUp(true);
    setBackupResult(null);
    try {
      const res = await api.backup.create();
      setBackupResult(res.data);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("settings.backupFailed"));
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
      setSaveError(t("settings.exportConfigFailed"));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {topBar?.left && createPortal(<LeftControls />, topBar.left)}
      {topBar?.center && createPortal(<CenterControls />, topBar.center)}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
          <Section icon={Wrench} title={t("settings.preferences")}>
            <SettingsForm settings={s} onUpdate={updateSettings} />
          </Section>
          <Section icon={User} title={t("settings.account")}>
            <AccountSection username={accountUser} />
          </Section>
          <Section icon={CalendarDots} title={t("settings.calendars")}>
            <CalendarManagement calendars={calendars} />
          </Section>
          <Section icon={Database} title={t("settings.backupDb")}>
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
          {saveError && <p className="text-sm text-red-500 text-center">{saveError}</p>}
          <div className="h-16" />
        </div>
      </div>
      {saveState !== "idle" && (
        <div className="fixed top-14 right-4 z-50 pointer-events-none">
          <div
            className={`px-5 py-3 rounded-lg shadow-lg text-base font-semibold transition-all duration-300 ${
              saveState === "saving"
                ? "bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-800"
                : saveState === "saved"
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
            }`}
          >
            {saveState === "saving"
              ? t("settings.saving")
              : saveState === "saved"
                ? t("settings.saved")
                : t("settings.saveError")}
          </div>
        </div>
      )}
    </div>
  );
}
