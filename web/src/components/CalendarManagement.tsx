import {
  CaretDown,
  CaretUp,
  Check,
  Clock,
  DownloadSimple,
  FileArrowDown,
  Globe,
  NotePencil,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ColorSwatchPicker } from "../components/ColorSwatchPicker";
import { ImportForm } from "../components/ImportForm";
import { Button } from "../components/ui/button";
import { useCalendarReorder } from "../hooks/use-calendar-reorder";
import { useI18n } from "../hooks/use-i18n";
import { useSettings } from "../hooks/use-settings";
import { api } from "../lib/api";
import type { Calendar } from "../types";

interface CommonCalendar {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  url: string;
  color: string;
}

const COMMON_CALENDARS: CommonCalendar[] = [
  {
    id: "cn-holidays",
    name: "中国节假日",
    nameEn: "Chinese Holidays",
    description: "法定节假日及调休补班",
    descriptionEn: "Public holidays",
    url: "https://cdn.jsdelivr.net/npm/chinese-days/dist/holidays.ics",
    color: "#ef4444",
  },
  {
    id: "cn-festival",
    name: "节日纪念日",
    nameEn: "Festivals",
    description: "传统节日、纪念日",
    descriptionEn: "Traditional festivals",
    url: "https://yangh9.github.io/ChinaCalendar/cal_festival.ics",
    color: "#f59e0b",
  },
  {
    id: "cn-solar-term",
    name: "二十四节气",
    nameEn: "24 Solar Terms",
    description: "立春、雨水、惊蛰等",
    descriptionEn: "Solar terms",
    url: "https://yangh9.github.io/ChinaCalendar/cal_solarTerm.ics",
    color: "#10b981",
  },
];

interface CalendarManagementProps {
  calendars: Calendar[] | undefined;
}

