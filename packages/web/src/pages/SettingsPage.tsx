import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Database, Package } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { useI18n } from "../hooks/use-i18n";
import { useCalendars } from "../hooks/use-calendars";
import { useTopBar } from "../components/Layout";
import { LeftControls, CenterControls } from "../components/TopBarControls";
import { createPortal } from "react-dom";
import { Button } from "../components/ui/button";
import { SettingsForm } from "../components/SettingsForm";
import { CalendarManagement } from "../components/CalendarManagement";
import type { UserSettings } from "../types";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { data: calendars } = useCalendars();
  const topBar = useTopBar();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{ filename: string } | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then((res) => {
        const data = res as unknown as { ok: boolean; data: UserSettings };
        setSettings(data.data);
      })
      .catch(() => setError(t("settings.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-neutral-400">{t("settings.loading")}</p></div>;
  if (error) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-red-500">{error}</p></div>;

  const s = settings ?? {
    userId: "",
    language: "zh-CN",
    firstDayOfWeek: 0,
    showEventTime: true,
    dateFormat: "zh",
  } as UserSettings;

  const handleSave = async () => {
    setSaveError("");
    try {
      await api.settings.update(s);
      setSettings(s as UserSettings);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError(t("settings.saveError"));
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    setBackupResult(null);
    try {
      const res = await api.backup.create();
      const data = (res as { ok: boolean; data: { filename: string } }).data;
      setBackupResult(data);
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
        <div className="max-w-lg mx-auto p-6 dark:text-neutral-200">
          <h1 className="text-2xl font-bold mb-4 dark:text-white">{t("settings.title")}</h1>

          <SettingsForm settings={s} onUpdate={setSettings} />

          <CalendarManagement calendars={calendars} />

          {saveError && <p className="text-sm text-red-500 mb-2">{saveError}</p>}
          <hr className="my-4 border-neutral-200 dark:border-neutral-800" />
          {backupResult && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
              {t("settings.backupDone")} —{" "}
              <button
                onClick={() => api.backup.download(backupResult.filename)}
                className="text-blue-500 hover:underline"
              >
                {backupResult.filename}
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleBackup} disabled={backingUp} className="flex-1 h-8 text-xs gap-1.5">
              <Database className="size-3.5" weight="bold" />
              {backingUp ? t("settings.backingUp") : t("settings.backupDb")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportConfig} className="flex-1 h-8 text-xs gap-1.5">
              <Package className="size-3.5" weight="bold" />
              {t("settings.exportConfig")}
            </Button>
            <Button className="flex-1 h-8 text-xs" onClick={handleSave}>
              {saved ? t("settings.saved") : t("settings.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
