import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../hooks/use-i18n";
import { useCalendars } from "../hooks/use-calendars";
import { Button } from "../components/ui/button";
import type { UserSettings, Calendar } from "../types";
import { useNavigate } from "react-router";

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { data: calendars } = useCalendars();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editingCal, setEditingCal] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

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
    timezone: "Asia/Shanghai",
    language: "zh-CN",
    firstDayOfWeek: 0,
    showEventTime: true,
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

  const startEditCal = (cal: Calendar) => {
    setEditingCal(cal.id);
    setEditName(cal.name);
    setEditColor(cal.color);
  };

  const saveCalEdit = async () => {
    if (!editingCal) return;
    await api.calendars.update(editingCal, { name: editName, color: editColor });
    queryClient.invalidateQueries({ queryKey: ["calendars"] });
    setEditingCal(null);
  };

  const deleteCalendar = async (id: string) => {
    await api.calendars.remove(id);
    queryClient.invalidateQueries({ queryKey: ["calendars"] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  if (loading) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-neutral-400">{t("settings.loading")}</p></div>;
  if (error) return <div className="flex flex-col h-full"><p className="p-6 text-sm text-red-500">{error}</p></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="max-w-lg mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">{t("settings.title")}</h1>

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">{t("settings.timezone")}</span>
              <select value={s.timezone} onChange={(e) => setSettings({ ...s, timezone: e.target.value })}
                className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
                <option value="America/New_York">America/New_York (UTC-5)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
                <option value="Europe/London">Europe/London (UTC+0)</option>
                <option value="Europe/Berlin">Europe/Berlin (UTC+1)</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("settings.language")}</span>
              <select value={s.language} onChange={(e) => setSettings({ ...s, language: e.target.value })}
                className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("settings.firstDay")}</span>
              <select value={s.firstDayOfWeek}
                onChange={(e) => setSettings({ ...s, firstDayOfWeek: Number(e.target.value) })}
                className="mt-1 block w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <option value={0}>{t("settings.sunday")}</option>
                <option value={1}>{t("settings.monday")}</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.showEventTime}
                onChange={(e) => setSettings({ ...s, showEventTime: e.target.checked })}
                className="accent-neutral-900 dark:accent-white"
              />
              <span className="text-sm font-medium">{t("settings.showEventTime")}</span>
            </label>
          </div>

          <hr className="mt-8 border-neutral-200 dark:border-neutral-800" />
          <h2 className="font-semibold mt-6 mb-3">{t("settings.calendars")}</h2>
          <div className="space-y-2">
            {calendars?.map((cal) => (
              <div key={cal.id} className="flex items-center gap-2 p-2 border rounded border-neutral-200 dark:border-neutral-700">
                {editingCal === cal.id ? (
                  <>
                    <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)}
                      className="size-6 border rounded cursor-pointer" />
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-800 dark:border-neutral-600" />
                    <button onClick={saveCalEdit} className="size-6 flex items-center justify-center rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600">
                      <Check className="size-4" />
                    </button>
                    <button onClick={() => setEditingCal(null)} className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400">
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="size-4 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                    <span className="flex-1 text-sm truncate">{cal.name}</span>
                    <button onClick={() => startEditCal(cal)} className="size-6 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => deleteCalendar(cal.id)} className="size-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-neutral-400 hover:text-red-600">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {calendars?.length === 0 && (
              <p className="text-sm text-neutral-400">{t("settings.noCalendars")}</p>
            )}
          </div>

          <hr className="mt-8 border-neutral-200 dark:border-neutral-800" />
          <h2 className="font-semibold mt-6 mb-3">{t("settings.dataMgmt")}</h2>
          <Button variant="outline" size="sm" onClick={() => navigate("/import")}>
            {t("settings.importIcs")}
          </Button>

          <hr className="mt-8 border-neutral-200 dark:border-neutral-800" />
          {saveError && <p className="mt-3 text-sm text-red-500">{saveError}</p>}
          <Button className="mt-4" onClick={handleSave}>{saved ? t("settings.saved") : t("settings.save")}</Button>
        </div>
      </div>
    </div>
  );
}
