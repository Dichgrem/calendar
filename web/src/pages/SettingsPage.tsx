import { CalendarDots, CaretDown, Database, Package, PencilSimple, User, Wrench } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarManagement } from "../components/CalendarManagement";
import { useTopBar } from "../components/Layout";
import { SettingsForm } from "../components/SettingsForm";
import { CenterControls, LeftControls } from "../components/TopBarControls";
import { Button } from "../components/ui/button";
import { useCalendars } from "../hooks/use-calendars";
import { useI18n } from "../hooks/use-i18n";
import { useSettings } from "../hooks/use-settings";
import { api } from "../lib/api";
import { isNative } from "../lib/capacitor";
import type { UserSettings } from "../types";

function Section({
  icon: Icon,
  title,
  children,
  collapsible,
  defaultOpen = false,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
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
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.auth.me(),
  });
  const accountUser = (me as any)?.data?.username ?? "";
  const s: UserSettings =
    settings ??
    ({ userId: "", language: "zh-CN", firstDayOfWeek: 1, dateFormat: "zh", showLunarCalendar: true } as UserSettings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<{ filename: string } | null>(null);
  const [serverUrl, setServerUrl] = useState(localStorage.getItem("serverUrl") || "");
  const [serverUrlSaved, setServerUrlSaved] = useState(false);
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
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem("debugMode") === "1");

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
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendar-server.log";
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateSettings = (next: UserSettings) => {
    queryClient.setQueryData(["settings"], next);
    // Debounce: save after 500ms of no changes
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        await api.settings.update(next);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 2500);
      }
    }, 500);
  };

  const handleChangeUsername = async () => {
    setAcctMsg("");
    try {
      const res: any = await api.auth.changeUsername({ username: newUsername });
      if (res?.ok) {
        queryClient.setQueryData(["me"], (old: any) => ({ ...old, data: { username: newUsername } }));
        setEditUsername(false);
        setAcctMsg(t("settings.saved"));
      } else setAcctMsg(res?.error?.message || t("settings.saveError"));
    } catch {
      setAcctMsg(t("settings.saveError"));
    }
  };

  const handleChangePassword = async () => {
    setAcctMsg("");
    if (newPassword.length < 8) {
      setAcctMsg(t("settings.pwTooShort"));
      return;
    }
    try {
      const res: any = await api.auth.changePassword({ oldPassword, newPassword });
      if (res?.ok) {
        setEditPassword(false);
        setOldPassword("");
        setNewPassword("");
        setAcctMsg(t("settings.saved"));
      } else setAcctMsg(res?.error?.message || t("settings.saveError"));
    } catch (e: any) {
      setAcctMsg(e?.message || t("settings.saveError"));
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    setBackupResult(null);
    try {
      const res = await api.backup.create();
      setBackupResult((res as any).data);
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
          {/* Preferences */}
          <Section icon={Wrench} title={t("settings.preferences")}>
            <SettingsForm settings={s} onUpdate={updateSettings} />
            <div className="flex items-center justify-between py-1 mt-1 border-t border-neutral-100 dark:border-neutral-800">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Debug 模式</span>
              <button
                type="button"
                role="switch"
                aria-checked={debugMode}
                onClick={() => {
                  setDebugMode(!debugMode);
                  localStorage.setItem("debugMode", !debugMode ? "1" : "0");
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${debugMode ? "bg-neutral-900 dark:bg-neutral-300" : "bg-neutral-200 dark:bg-neutral-600"}`}
              >
                <span
                  className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${debugMode ? "translate-x-[18px]" : "translate-x-0.5"}`}
                />
              </button>
            </div>
          </Section>

          {/* Account */}
          <Section icon={User} title={t("settings.account")}>
            <div>
              <div className="flex items-center justify-between gap-3 py-0.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-neutral-400 shrink-0 w-10">{t("login.username")}</span>
                  {editUsername ? (
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder={accountUser}
                      className="border rounded-lg px-2 py-0.5 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400 w-40"
                    />
                  ) : (
                    <p className="text-sm truncate text-neutral-800 dark:text-neutral-200">{accountUser}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editUsername ? (
                    <>
                      <Button size="sm" onClick={handleChangeUsername} className="h-6 text-xs px-2">
                        {t("settings.save")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditUsername(false)}
                        className="h-6 text-xs px-2"
                      >
                        {t("settings.cancel")}
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNewUsername(accountUser);
                        setEditUsername(true);
                      }}
                      className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 shrink-0"
                    >
                      <PencilSimple className="size-3" weight="bold" />
                    </button>
                  )}
                  <span className="text-[11px] text-neutral-400 mx-1">|</span>
                  {editPassword ? (
                    <>
                      <Button size="sm" onClick={handleChangePassword} className="h-6 text-xs px-2">
                        {t("settings.save")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditPassword(false)}
                        className="h-6 text-xs px-2"
                      >
                        {t("settings.cancel")}
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditPassword(true)}
                      className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0"
                    >
                      {t("settings.changePassword")}
                    </button>
                  )}
                </div>
              </div>

              {editPassword && (
                <div className="pb-1 space-y-1">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder={t("settings.oldPassword")}
                    className="block w-full border rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("settings.newPassword")}
                    className="block w-full border rounded-lg px-2.5 py-1 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                </div>
              )}
              {acctMsg && (
                <div className="fixed top-14 right-4 z-50 pointer-events-none">
                  <div className="px-5 py-3 rounded-lg shadow-lg text-base font-semibold transition-all duration-300 bg-green-600 text-white">
                    {acctMsg}
                  </div>
                </div>
              )}
            </div>
          </Section>
          <Section icon={CalendarDots} title={t("settings.calendars")}>
            <CalendarManagement calendars={calendars} />
          </Section>

          {/* Server URL */}
          {isNative && (
            <Section icon={Wrench} title={t("settings.serverUrl")}>
              <div className="py-0.5 space-y-1.5">
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://192.168.1.100:3000"
                  className="block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                />
                <p className="text-xs text-neutral-400">{t("settings.serverUrlHint")}</p>
                <Button
                  size="sm"
                  onClick={() => {
                    if (serverUrl) localStorage.setItem("serverUrl", serverUrl.replace(/\/+$/, ""));
                    else localStorage.removeItem("serverUrl");
                    setServerUrlSaved(true);
                    setTimeout(() => setServerUrlSaved(false), 2000);
                  }}
                  className="h-7 text-xs"
                >
                  {serverUrlSaved ? t("settings.serverUrlSaved") : t("settings.save")}
                </Button>
              </div>
            </Section>
          )}

          {/* Data & backup */}
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

          {/* Server logs — only shown when Debug mode is enabled */}
          {debugMode && (
            <Section icon={Database} title={t("settings.serverLogs")} collapsible>
              <div className="py-0.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                    className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
                  >
                    <option value="">{t("settings.logAll")}</option>
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                  </select>
                  <select
                    value={logCount}
                    onChange={(e) => setLogCount(Number(e.target.value))}
                    className="text-xs border rounded px-1.5 py-0.5 bg-white dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700"
                  >
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={logAuto}
                      onChange={(e) => setLogAuto(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="size-4 rounded border border-neutral-300 dark:border-neutral-500 flex items-center justify-center peer-checked:bg-neutral-700 dark:peer-checked:bg-neutral-300 peer-checked:border-neutral-700 dark:peer-checked:border-neutral-300 transition-colors ">
                      <svg
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-white dark:text-neutral-800 transition-opacity"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {t("settings.logAutoRefresh")}
                  </label>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={fetchLogs} className="h-7 text-xs">
                    {t("settings.logRefresh")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportLogs} className="h-7 text-xs">
                    {t("settings.logExport")}
                  </Button>
                </div>
                <textarea
                  readOnly
                  value={logLines.join("\n")}
                  className="w-full h-48 text-[11px] font-mono border rounded-lg p-2 bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 resize-y focus:outline-none"
                />
              </div>
            </Section>
          )}

          {saveError && <p className="text-sm text-red-500 text-center">{saveError}</p>}

          {/* Spacer for sticky bar */}
          <div className="h-16" />
        </div>
      </div>

      {/* Save toast */}
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
