import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Database, Package, PencilSimple, Wrench, User, CalendarDots, FloppyDisk } from "@phosphor-icons/react";
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

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-neutral-100 dark:border-neutral-800">
        <Icon className="size-3.5 text-neutral-400" weight="bold" />
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-4 py-1.5">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { data: calendars } = useCalendars();
  const topBar = useTopBar();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logLevel, setLogLevel] = useState("");
  const [logCount, setLogCount] = useState(200);
  const [logAuto, setLogAuto] = useState(false);

  useEffect(() => {
    api.settings.get().then((res) => {
      setSettings((res as any).data);
    }).catch(() => setError(t("settings.loadFailed"))).finally(() => setLoading(false));
    api.auth.me().then((res: any) => {
      if (res?.data?.username) setAccountUser(res.data.username);
    }).catch(() => {});
  }, []);

  const fetchLogs = async () => {
    try {
      const res: any = await api.logs(logCount, logLevel || undefined);
      if (res?.data?.lines) setLogLines(res.data.lines);
    } catch {}
  };

  useEffect(() => {
    fetchLogs();
    if (!logAuto) return;
    const t = setInterval(fetchLogs, 5000);
    return () => clearInterval(t);
  }, [logAuto, logLevel, logCount]);

  const exportLogs = () => {
    const blob = new Blob([logLines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "calendar-server.log"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-neutral-400">{t("settings.loading")}</p></div>;
  if (error) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-red-500">{error}</p></div>;

  const s = settings ?? { userId: "", language: "zh-CN", firstDayOfWeek: 1, dateFormat: "zh", showLunarCalendar: true } as UserSettings;

  const updateSettings = (next: UserSettings) => {
    setSettings(next);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaveError("");
    try {
      await api.settings.update(s);
      setSettings({ ...s } as UserSettings);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { setSaveError(t("settings.saveError")); }
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
    setBackingUp(true); setBackupResult(null);
    try {
      const res = await api.backup.create();
      setBackupResult((res as any).data);
    } catch (e) { setSaveError(e instanceof Error ? e.message : t("settings.backupFailed")); }
    finally { setBackingUp(false); }
  };

  const handleExportConfig = async () => {
    try {
      const cfg = await api.settings.exportConfig();
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "config.json"; a.click();
      URL.revokeObjectURL(url);
    } catch { setSaveError(t("settings.exportConfigFailed")); }
  };

  return (
    <div className="flex flex-col h-full">
      {topBar?.left && createPortal(<LeftControls />, topBar.left)}
      {topBar?.center && createPortal(<CenterControls />, topBar.center)}
      <div className="flex-1 overflow-auto">
        <div className="max-w-xl mx-auto px-4 py-6 space-y-3">
          {/* Preferences */}
          <Section icon={Wrench} title={t("settings.preferences")}>
            <SettingsForm settings={s} onUpdate={updateSettings} />
          </Section>

          {/* Account */}
          <Section icon={User} title={t("settings.account")}>
            <div>
              <div className="flex items-center justify-between gap-3 py-0.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-neutral-400 shrink-0 w-10">{t("login.username")}</span>
                  {editUsername ? (
                    <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder={accountUser}
                      className="border rounded-lg px-2 py-0.5 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400 w-40" />
                  ) : (
                    <p className="text-sm truncate">{accountUser}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editUsername ? (
                    <>
                      <Button size="sm" onClick={handleChangeUsername} className="h-6 text-xs px-2">{t("settings.save")}</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditUsername(false)} className="h-6 text-xs px-2">{t("settings.cancel")}</Button>
                    </>
                  ) : (
                    <button onClick={() => { setNewUsername(accountUser); setEditUsername(true); }} className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 shrink-0">
                      <PencilSimple className="size-3" weight="bold" />
                    </button>
                  )}
                  <span className="text-[11px] text-neutral-400 mx-1">|</span>
                  {editPassword ? (
                    <>
                      <Button size="sm" onClick={handleChangePassword} className="h-6 text-xs px-2">{t("settings.save")}</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditPassword(false)} className="h-6 text-xs px-2">{t("settings.cancel")}</Button>
                    </>
                  ) : (
                    <button onClick={() => setEditPassword(true)} className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0">
                      {t("settings.changePassword")}
                    </button>
                  )}
                </div>
              </div>

              {editPassword && (
                <div className="pb-1 space-y-1">
                  <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder={t("settings.oldPassword")}
                    className="block w-full border rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400" />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("settings.newPassword")}
                    className="block w-full border rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400" />
                </div>
              )}
              {acctMsg && <p className="text-[11px] text-green-600 pb-1">{acctMsg}</p>}
            </div>
          </Section>
          <Section icon={CalendarDots} title={t("settings.calendars")}>
            <CalendarManagement calendars={calendars} />
          </Section>

          {/* Server URL */}
          {isNative && (
            <Section icon={Wrench} title={t("settings.serverUrl")}>
              <div className="py-0.5 space-y-1.5">
                <input type="url" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="http://192.168.1.100:3000"
                  className="block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400" />
                <p className="text-xs text-neutral-400">{t("settings.serverUrlHint")}</p>
                <Button size="sm" onClick={() => {
                  if (serverUrl) localStorage.setItem("serverUrl", serverUrl.replace(/\/+$/, ""));
                  else localStorage.removeItem("serverUrl");
                  setServerUrlSaved(true); setTimeout(() => setServerUrlSaved(false), 2000);
                }} className="h-7 text-xs">{serverUrlSaved ? t("settings.serverUrlSaved") : t("settings.save")}</Button>
              </div>
            </Section>
          )}

          {/* Data & backup */}
          <Section icon={Database} title={t("settings.backupDb")}>
            <div className="py-0.5 space-y-1.5">
              {backupResult && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  {t("settings.backupDone")} —
                  <button onClick={() => api.backup.download(backupResult.filename)} className="text-blue-500 hover:underline font-medium">
                    {backupResult.filename}
                  </button>
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleBackup} disabled={backingUp} className="flex-1 h-8 text-xs gap-1.5">
                  <Database className="size-3.5" weight="bold" />{backingUp ? t("settings.backingUp") : t("settings.backupDb")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportConfig} className="flex-1 h-8 text-xs gap-1.5">
                  <Package className="size-3.5" weight="bold" />{t("settings.exportConfig")}
                </Button>
              </div>
            </div>
          </Section>

          {/* Server logs */}
          <Section icon={Database} title={t("settings.serverLogs")}>
            <div className="py-0.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <select value={logLevel} onChange={(e) => setLogLevel(e.target.value)}
                  className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700">
                  <option value="">{t("settings.logAll")}</option>
                  <option value="error">Error</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
                <select value={logCount} onChange={(e) => setLogCount(Number(e.target.value))}
                  className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700">
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                </select>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={logAuto} onChange={(e) => setLogAuto(e.target.checked)} />
                  {t("settings.logAutoRefresh")}
                </label>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={fetchLogs} className="h-7 text-xs">{t("settings.logRefresh")}</Button>
                <Button variant="outline" size="sm" onClick={exportLogs} className="h-7 text-xs">{t("settings.logExport")}</Button>
              </div>
              <textarea readOnly value={logLines.join("\n")}
                className="w-full h-48 text-[11px] font-mono border rounded-lg p-2 bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 resize-y focus:outline-none" />
            </div>
          </Section>

          {saveError && <p className="text-sm text-red-500 text-center">{saveError}</p>}

          {/* Spacer for sticky bar */}
          <div className="h-16" />
        </div>
      </div>

      {/* Sticky save bar */}
      <div className={`sticky bottom-0 mx-auto max-w-xl px-4 py-3 transition-all duration-300 ${dirty ? "" : "pointer-events-none opacity-0"}`}>
        <div className="bg-white/90 dark:bg-neutral-900/90 backdrop-blur rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-lg px-4 py-2.5 flex items-center gap-3">
          <p className="text-xs text-neutral-500 flex-1">{saved ? t("settings.saved") : t("settings.unsavedChanges")}</p>
          <Button size="sm" onClick={handleSave} className="h-8 text-xs gap-1.5 px-4">
            <FloppyDisk className="size-3.5" weight="bold" />{t("settings.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
