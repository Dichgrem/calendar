import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Database, Package, PencilSimple } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { isNative } from "../lib/capacitor";
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
  const [serverUrl, setServerUrl] = useState(localStorage.getItem("serverUrl") || "");
  const [serverUrlSaved, setServerUrlSaved] = useState(false);
  const [accountUser, setAccountUser] = useState("");
  const [editUsername, setEditUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [editPassword, setEditPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [acctMsg, setAcctMsg] = useState("");

  useEffect(() => {
    api.settings.get().then((res) => {
      const data = res as unknown as { ok: boolean; data: UserSettings };
      setSettings(data.data);
    }).catch(() => setError(t("settings.loadFailed"))).finally(() => setLoading(false));

    api.auth.me().then((res: any) => {
      if (res?.data?.username) setAccountUser(res.data.username);
    }).catch(() => {});
  }, []);

  if (loading) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-neutral-400">{t("settings.loading")}</p></div>;
  if (error) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-red-500">{error}</p></div>;

  const s = settings ?? {
    userId: "",
    language: "zh-CN",
    firstDayOfWeek: 1,
    showEventTime: false,
    dateFormat: "zh",
    showLunarCalendar: true,
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

  const handleChangeUsername = async () => {
    setAcctMsg("");
    try {
      const res: any = await api.auth.changeUsername({ username: newUsername });
      if (res?.ok) { setAccountUser(newUsername); setEditUsername(false); setAcctMsg(t("settings.saved")); }
      else setAcctMsg(res?.error?.message || t("settings.saveError"));
    } catch { setAcctMsg(t("settings.saveError")); }
  };

  const handleChangePassword = async () => {
    setAcctMsg("");
    if (newPassword.length < 4) { setAcctMsg(t("settings.pwTooShort")); return; }
    try {
      const res: any = await api.auth.changePassword({ oldPassword, newPassword });
      if (res?.ok) { setEditPassword(false); setOldPassword(""); setNewPassword(""); setAcctMsg(t("settings.saved")); }
      else setAcctMsg(res?.error?.message || t("settings.saveError"));
    } catch { setAcctMsg(t("settings.saveError")); }
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
        <div className="max-w-lg mx-auto p-6 space-y-6 dark:text-neutral-200">
          <h1 className="text-xl font-bold dark:text-white">{t("settings.title")}</h1>

          {/* Preferences */}
          <section>
            <h2 className="text-sm font-semibold mb-3 dark:text-white">{t("settings.preferences")}</h2>
            <SettingsForm settings={s} onUpdate={setSettings} />
          </section>

          {/* Account */}
          <section>
            <h2 className="text-sm font-semibold mb-3 dark:text-white">{t("settings.account")}</h2>
            <div className="space-y-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 border border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-neutral-500">{t("login.username")}</span>
                  {editUsername ? (
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder={accountUser}
                      className="block w-full mt-0.5 border rounded px-2 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    />
                  ) : (
                    <p className="text-sm truncate">{accountUser}</p>
                  )}
                </div>
                {editUsername ? (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" onClick={handleChangeUsername} className="h-7 text-xs">{t("settings.save")}</Button>
                    <Button variant="outline" size="sm" onClick={() => setEditUsername(false)} className="h-7 text-xs">{t("settings.cancel")}</Button>
                  </div>
                ) : (
                  <button onClick={() => { setNewUsername(accountUser); setEditUsername(true); }} className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400">
                    <PencilSimple className="size-3.5" weight="bold" />
                  </button>
                )}
              </div>

              {editPassword && (
                <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder={t("settings.oldPassword")}
                    className="block w-full border rounded px-2 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("settings.newPassword")}
                    className="block w-full border rounded px-2 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={handleChangePassword} className="h-7 text-xs">{t("settings.save")}</Button>
                    <Button variant="outline" size="sm" onClick={() => setEditPassword(false)} className="h-7 text-xs">{t("settings.cancel")}</Button>
                  </div>
                </div>
              )}
              {!editPassword && (
                <button onClick={() => setEditPassword(true)} className="text-xs text-blue-500 hover:underline">{t("settings.changePassword")}</button>
              )}
              {acctMsg && <p className="text-xs text-green-600">{acctMsg}</p>}
            </div>
          </section>

          {/* Calendars */}
          <section>
            <CalendarManagement calendars={calendars} />
          </section>

          {saveError && <p className="text-sm text-red-500">{saveError}</p>}

          {/* Server URL - native only */}
          {isNative && (
            <section>
              <h2 className="text-sm font-semibold mb-3 dark:text-white">{t("settings.serverUrl")}</h2>
              <div className="space-y-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 border border-neutral-100 dark:border-neutral-800">
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://192.168.1.100:3000"
                  className="block w-full border rounded px-2 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
                <p className="text-xs text-neutral-400">{t("settings.serverUrlHint")}</p>
                <Button size="sm" onClick={() => {
                  if (serverUrl) localStorage.setItem("serverUrl", serverUrl.replace(/\/+$/, ""));
                  else localStorage.removeItem("serverUrl");
                  setServerUrlSaved(true);
                  setTimeout(() => setServerUrlSaved(false), 2000);
                }} className="h-7 text-xs">
                  {serverUrlSaved ? t("settings.serverUrlSaved") : t("settings.save")}
                </Button>
              </div>
            </section>
          )}

          <section>
            {backupResult && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                {t("settings.backupDone")} —{" "}
                <button onClick={() => api.backup.download(backupResult.filename)} className="text-blue-500 hover:underline">
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
          </section>
        </div>
      </div>
    </div>
  );
}