export function CalendarManagement({ calendars }: CalendarManagementProps) {
  const queryClient = useQueryClient();
  const { t, lang } = useI18n();
  const { data: settings } = useSettings();
  const [editingCal, setEditingCal] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [commonCalOpen, setCommonCalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [autoBackupOpen, setAutoBackupOpen] = useState(false);
  const [autoBackupCalendars, setAutoBackupCalendars] = useState<Set<string>>(new Set());
  const [autoBackupInterval, setAutoBackupInterval] = useState(0);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCalName, setNewCalName] = useState("");
  const [newCalColor, setNewCalColor] = useState("#3b82f6");
  const { move } = useCalendarReorder(calendars?.map((c) => c.id) ?? []);

  const importedCommonIds = new Set(
    COMMON_CALENDARS.filter((cal) => calendars?.some((c) => c.sourceUrl === cal.url)).map((cal) => cal.id),
  );

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
    if (!window.confirm(t("settings.confirmDelete"))) return;
    setDeleting(id);
    try {
      await api.calendars.remove(id);
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch {
      setImportError(t("settings.deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };
  const handleExportCal = (id: string, name: string) => {
    const a = document.createElement("a");
    a.href = api.ics.exportUrl(id);
    a.download = `${name}.ics`;
    a.click();
  };
  const toggleExportCal = (id: string) =>
    setExportSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleExportAll = () =>
    calendars &&
    setExportSelected((p) => (p.size === calendars.length ? new Set() : new Set(calendars.map((c) => c.id))));

  const handleImportCommon = async (cal: CommonCalendar) => {
    setImporting((p) => new Set(p).add(cal.id));
    setImportError(null);
    try {
      const res = await api.ics.fetchUrl(cal.url);
      const { preview, content } = (res as any).data;
      await api.ics.import({
        content,
        calendarName: cal.name,
        color: cal.color,
        sourceUrl: cal.url,
        selectedUids: preview.items.map((i: any) => i.uid),
        overwrite: false,
      });
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("import.importFailed"));
    } finally {
      setImporting((p) => {
        const n = new Set(p);
        n.delete(cal.id);
        return n;
      });
    }
  };

  const handleCreateCalendar = async () => {
    if (!newCalName.trim()) return;
    try {
      await api.calendars.create({ name: newCalName.trim(), color: newCalColor });
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      setCreating(false);
      setNewCalName("");
      setNewCalColor("#3b82f6");
    } catch {
      setImportError(t("settings.saveError"));
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-1 mb-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCreating(true);
            setNewCalName("");
            setNewCalColor("#3b82f6");
          }}
          className="h-7 text-xs gap-1"
        >
          <Plus className="size-3" weight="bold" />
          {t("settings.newCalendar")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCommonCalOpen(!commonCalOpen)}
          className="h-7 text-xs gap-1"
        >
          <Globe className="size-3" weight="bold" />
          {t("settings.commonCalendars")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(!importOpen)} className="h-7 text-xs gap-1">
          <DownloadSimple className="size-3" weight="bold" />
          {t("settings.importIcs")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setExportSelected(new Set(calendars?.map((c) => c.id) ?? []));
            setExportOpen(true);
          }}
          className="h-7 text-xs gap-1"
        >
          <FileArrowDown className="size-3" weight="bold" />
          {t("settings.exportIcs")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Load saved settings when opening
            const savedCals = (settings as any)?.autoBackupCalendars;
            setAutoBackupCalendars(savedCals ? new Set(savedCals.split(",").filter(Boolean)) : new Set());
            setAutoBackupInterval((settings as any)?.autoBackupInterval ?? 0);
            setAutoBackupOpen(!autoBackupOpen);
          }}
          className="h-7 text-xs gap-1"
        >
          <Clock className="size-3" weight="bold" />
          {t("settings.autoBackup")}
        </Button>
      </div>

      {/* Create calendar form */}
      {creating && (
        <div className="mb-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCalName}
              onChange={(e) => setNewCalName(e.target.value)}
              placeholder={t("settings.calNamePlaceholder")}
              className="flex-1 text-sm border rounded-lg px-2.5 py-1.5 bg-white dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCalendar();
              }}
            />
            <ColorSwatchPicker value={newCalColor} onChange={setNewCalColor} />
          </div>
          <div className="flex gap-1 mt-2">
            <Button size="sm" onClick={handleCreateCalendar} className="h-7 text-xs">
              {t("settings.create")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreating(false)} className="h-7 text-xs">
              {t("settings.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Common calendars */}
      {commonCalOpen && (
        <div className="mb-3 space-y-1.5">
          {COMMON_CALENDARS.map((cal) => (
            <div
              key={cal.id}
              className="flex items-center gap-2.5 p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50"
            >
              <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium dark:text-white">{lang === "en" ? cal.nameEn : cal.name}</p>
                <p className="text-xs text-neutral-500 truncate">
                  {lang === "en" ? cal.descriptionEn : cal.description}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImportCommon(cal)}
                disabled={importing.has(cal.id) || importedCommonIds.has(cal.id)}
                className="h-7 text-xs shrink-0"
              >
                {importing.has(cal.id)
                  ? t("settings.importing")
                  : importedCommonIds.has(cal.id)
                    ? t("settings.imported")
                    : t("settings.importBtn")}
              </Button>
            </div>
          ))}
          {importError && <p className="text-xs text-red-500">{importError}</p>}
        </div>
      )}

      {/* ICS import form */}
      {importOpen && (
        <div className="mb-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50">
          <ImportForm />
        </div>
      )}

      {/* Export panel */}
      {exportOpen && (
        <div className="mb-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-500">{t("settings.selectCalendars")}</span>
            <button
              type="button"
              onClick={toggleExportAll}
              className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              {exportSelected.size === calendars?.length ? t("settings.deselectAll") : t("settings.selectAll")}
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
            {calendars?.map((cal) => (
              <label key={cal.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={exportSelected.has(cal.id)}
                  onChange={() => toggleExportCal(cal.id)}
                  className="peer sr-only"
                />
                <span className="size-4 rounded border border-neutral-300 dark:border-neutral-500 flex items-center justify-center peer-checked:bg-neutral-700 dark:peer-checked:bg-neutral-300 peer-checked:border-neutral-700 dark:peer-checked:border-neutral-300 transition-colors  shrink-0">
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
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="text-neutral-800 dark:text-neutral-200">{cal.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => {
                const selected = calendars?.filter((c) => exportSelected.has(c.id)) ?? [];
                for (const c of selected) handleExportCal(c.id, c.name);
                setExportOpen(false);
              }}
              disabled={exportSelected.size === 0}
              className="h-7 text-xs"
            >
              {t("settings.exportSelected")} ({exportSelected.size})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(false)} className="h-7 text-xs">
              {t("settings.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Auto backup panel */}
      {autoBackupOpen && (
        <div className="mb-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-500">{t("settings.autoBackupCalendars")}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
            {calendars?.map((cal) => (
              <label key={cal.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={autoBackupCalendars.has(cal.id)}
                  onChange={() => {
                    setAutoBackupCalendars((p) => {
                      const n = new Set(p);
                      n.has(cal.id) ? n.delete(cal.id) : n.add(cal.id);
                      return n;
                    });
                  }}
                  className="peer sr-only"
                />
                <span className="size-4 rounded border border-neutral-300 dark:border-neutral-500 flex items-center justify-center peer-checked:bg-neutral-700 dark:peer-checked:bg-neutral-300 peer-checked:border-neutral-700 dark:peer-checked:border-neutral-300 transition-colors shrink-0">
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-white dark:text-neutral-800"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="text-neutral-800 dark:text-neutral-200">{cal.name}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-neutral-500">{t("settings.autoBackupInterval")}</span>
            <select
              value={autoBackupInterval}
              onChange={(e) => setAutoBackupInterval(Number(e.target.value))}
              className="text-xs border rounded px-2 py-1 bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700"
            >
              <option value={0}>{t("settings.autoBackupOff")}</option>
              <option value={30}>{t("settings.autoBackup30m")}</option>
              <option value={60}>{t("settings.autoBackup1h")}</option>
              <option value={360}>{t("settings.autoBackup6h")}</option>
              <option value={720}>{t("settings.autoBackup12h")}</option>
              <option value={1440}>{t("settings.autoBackup24h")}</option>
            </select>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={async () => {
                await api.settings.update({
                  autoBackupCalendars: [...autoBackupCalendars].join(","),
                  autoBackupInterval,
                } as any);
                queryClient.invalidateQueries({ queryKey: ["settings"] });
                setAutoBackupOpen(false);
              }}
              className="h-7 text-xs"
            >
              {t("settings.save")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAutoBackupOpen(false)} className="h-7 text-xs">
              {t("settings.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Calendar list */}
      <div className="space-y-1">
        {calendars?.map((cal, idx) => (
          <div
            key={cal.id}
            className="flex items-center gap-2 p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            {editingCal === cal.id ? (
              <>
                <div className="flex-1 space-y-1.5">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-sm border rounded-lg px-2 py-1 bg-white dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  />
                  <ColorSwatchPicker value={editColor} onChange={setEditColor} />
                </div>
                <button
                  type="button"
                  onClick={saveCalEdit}
                  aria-label={t("settings.save")}
                  className="size-7 flex items-center justify-center rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
                >
                  <Check className="size-4" weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCal(null)}
                  aria-label={t("settings.cancel")}
                  className="size-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400"
                >
                  <X className="size-4" weight="bold" />
                </button>
              </>
            ) : (
              <>
                <span className="size-3.5 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="flex-1 text-sm truncate text-neutral-800 dark:text-neutral-200">{cal.name}</span>
                <button
                  type="button"
                  onClick={() => move(idx, idx - 1)}
                  disabled={idx === 0}
                  className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 disabled:opacity-30"
                  title="上移"
                >
                  <CaretUp className="size-3.5" weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, idx + 1)}
                  disabled={idx === calendars.length - 1}
                  className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 disabled:opacity-30"
                  title="下移"
                >
                  <CaretDown className="size-3.5" weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => startEditCal(cal)}
                  className="size-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400"
                >
                  <NotePencil className="size-3.5" weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteCalendar(cal.id)}
                  disabled={deleting === cal.id}
                  className={`size-7 flex items-center justify-center rounded-lg text-neutral-400 ${deleting === cal.id ? "opacity-50" : "hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600"}`}
                >
                  <Trash className="size-3.5" weight="bold" />
                </button>
              </>
            )}
          </div>
        ))}
        {calendars?.length === 0 && <p className="text-sm text-neutral-400 py-2">{t("settings.noCalendars")}</p>}
      </div>
    </div>
  );
}
