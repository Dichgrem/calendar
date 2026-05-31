import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, Check, X, Download, FileDown } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../hooks/use-i18n";
import { useCalendars } from "../hooks/use-calendars";
import { Button } from "../components/ui/button";
import { ColorSwatchPicker } from "../components/ColorSwatchPicker";
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());

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

  const handleExport = (calendarId: string, calName: string) => {
    const url = api.ics.exportUrl(calendarId);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${calName}.ics`;
    a.click();
  };

  const handleExportSelected = () => {
    calendars?.filter((cal) => exportSelected.has(cal.id)).forEach((cal) => {
      handleExport(cal.id, cal.name);
    });
    setExportOpen(false);
  };

  const toggleExportCal = (id: string) => {
    setExportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExportAll = () => {
    if (!calendars) return;
    setExportSelected((prev) =>
      prev.size === calendars.length ? new Set() : new Set(calendars.map((c) => c.id))
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="max-w-lg mx-auto p-6">
          <h1 className="text-2xl font-bold mb-4">{t("settings.title")}</h1>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-neutral-500">{t("settings.language")}</span>
              <select value={s.language}
                onChange={(e) => {
                  const lang = e.target.value;
                  const next = { ...s, language: lang };
                  if (s.dateFormat === "zh" || s.dateFormat === "en") {
                    next.dateFormat = lang === "en" ? "en" : "zh";
                  }
                  setSettings(next);
                }}
                className="mt-1 block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-neutral-500">{t("settings.firstDay")}</span>
              <select value={s.firstDayOfWeek}
                onChange={(e) => setSettings({ ...s, firstDayOfWeek: Number(e.target.value) })}
                className="mt-1 block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700">
                <option value={0}>{t("settings.sunday")}</option>
                <option value={1}>{t("settings.monday")}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-neutral-500">{t("settings.dateFormat")}</span>
              <select
                value={["zh", "en"].includes(s.dateFormat) ? s.dateFormat : "custom"}
                onChange={(e) => {
                  if (e.target.value !== "custom") setSettings({ ...s, dateFormat: e.target.value });
                  else setSettings({ ...s, dateFormat: "yyyy-MM-dd" });
                }}
                className="mt-1 block w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-neutral-900 dark:border-neutral-700"
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
                    onChange={(e) => setSettings({ ...s, dateFormat: e.target.value })}
                    placeholder="yyyy-MM-dd HH:mm:ss"
                    className="block w-full border rounded-lg px-2.5 py-1.5 text-sm font-mono bg-white dark:bg-neutral-900 dark:border-neutral-700"
                  />
                </div>
              )}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.showEventTime}
                onChange={(e) => setSettings({ ...s, showEventTime: e.target.checked })}
                className="accent-neutral-900 dark:accent-white"
              />
              <span className="text-sm">{t("settings.showEventTime")}</span>
            </label>
          </div>

          <hr className="my-4 border-neutral-200 dark:border-neutral-800" />

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">{t("settings.calendars")}</h2>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => navigate("/import")} className="h-7 text-xs gap-1">
                <Download className="size-3" />{t("settings.importIcs")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                setExportSelected(new Set(calendars?.map((c) => c.id) ?? []));
                setExportOpen(true);
              }} className="h-7 text-xs gap-1">
                <FileDown className="size-3" />{t("settings.exportIcs")}
              </Button>
            </div>
          </div>

          {exportOpen && (
            <div className="mb-3 p-3 border rounded-lg border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500">{t("settings.selectCalendars")}</span>
                <button onClick={toggleExportAll} className="text-xs text-blue-500 hover:underline">
                  {exportSelected.size === calendars?.length ? t("settings.deselectAll") : t("settings.selectAll")}
                </button>
              </div>
              <div className="space-y-1 mb-2">
                {calendars?.map((cal) => (
                  <label key={cal.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSelected.has(cal.id)}
                      onChange={() => toggleExportCal(cal.id)}
                      className="accent-neutral-900 dark:accent-white"
                    />
                    <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                    <span className="text-sm">{cal.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={handleExportSelected} disabled={exportSelected.size === 0} className="h-7 text-xs">
                  {t("settings.exportSelected")} ({exportSelected.size})
                </Button>
                <Button variant="outline" size="sm" onClick={() => setExportOpen(false)} className="h-7 text-xs">
                  {t("settings.cancel")}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {calendars?.map((cal) => (
              <div key={cal.id} className="flex items-center gap-2 p-1.5 border rounded-lg border-neutral-200 dark:border-neutral-700">
                {editingCal === cal.id ? (
                  <>
                    <div className="flex-1 space-y-1.5">
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="w-full text-sm border rounded px-2 py-1 bg-white dark:bg-neutral-800 dark:border-neutral-600" />
                      <ColorSwatchPicker value={editColor} onChange={setEditColor} />
                    </div>
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

          <hr className="my-4 border-neutral-200 dark:border-neutral-800" />
          {saveError && <p className="mb-2 text-sm text-red-500">{saveError}</p>}
          <Button className="w-full" onClick={handleSave}>{saved ? t("settings.saved") : t("settings.save")}</Button>
        </div>
      </div>
    </div>
  );
}
